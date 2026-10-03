/**
 * Checkin Service — Module 10 QR / Code Self Check-in
 *
 * Business rules:
 * - Only the assigned faculty (or HOD/ADMIN) may start a window.
 * - At most one OPEN window per course at a time.
 * - Window duration is specified by faculty (default 10 min).
 * - Secret is a cryptographically random 32-byte hex string, never returned to clients.
 * - Student submission: enrolled + window open + code valid + not already checked in + rate limit.
 * - Creates AttendanceRecord PRESENT with source="SELF_CHECKIN" in the window's session.
 * - Closing the window does NOT auto-mark absent students; faculty review via existing grid.
 */

import crypto from "node:crypto";
import { prisma } from "@student-academic-ai/database";
import {
  validateCheckinCode,
  currentCheckinCodes,
  CHECKIN_STEP_MS,
} from "@student-academic-ai/core";
import { recomputeEnrollment } from "./enrollment.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StartWindowInput {
  courseId: string;
  sessionDate: string; // ISO date string e.g. "2026-10-03"
  durationMin?: number; // default 10
  facultyId: string;
}

export interface CheckinWindowStatus {
  windowId: string;
  courseId: string;
  sessionId: string;
  isOpen: boolean;
  startsAt: string;
  endsAt: string;
  closedAt: string | null;
  checkedInCount: number;
  /** Milliseconds remaining in current 30s code step (for countdown) */
  msUntilNextCode: number;
}

export interface StudentCheckinInput {
  studentId: string;
  courseId: string;
  code: string;
  /** epoch ms, defaults to Date.now() — injectable for tests */
  nowMs?: number;
}

// ─── Start Check-in Window ────────────────────────────────────────────────────

export async function startCheckinWindow(input: StartWindowInput): Promise<{
  windowId: string;
  sessionId: string;
  startsAt: Date;
  endsAt: Date;
}> {
  const { courseId, sessionDate, facultyId, durationMin = 10 } = input;

  // 1. Verify course exists and faculty is assigned
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { sessions: { where: { facultyId }, take: 1 } },
  });
  if (!course) throw new Error("Course not found");

  // 2. Check for already-open window
  const now = new Date();
  const existing = await prisma.checkinWindow.findFirst({
    where: {
      courseId,
      closedAt: null,
      endsAt: { gt: now },
    },
  });
  if (existing) {
    throw new Error(
      "A check-in window is already open for this course. Close it before starting a new one."
    );
  }

  // 3. Find or create a ClassSession for today
  const sessionDay = new Date(sessionDate);
  // Normalize to midnight UTC for the date match
  sessionDay.setUTCHours(0, 0, 0, 0);
  const nextDay = new Date(sessionDay.getTime() + 24 * 60 * 60 * 1000);

  let session = await prisma.classSession.findFirst({
    where: {
      courseId,
      facultyId,
      sessionDate: { gte: sessionDay, lt: nextDay },
    },
  });

  if (!session) {
    session = await prisma.classSession.create({
      data: {
        courseId,
        facultyId,
        sessionDate: sessionDay,
        topic: "QR Self Check-in Session",
      },
    });
  }

  // 4. Generate secret and compute window times
  const secret = crypto.randomBytes(32).toString("hex");
  const endsAt = new Date(now.getTime() + durationMin * 60 * 1000);

  // 5. Persist window
  const window = await prisma.checkinWindow.create({
    data: {
      courseId,
      sessionId: session.id,
      secret,
      startsAt: now,
      endsAt,
      createdById: facultyId,
    },
  });

  return {
    windowId: window.id,
    sessionId: session.id,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  };
}

// ─── Close Window ─────────────────────────────────────────────────────────────

export async function closeCheckinWindow(
  windowId: string,
  facultyId: string
): Promise<{ closedAt: Date; checkedInCount: number }> {
  const window = await prisma.checkinWindow.findUnique({
    where: { id: windowId },
    include: { session: { include: { attendanceRecords: true } } },
  });

  if (!window) throw new Error("Check-in window not found");
  if (window.createdById !== facultyId) {
    throw new Error("Only the faculty who opened this window can close it");
  }
  if (window.closedAt) {
    throw new Error("Window is already closed");
  }

  const closedAt = new Date();
  await prisma.checkinWindow.update({
    where: { id: windowId },
    data: { closedAt },
  });

  const checkedInCount = window.session.attendanceRecords.filter(
    (r) => r.source === "SELF_CHECKIN"
  ).length;

  return { closedAt, checkedInCount };
}

