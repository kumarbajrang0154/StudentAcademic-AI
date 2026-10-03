import { prisma } from "@student-academic-ai/database";
import { RiskCategory, InterventionStatus } from "@prisma/client";
import { findInterventionSlot } from "@student-academic-ai/core";

/**
 * Ensures exactly one active EscalationCase exists when a student is CRITICAL in >= 3 courses.
 * Called from BOTH recomputeEnrollment and recomputeCourseEnrollments.
 *
 * Idempotent:
 * - If an OPEN or ESCALATED case exists, do nothing.
 * - When dropping below 3 critical courses, do not auto-close (HOD resolves manually).
 */
export async function ensureEscalationCase(studentId: string): Promise<void> {
  const criticalEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      studentId,
      riskCategory: RiskCategory.CRITICAL,
    },
    select: { id: true, courseId: true },
  });

  if (criticalEnrollments.length < 3) {
    return;
  }

  // Check if an OPEN or ESCALATED case already exists
  const existingCase = await prisma.escalationCase.findFirst({
    where: {
      studentId,
      status: { in: ["OPEN", "ESCALATED"] },
    },
  });

  if (existingCase) {
    return;
  }

  // Create Tier-1 system escalation case
  await prisma.escalationCase.create({
    data: {
      studentId,
      tier: 1,
      status: "OPEN",
      severity: "STANDARD",
      reason: `Critical in ${criticalEnrollments.length} courses`,
      createdById: null, // System-initiated
    },
  });
}

/**
 * Guardian messaging stub for Module 8 (Parent Gateway).
 * Clearly marked hook that logs deferred dispatch.
 */
export function dispatchGuardianMessageStub(
  studentId: string,
  channels: string[],
  severity: string,
): void {
  // TODO: Guardian dispatch deferred to parent gateway module (Module 8)
  console.log(
    `[GUARDIAN_GATEWAY_HOOK] guardian dispatch deferred to parent gateway module for student ${studentId} via channels [${channels.join(
      ", ",
    )}] (severity: ${severity})`,
  );
}

export interface EscalateOptions {
  studentId: string;
  reason?: string;
  severity?: "STANDARD" | "SEVERE";
  triggerChannels?: ("IN_APP" | "WHATSAPP" | "SMS" | "EMAIL")[];
  actorId: string;
}

export interface EscalateResult {
  jobId: string;
  status: string;
  estimatedDispatchMs: number;
  deduplicated?: boolean;
}

/**
 * Dispatches an escalation case, sends notifications, reserves calendar hold,
 * and tracks background progress via DispatchJob.
 */
