import {
  PrismaClient,
  Role,
  AttendanceStatus,
  InterventionStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SHARED_PASSWORD = 'Demo@1234';
const PASSWORD_HASH = bcrypt.hashSync(SHARED_PASSWORD, 10);

async function main() {
  console.log('🌱 Starting database seeding for Student Academic AI...');

  // Clean existing data in reverse order of foreign keys for idempotency
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
      name: 'Computer Science and Engineering',
      code: 'CSE',
    },
  });
  console.log(`✓ Created Department: ${department.name} (${department.code})`);

  // Program Outcomes (PO1)
  const po1 = await prisma.programOutcome.create({
    data: {
      departmentId: department.id,
      code: 'PO1',
      description: 'Apply engineering fundamentals and mathematical principles to compute solutions.',
    },
  });

  // 2. Admin User
  const admin = await prisma.user.create({
    data: {
      email: 'admin@demo.edu',
      name: 'System Administrator',
      role: Role.ADMIN,
      departmentId: department.id,
      passwordHash: PASSWORD_HASH,
    },
  });
  console.log(`✓ Created Admin: ${admin.email}`);

  // 3. HOD User
  const hod = await prisma.user.create({
    data: {
      email: 'hod@demo.edu',
      name: 'Dr. Alan Turing',
      role: Role.HOD,
      departmentId: department.id,
      passwordHash: PASSWORD_HASH,
    },
  });
  console.log(`✓ Created HOD: ${hod.email}`);

  // 4. Faculty Users (2 members)
  const faculty1 = await prisma.user.create({
    data: {
      email: 'faculty1@demo.edu',
      name: 'Prof. Claude Shannon',
      role: Role.FACULTY,
      departmentId: department.id,
      passwordHash: PASSWORD_HASH,
    },
  });

  const faculty2 = await prisma.user.create({
    data: {
      email: 'faculty2@demo.edu',
      name: 'Prof. Grace Hopper',
      role: Role.FACULTY,
      departmentId: department.id,
      passwordHash: PASSWORD_HASH,
    },
  });
  console.log(`✓ Created 2 Faculty: ${faculty1.email}, ${faculty2.email}`);

  // 5. Mentor User (1 member)
  const mentor = await prisma.user.create({
    data: {
      email: 'mentor1@demo.edu',
      name: 'Dr. Donald Knuth',
      role: Role.MENTOR,
      departmentId: department.id,
      passwordHash: PASSWORD_HASH,
    },
  });
  console.log(`✓ Created Mentor: ${mentor.email}`);

  // 6. Students (40 students) - Batch created for high performance
  const studentCreateData = [];
  for (let i = 1; i <= 40; i++) {
    const padded = String(i).padStart(2, '0');
    studentCreateData.push({
      email: `student${padded}@demo.edu`,
      name: `Student ${padded}`,
      role: Role.STUDENT,
      departmentId: department.id,
      passwordHash: PASSWORD_HASH,
    });
  }
  await prisma.user.createMany({ data: studentCreateData });
  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT, departmentId: department.id },
    orderBy: { email: 'asc' },
    select: { id: true, name: true, email: true },
  });

  const mentorAssignmentsData = [];
  const guardianContactsData = [];
  for (let i = 0; i < students.length; i++) {
    const student = students[i]!;
    const padded = String(i + 1).padStart(2, '0');
    mentorAssignmentsData.push({
      mentorId: mentor.id,
      studentId: student.id,
      active: true,
    });
    guardianContactsData.push({
      studentId: student.id,
      phone: `+1-555-01${padded}`,
      consentGiven: true,
      consentAt: new Date(),
    });
  }
  await prisma.mentorAssignment.createMany({ data: mentorAssignmentsData });
  await prisma.guardianContact.createMany({ data: guardianContactsData });
  console.log(`✓ Created 40 Students (student01@demo.edu .. student40@demo.edu)`);

  // 7. Courses (3 courses)
  const coursesData = [
    { code: 'CS101', name: 'Data Structures and Algorithms', credits: 4, facultyId: faculty1.id },
    { code: 'CS102', name: 'Database Management Systems', credits: 4, facultyId: faculty2.id },
    { code: 'CS103', name: 'Operating Systems & Concurrency', credits: 3, facultyId: faculty1.id },
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

    // Curriculum Unit
    const unit1 = await prisma.curriculumUnit.create({
      data: {
        courseId: course.id,
        unitNumber: 1,
        title: 'Core Foundations & Complexity Analysis',
        plannedHours: 12,
      },
    });

    // Course Outcome
    const co1 = await prisma.courseOutcome.create({
      data: {
        courseId: course.id,
        code: 'CO1',
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
        startTime: '09:00',
        endTime: '10:30',
        room: 'Lab-A101',
      },
    });

    // Enroll all 40 students in the course (batch)
    const enrollmentData = students.map((s) => ({
      courseId: course.id,
      studentId: s.id,
      semester: 'Fall',
      academicYear: '2026-2027',
      status: 'ACTIVE',
    }));
    await prisma.courseEnrollment.createMany({ data: enrollmentData });

    // 8. 20 Class Sessions per course (60 total)
    const baseDate = new Date('2026-08-15T09:00:00Z');
    const sessions = [];
    for (let s = 1; s <= 20; s++) {
      const sessionDate = new Date(baseDate.getTime() + s * 2 * 24 * 60 * 60 * 1000);
      const session = await prisma.classSession.create({
        data: {
          courseId: course.id,
          facultyId: cData.facultyId,
          sessionDate,
          startTime: '09:00',
          endTime: '10:30',
          topic: `Lecture ${s}: Advanced concepts in ${course.name}`,
          room: 'Room-302',
        },
      });
      sessions.push({ session, s });
    }

    // Attendance records batch for all 20 sessions * 40 students = 800 records
    const attendanceBatch = [];
    for (const { session, s } of sessions) {
      for (let stIdx = 0; stIdx < students.length; stIdx++) {
        const student = students[stIdx]!;
        let status: AttendanceStatus = AttendanceStatus.PRESENT;

        const hash = (stIdx * 17 + s * 13) % 100;
        if (stIdx === 39) {
          status = hash < 60 ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
        } else if (hash < 6) {
          status = AttendanceStatus.ABSENT;
        } else if (hash < 10) {
          status = AttendanceStatus.ON_DUTY;
        } else if (hash < 12) {
          status = AttendanceStatus.MEDICAL_LEAVE;
        }

        attendanceBatch.push({
          sessionId: session.id,
          studentId: student.id,
          status,
        });
      }
    }
    await prisma.attendanceRecord.createMany({ data: attendanceBatch });

    // 9. 3 Assessments per course with scores (9 total, weights: 20 + 30 + 50 = 100)
    const assessmentsSpec = [
      { title: 'Quiz 1', type: 'QUIZ', maxScore: 20, weight: 20 },
      { title: 'Midterm Exam', type: 'MIDTERM', maxScore: 50, weight: 30 },
      { title: 'Comprehensive Project', type: 'PROJECT', maxScore: 100, weight: 50 },
    ];

    const studentScoresBatch = [];
    const questionScoresBatch = [];

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
          topicTag: 'Complexity Analysis',
          maxScore: aSpec.maxScore,
          coId: co1.id,
        },
      });

      // Scores for each student batch
      for (let stIdx = 0; stIdx < students.length; stIdx++) {
        const student = students[stIdx]!;
        const scorePct = 0.55 + ((stIdx * 13 + 7) % 40) / 100;
        const actualScore = Math.round(aSpec.maxScore * scorePct * 10) / 10;

        studentScoresBatch.push({
          assessmentId: assessment.id,
          studentId: student.id,
          score: actualScore,
          feedback: 'Evaluated according to course rubric standards.',
        });

        questionScoresBatch.push({
          questionId: question.id,
          studentId: student.id,
          score: actualScore,
        });
      }
    }

    await prisma.studentScore.createMany({ data: studentScoresBatch });
    await prisma.questionScore.createMany({ data: questionScoresBatch });

    console.log(`✓ Seeded course ${course.code} with 20 sessions and 3 assessments`);
  }

  // Intervention for student 40
  await prisma.intervention.create({
    data: {
      studentId: students[39]!.id,
      mentorId: mentor.id,
      title: 'Attendance & Academic Velocity Check-in',
      description: 'Review low attendance and set milestone recovery goals.',
      status: InterventionStatus.SCHEDULED,
      scheduledFor: new Date('2026-10-15T14:00:00Z'),
    },
  });

  console.log('✅ Database seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