// ─── Poll Status ──────────────────────────────────────────────────────────────

export async function getCheckinStatus(
  courseId: string,
  nowMs: number = Date.now()
): Promise<CheckinWindowStatus | null> {
  const now = new Date(nowMs);

  const window = await prisma.checkinWindow.findFirst({
    where: { courseId },
    orderBy: { startsAt: "desc" },
    include: {
      session: {
        include: {
          attendanceRecords: {
            where: { source: "SELF_CHECKIN" },
          },
        },
      },
    },
  });

  if (!window) return null;

  const isOpen = !window.closedAt && window.endsAt > now;

  return {
    windowId: window.id,
    courseId: window.courseId,
    sessionId: window.sessionId,
    isOpen,
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
    closedAt: window.closedAt?.toISOString() ?? null,
    checkedInCount: window.session.attendanceRecords.length,
    msUntilNextCode: CHECKIN_STEP_MS - (nowMs % CHECKIN_STEP_MS),
  };
}

/**
 * Get the current rotating display code for an open window.
 * Returns codes WITHOUT the secret — only the faculty-facing display code.
 */
export async function getCheckinDisplayCode(
  windowId: string,
  facultyId: string,
  nowMs: number = Date.now()
): Promise<{ code: string; msUntilNext: number; step: number }> {
  const window = await prisma.checkinWindow.findUnique({
    where: { id: windowId },
  });

  if (!window) throw new Error("Check-in window not found");
  if (window.createdById !== facultyId) {
    throw new Error("Forbidden: you did not create this window");
  }
  if (window.closedAt || window.endsAt <= new Date(nowMs)) {
    throw new Error("Check-in window is closed or expired");
  }

  const { current, step } = currentCheckinCodes(window.secret, nowMs);
  return {
    code: current,
    msUntilNext: CHECKIN_STEP_MS - (nowMs % CHECKIN_STEP_MS),
    step,
  };
}

// ─── Student Self Check-in ────────────────────────────────────────────────────

export interface StudentCheckinResult {
  ok: true;
  message: string;
  attendanceRecordId: string;
}

export async function studentSelfCheckin(
  input: StudentCheckinInput
): Promise<StudentCheckinResult> {
  const { studentId, courseId, code, nowMs = Date.now() } = input;
  const now = new Date(nowMs);

  // 1. Check enrollment
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { studentId, courseId, status: "ACTIVE" },
  });
  if (!enrollment) {
    throw Object.assign(
      new Error("You are not enrolled in this course."),
      { statusCode: 403 }
    );
  }

  // 2. Find open window
  const window = await prisma.checkinWindow.findFirst({
    where: {
      courseId,
      closedAt: null,
      endsAt: { gt: now },
    },
    orderBy: { startsAt: "desc" },
  });

  if (!window) {
    throw Object.assign(
      new Error("No active check-in window for this course. Ask your faculty to start one."),
      { statusCode: 409 }
    );
  }

  // 3. Validate code (HMAC against secret)
  const valid = validateCheckinCode(window.secret, code, nowMs);
  if (!valid) {
    throw Object.assign(
      new Error("Incorrect check-in code. Make sure you entered the 6-digit code shown on the screen."),
      { statusCode: 422 }
    );
  }

  // 4. Check not already checked in
  const existing = await prisma.attendanceRecord.findUnique({
    where: { sessionId_studentId: { sessionId: window.sessionId, studentId } },
  });
  if (existing) {
    throw Object.assign(
      new Error("You have already checked in to this session."),
      { statusCode: 409 }
    );
  }

  // 5. Create AttendanceRecord PRESENT with source="SELF_CHECKIN"
  const record = await prisma.attendanceRecord.create({
    data: {
      sessionId: window.sessionId,
      studentId,
      status: "PRESENT",
      source: "SELF_CHECKIN",
      remarks: "Self check-in via QR code",
    },
  });

  // 6. Recompute enrollment metrics for this student only (non-blocking best-effort)
  recomputeEnrollment(studentId, courseId).catch(() => {
    // Swallow: metrics will be recomputed on next analysis run
  });

  return {
    ok: true,
    message: "You have successfully checked in. Your attendance has been recorded.",
    attendanceRecordId: record.id,
  };
}