export async function triggerEscalationDispatch(
  options: EscalateOptions,
): Promise<EscalateResult> {
  const { studentId, reason, severity = "STANDARD", triggerChannels = ["IN_APP"], actorId } = options;

  // 1. Check for active case or create one
  let escalationCase = await prisma.escalationCase.findFirst({
    where: {
      studentId,
      status: { in: ["OPEN", "ESCALATED"] },
    },
    include: {
      dispatchJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // 2. 24-hour idempotency check
  if (
    escalationCase &&
    escalationCase.status === "ESCALATED" &&
    escalationCase.dispatchedAt &&
    escalationCase.dispatchedAt >= oneDayAgo &&
    escalationCase.dispatchJobs.length > 0
  ) {
    const latestJob = escalationCase.dispatchJobs[0]!;
    return {
      jobId: latestJob.id,
      status: latestJob.status,
      estimatedDispatchMs: latestJob.estimatedMs,
      deduplicated: true,
    };
  }

  if (!escalationCase) {
    escalationCase = await prisma.escalationCase.create({
      data: {
        studentId,
        tier: 1,
        status: "OPEN",
        severity,
        reason: reason || "Tier-1 Administrative Escalation",
        createdById: actorId,
        triggerChannels,
      },
      include: {
        dispatchJobs: true,
      },
    });
  }

  // 3. Create DispatchJob in QUEUED state
  const dispatchJob = await prisma.dispatchJob.create({
    data: {
      caseId: escalationCase.id,
      status: "QUEUED",
      estimatedMs: 1500,
    },
  });

  // 4. Execute dispatch workflow (synchronous within request lifecycle, < 2s limit)
  try {
    await prisma.dispatchJob.update({
      where: { id: dispatchJob.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: {
        department: true,
        mentorAssignmentsAsStudent: {
          where: { active: true },
          include: { mentor: true },
        },
      },
    });

    if (!student) {
      throw new Error(`Student ${studentId} not found`);
    }

    let notificationsSent = 0;
    const previousStatus = escalationCase.status;

    // Recipient A: Assigned Mentor
    const activeMentor = student.mentorAssignmentsAsStudent[0]?.mentor;
    if (activeMentor) {
      await prisma.notification.create({
        data: {
          userId: activeMentor.id,
          channel: "IN_APP",
          type: "ESCALATION_ALERT",
          status: "SENT",
          sentAt: new Date(),
          caseId: escalationCase.id,
          link: `/mentor/mentees/${studentId}`,
          payload: {
            caseId: escalationCase.id,
            studentId,
            studentName: student.name,
            severity,
            reason: reason || "Administrative Tier-1 Escalation",
            message: `Administrative escalation triggered for mentee ${student.name}.`,
          },
        },
      });
      notificationsSent++;
    }

    // Recipient B: HOD of the student's department
    if (student.departmentId) {
      const hodUser = await prisma.user.findFirst({
        where: { role: "HOD", departmentId: student.departmentId },
      });
      if (hodUser) {
        await prisma.notification.create({
          data: {
            userId: hodUser.id,
            channel: "IN_APP",
            type: "ESCALATION_ALERT",
            status: "SENT",
            sentAt: new Date(),
            caseId: escalationCase.id,
            link: `/admin/escalations`,
            payload: {
              caseId: escalationCase.id,
              studentId,
              studentName: student.name,
              severity,
              reason: reason || "Administrative Tier-1 Escalation",
              message: `Tier-1 escalation case initiated for ${student.name}.`,
            },
          },
        });
        notificationsSent++;
      }
    }

    // Recipient C: Institutional Welfare Cell Notification
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });
    if (adminUser) {
      await prisma.notification.create({
        data: {
          userId: adminUser.id,
          channel: "IN_APP",
          type: "WELFARE_CELL_ESCALATION",
          status: "SENT",
          sentAt: new Date(),
          caseId: escalationCase.id,
          link: `/admin/escalations`,
          payload: {
            caseId: escalationCase.id,
            studentId,
            studentName: student.name,
            severity,
            cell: "Student Welfare Cell",
            message: `Welfare intervention alert: Escalation triggered for ${student.name}.`,
          },
        },
      });
      notificationsSent++;
    }

    // Calendar Hold: ONE intervention using findInterventionSlot
    let holdInterventionId: string | undefined = undefined;
    if (activeMentor) {
      // Find timetable slots and existing interventions
      const existingInterventions = await prisma.intervention.findMany({
        where: {
          mentorId: activeMentor.id,
          scheduledFor: { gte: new Date() },
          status: { in: [InterventionStatus.SCHEDULED] },
        },
        select: { scheduledFor: true, durationMin: true },
      });

      const timetableSlots = await prisma.timetableSlot.findMany({
        take: 10,
        select: { dayOfWeek: true, startTime: true, endTime: true },
      });

      const slotResponse = findInterventionSlot({
        timetableSlots: timetableSlots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        existingInterventions: existingInterventions.map((i) => ({
          scheduledAt: i.scheduledFor,
          durationMin: i.durationMin,
        })),
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      });

      const holdDate = slotResponse.slot
        ? slotResponse.slot.slotStart
        : new Date(Date.now() + 48 * 60 * 60 * 1000);

      const holdIntervention = await prisma.intervention.create({
        data: {
          studentId,
          mentorId: activeMentor.id,
          title: "Tier-1 Escalation Academic Support Hold",
          description: `Calendar hold initiated via administrative escalation: ${reason || "Academic review"}`,
          status: InterventionStatus.SCHEDULED,
          scheduledFor: holdDate,
          scheduledAt: holdDate,
          durationMin: 30,
          createdById: actorId,
          notes: `Automated calendar hold for escalation case ${escalationCase.id}`,
        },
      });
      holdInterventionId = holdIntervention.id;
    }

    // Guardian message hook
    dispatchGuardianMessageStub(studentId, triggerChannels, severity);

    // Update case to ESCALATED
    await prisma.escalationCase.update({
      where: { id: escalationCase.id },
      data: {
        status: "ESCALATED",
        severity,
        triggerChannels,
        dispatchedAt: new Date(),
        dispatchedById: actorId,
      },
    });

    // Write AuditLog entry
    await prisma.auditLog.create({
      data: {
        entity: "EscalationCase",
        entityId: escalationCase.id,
        previousValue: { status: previousStatus },
        newValue: {
          status: "ESCALATED",
          severity,
          bypassRequested: severity === "SEVERE",
        },
        modifiedById: actorId,
        justification: `EscalationTriggered: ${reason || "Tier-1 Administrative Escalation"}`,
      },
    });

    // Complete the DispatchJob
    await prisma.dispatchJob.update({
      where: { id: dispatchJob.id },
      data: {
        status: "DONE",
        completedAt: new Date(),
        notificationsCount: notificationsSent,
        calendarHoldCreated: Boolean(holdInterventionId),
        interventionId: holdInterventionId,
      },
    });

    return {
      jobId: dispatchJob.id,
      status: "DONE",
      estimatedDispatchMs: 1500,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.dispatchJob.update({
      where: { id: dispatchJob.id },
      data: {
        status: "FAILED",
        error: errorMsg,
      },
    }).catch(() => {});

    throw err;
  }
}
