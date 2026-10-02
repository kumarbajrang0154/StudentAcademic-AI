import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("====================================================");
  console.log("🔍 Running Database Seed & Integrity Verification");
  console.log("====================================================\n");

  // 1. Department count
  const departmentCount = await prisma.department.count();
  console.log(`Departments:       ${departmentCount} (expected 1)`);
  if (departmentCount !== 1) {
    throw new Error(
      `Assertion failed: Expected 1 department, found ${departmentCount}`,
    );
  }

  // 2. Roles verification
  const hodCount = await prisma.user.count({ where: { role: Role.HOD } });
  console.log(`HOD:               ${hodCount} (expected 1)`);
  if (hodCount !== 1) {
    throw new Error(`Assertion failed: Expected 1 HOD, found ${hodCount}`);
  }

  const facultyCount = await prisma.user.count({
    where: { role: Role.FACULTY },
  });
  console.log(`Faculty:           ${facultyCount} (expected 2)`);
  if (facultyCount !== 2) {
    throw new Error(
      `Assertion failed: Expected 2 faculty, found ${facultyCount}`,
    );
  }

  const mentorCount = await prisma.user.count({ where: { role: Role.MENTOR } });
  console.log(`Mentors:           ${mentorCount} (expected 1)`);
  if (mentorCount !== 1) {
    throw new Error(
      `Assertion failed: Expected 1 mentor, found ${mentorCount}`,
    );
  }

  const studentCount = await prisma.user.count({
    where: { role: Role.STUDENT },
  });
  console.log(`Students:          ${studentCount} (expected 40)`);
  if (studentCount !== 40) {
    throw new Error(
      `Assertion failed: Expected 40 students, found ${studentCount}`,
    );
  }

  // 3. Courses count
  const courseCount = await prisma.course.count();
  console.log(`Courses:           ${courseCount} (expected 3)`);
  if (courseCount !== 3) {
    throw new Error(
      `Assertion failed: Expected 3 courses, found ${courseCount}`,
    );
  }

  // 4. Class sessions count & sessions per course
  const totalSessions = await prisma.classSession.count();
  console.log(`Total Sessions:    ${totalSessions} (expected 60)`);
  if (totalSessions !== 60) {
    throw new Error(
      `Assertion failed: Expected 60 class sessions, found ${totalSessions}`,
    );
  }

  const courses = await prisma.course.findMany({
    include: {
      _count: {
        select: {
          sessions: true,
          assessments: true,
          enrollments: true,
        },
      },
    },
  });

  for (const course of courses) {
    console.log(
      ` - Course [${course.code}]: ${course._count.sessions} sessions, ${course._count.assessments} assessments, ${course._count.enrollments} enrollments`,
    );
    if (course._count.sessions !== 20) {
      throw new Error(
        `Assertion failed: Course ${course.code} has ${course._count.sessions} sessions (expected 20)`,
      );
    }
    if (course._count.assessments !== 3) {
      throw new Error(
        `Assertion failed: Course ${course.code} has ${course._count.assessments} assessments (expected 3)`,
      );
    }
  }

  // 5. Total Assessments
  const assessmentCount = await prisma.assessment.count();
  console.log(`Assessments:       ${assessmentCount} (expected 9)`);
  if (assessmentCount !== 9) {
    throw new Error(
      `Assertion failed: Expected 9 assessments, found ${assessmentCount}`,
    );
  }

  // 6. Every student enrolled in every course
  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT },
    select: { id: true, email: true },
  });

  for (const student of students) {
    const studentEnrollments = await prisma.courseEnrollment.count({
      where: { studentId: student.id },
    });
    if (studentEnrollments !== 3) {
      throw new Error(
        `Assertion failed: Student ${student.email} enrolled in ${studentEnrollments} courses (expected 3)`,
      );
    }
  }
  console.log(
    `✓ Verified: All 40 students are enrolled in all 3 courses (120 enrollments total).`,
  );

  // 7. AuditLog table immutability (rejects UPDATE and DELETE via Postgres trigger)
  console.log("\n🔒 Testing AuditLog immutability (Postgres Trigger)...");
  const testLog = await prisma.auditLog.create({
    data: {
      entity: "VerificationTest",
      entityId: "test-seed-run",
      justification: "Testing trigger rejection for UPDATE and DELETE",
    },
  });

  // Attempt UPDATE
  let updateRejected = false;
  try {
    await prisma.$executeRaw`UPDATE "AuditLog" SET justification = 'Illegally modified' WHERE id = ${testLog.id}`;
  } catch (err: unknown) {
    updateRejected = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`✓ Expected error on UPDATE: ${msg.split("\n")[0]}`);
  }

  if (!updateRejected) {
    throw new Error(
      "CRITICAL FAILURE: AuditLog table allowed an UPDATE operation!",
    );
  }

  // Attempt DELETE
  let deleteRejected = false;
  try {
    await prisma.$executeRaw`DELETE FROM "AuditLog" WHERE id = ${testLog.id}`;
  } catch (err: unknown) {
    deleteRejected = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`✓ Expected error on DELETE: ${msg.split("\n")[0]}`);
  }

  if (!deleteRejected) {
    throw new Error(
      "CRITICAL FAILURE: AuditLog table allowed a DELETE operation!",
    );
  }

  console.log("\n====================================================");
  console.log("✅ ALL DATABASE SEED & INTEGRITY ASSERTIONS PASSED!");
  console.log("====================================================");
}

main()
  .catch((e) => {
    console.error("❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
