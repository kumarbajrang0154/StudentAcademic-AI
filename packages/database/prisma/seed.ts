import {
  PrismaClient,
  Role,
  AttendanceStatus,
  InterventionStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding for Student Academic AI...");

  // Clean existing data in reverse order of foreign keys
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.escalationCase.deleteMany();
  await prisma.guardianContact.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.intervention.deleteMany();
  await prisma.mentorAssignment.deleteMany();
  await prisma.questionScore.deleteMany();
  await prisma.studentScore.deleteMany();
  await prisma.assessmentQuestion.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.coPoMapping.deleteMany();
  await prisma.programOutcome.deleteMany();
  await prisma.courseOutcome.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.classSession.deleteMany();
  await prisma.timetableSlot.deleteMany();
  await prisma.courseEnrollment.deleteMany();
  await prisma.curriculumUnit.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  // 1. Department
  const department = await prisma.department.create({
    data: {
      name: "Computer Science and Engineering",
      code: "CSE",
    },
  });
  console.log(`✓ Created Department: ${department.name} (${department.code})`);

  // Program Outcomes (PO1, PO2)
  const po1 = await prisma.programOutcome.create({
    data: {
      departmentId: department.id,
      code: "PO1",
      description:
        "Apply engineering fundamentals and mathematical principles to compute solutions.",
    },
  });

  // 2. HOD
  const hod = await prisma.user.create({
    data: {
      email: "hod.cse@university.edu",
      name: "Dr. Alan Turing",
      role: Role.HOD,
      departmentId: department.id,
    },
  });
  console.log(`✓ Created HOD: ${hod.name}`);

  // 3. Faculty (2 members)
  const faculty1 = await prisma.user.create({
    data: {
      email: "faculty.shannon@university.edu",
      name: "Prof. Claude Shannon",
      role: Role.FACULTY,
      departmentId: department.id,
    },
  });

  const faculty2 = await prisma.user.create({
    data: {
      email: "faculty.hopper@university.edu",
      name: "Prof. Grace Hopper",
      role: Role.FACULTY,
      departmentId: department.id,
    },
  });
  console.log(`✓ Created 2 Faculty: ${faculty1.name}, ${faculty2.name}`);

  // 4. Mentor (1 member)
  const mentor = await prisma.user.create({
    data: {
      email: "mentor.knuth@university.edu",
      name: "Dr. Donald Knuth",
      role: Role.MENTOR,
      departmentId: department.id,
    },
  });
  console.log(`✓ Created Mentor: ${mentor.name}`);

  // 5. Students (40 students)
  const students: { id: string; name: string; email: string }[] = [];
  for (let i = 1; i <= 40; i++) {
    const padded = String(i).padStart(2, "0");
    const student = await prisma.user.create({
      data: {
        email: `student${padded}@university.edu`,
        name: `Student ${padded}`,
        role: Role.STUDENT,
        departmentId: department.id,
      },
    });
    students.push(student);

    // Assign mentor to each student
    await prisma.mentorAssignment.create({
      data: {
        mentorId: mentor.id,
        studentId: student.id,
        active: true,
      },
    });

    // Add guardian contact
    await prisma.guardianContact.create({
      data: {
        studentId: student.id,
        phone: `+1-555-01${padded}`,
        consentGiven: true,
        consentAt: new Date(),
      },
    });
  }
  console.log(`✓ Created 40 Students and assigned to Mentor ${mentor.name}`);

  // 6. Courses (3 courses)
  const coursesData = [
    {
      code: "CS101",
      name: "Data Structures and Algorithms",
      credits: 4,
      facultyId: faculty1.id,
    },
    {
      code: "CS102",
      name: "Database Management Systems",
      credits: 4,
      facultyId: faculty2.id,
    },
    {
      code: "CS103",
      name: "Operating Systems & Concurrency",
      credits: 3,
      facultyId: faculty1.id,
    },
  ];

  for (const cData of coursesData) {
    const course = await prisma.course.create({
      data: {
        code: cData.code,
        name: cData.name,
        credits: cData.credits,
        departmentId: department.id,
      },
    });

    // Curriculum Units
    const unit1 = await prisma.curriculumUnit.create({
      data: {
        courseId: course.id,
        unitNumber: 1,
        title: "Core Foundations & Complexity Analysis",
        plannedHours: 12,
      },
    });

    // Course Outcome
    const co1 = await prisma.courseOutcome.create({
      data: {
        courseId: course.id,
        code: "CO1",
        description: `Demonstrate mastery in core concepts of ${course.name}.`,
      },
    });

    // Map CO1 to PO1
    await prisma.coPoMapping.create({
      data: {
        coId: co1.id,
        poId: po1.id,
        correlationLevel: 3,
      },
    });

    // Timetable slot
    await prisma.timetableSlot.create({
      data: {
        courseId: course.id,
        dayOfWeek: 1, // Monday
        startTime: "09:00",
        endTime: "10:30",
        room: "Lab-A101",
      },
    });

    // Enroll all 40 students in the course
    for (const student of students) {
      await prisma.courseEnrollment.create({
        data: {
          courseId: course.id,
          studentId: student.id,
          semester: "Fall",
          academicYear: "2026-2027",
          status: "ACTIVE",
        },
      });
    }

    // 7. 20 Class Sessions per course
    const sessions = [];
    const baseDate = new Date("2026-08-15T09:00:00Z");

    for (let s = 1; s <= 20; s++) {
      const sessionDate = new Date(
        baseDate.getTime() + s * 2 * 24 * 60 * 60 * 1000,
      );
      const session = await prisma.classSession.create({
        data: {
          courseId: course.id,
          facultyId: cData.facultyId,
          sessionDate,
          startTime: "09:00",
          endTime: "10:30",
          topic: `Lecture ${s}: Advanced concepts in ${course.name}`,
          room: "Room-302",
        },
      });
      sessions.push(session);

      // Attendance records for each student
      // Realistic distribution: mostly PRESENT, occasional ON_DUTY, ABSENT, MEDICAL_LEAVE
      for (let stIdx = 0; stIdx < students.length; stIdx++) {
        const student = students[stIdx]!;
        let status: AttendanceStatus = AttendanceStatus.PRESENT;

        // Introduce variance for realistic risk testing
        const hash = (stIdx * 17 + s * 13) % 100;
        if (stIdx === 39) {
          // Student 40 has poor attendance for risk testing
          status =
            hash < 60 ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
        } else if (hash < 6) {
          status = AttendanceStatus.ABSENT;
        } else if (hash < 10) {
          status = AttendanceStatus.ON_DUTY;
        } else if (hash < 12) {
          status = AttendanceStatus.MEDICAL_LEAVE;
        }

        await prisma.attendanceRecord.create({
          data: {
            sessionId: session.id,
            studentId: student.id,
            status,
          },
        });
      }
    }

    // 8. 3 Assessments per course with scores (weight validation: sum <= 100)
    const assessmentsSpec = [
      { title: "Quiz 1", type: "QUIZ", maxScore: 20, weight: 20 },
      { title: "Midterm Exam", type: "MIDTERM", maxScore: 50, weight: 30 },
      {
        title: "Comprehensive Project",
        type: "PROJECT",
        maxScore: 100,
        weight: 50,
      },
    ];

    for (const aSpec of assessmentsSpec) {
      const assessment = await prisma.assessment.create({
        data: {
          courseId: course.id,
          title: aSpec.title,
          type: aSpec.type,
          maxScore: aSpec.maxScore,
          weight: aSpec.weight,
          dueDate: new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Assessment Question
      const question = await prisma.assessmentQuestion.create({
        data: {
          assessmentId: assessment.id,
          unitId: unit1.id,
          topicTag: "Complexity Analysis",
          maxScore: aSpec.maxScore,
          coId: co1.id,
        },
      });

      // Score for each student
      for (let stIdx = 0; stIdx < students.length; stIdx++) {
        const student = students[stIdx]!;
        // Score between 55% and 95%
        const scorePct = 0.55 + ((stIdx * 13 + 7) % 40) / 100;
        const actualScore = Math.round(aSpec.maxScore * scorePct * 10) / 10;

        await prisma.studentScore.create({
          data: {
            assessmentId: assessment.id,
            studentId: student.id,
            score: actualScore,
            feedback: "Evaluated according to course rubric standards.",
          },
        });

        await prisma.questionScore.create({
          data: {
            questionId: question.id,
            studentId: student.id,
            score: actualScore,
          },
        });
      }
    }

    console.log(
      `✓ Seeded ${course.code} with 20 sessions and 3 assessments (weights: 20+30+50 = 100)`,
    );
  }

  // Sample Intervention for Student 40
  await prisma.intervention.create({
    data: {
      studentId: students[39]!.id,
      mentorId: mentor.id,
      title: "Attendance & Academic Velocity Check-in",
      description: "Review low attendance and set milestone recovery goals.",
      status: InterventionStatus.SCHEDULED,
      scheduledFor: new Date("2026-10-15T14:00:00Z"),
    },
  });

  console.log("✅ Database seeding finished successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
