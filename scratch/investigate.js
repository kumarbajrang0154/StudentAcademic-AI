const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL || '';
  const hostMatch = url.match(/@([^/?]+)/);
  const host = hostMatch ? hostMatch[1].split(':')[0] : 'unknown';
  console.log('DB host:', host);

  // 1. Smoke/temp/test users
  const suspectUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: 'smoke' } },
        { email: { contains: 'temp' } },
        { email: { contains: 'test' } },
        { name: { contains: 'smoke', mode: 'insensitive' } },
        { name: { contains: 'Temp', mode: 'insensitive' } },
      ]
    },
    select: { id: true, email: true, name: true, role: true }
  });
  console.log('\n=== SUSPECT USERS (smoke/temp/test) ===');
  console.log(JSON.stringify(suspectUsers, null, 2));

  // 2. Enrollment risk distribution
  const dist = await prisma.courseEnrollment.groupBy({
    by: ['riskCategory'],
    _count: true,
  });
  console.log('\n=== ENROLLMENT RISK DISTRIBUTION ===');
  console.log(JSON.stringify(dist, null, 2));

  // 3. Mastery=0 count
  const zeroMastery = await prisma.courseEnrollment.count({
    where: { masteryScore: 0 }
  });
  console.log('\n=== ENROLLMENTS WITH MASTERY=0:', zeroMastery, '===');

  // 4. Demo accounts check
  const demoEmails = ['student01@demo.edu', 'faculty1@demo.edu', 'mentor1@demo.edu', 'hod@demo.edu', 'admin@demo.edu'];
  const demoUsers = await prisma.user.findMany({
    where: { email: { in: demoEmails } },
    select: { id: true, email: true, name: true, role: true }
  });
  console.log('\n=== DEMO ACCOUNTS ===');
  console.log(JSON.stringify(demoUsers, null, 2));

  // 5. student01 CS101 enrollment
  const s01 = await prisma.user.findUnique({ where: { email: 'student01@demo.edu' }, select: { id: true } });
  if (s01) {
    const enroll = await prisma.courseEnrollment.findMany({
      where: { studentId: s01.id },
      include: { course: { select: { code: true } } }
    });
    console.log('\n=== student01 ENROLLMENTS ===');
    console.log(JSON.stringify(enroll.map(e => ({ course: e.course.code, riskCategory: e.riskCategory, masteryScore: e.masteryScore, attendanceRate: e.attendanceRate })), null, 2));
  } else {
    console.log('\n=== student01@demo.edu NOT FOUND ===');
  }

  // 6. What findFirst(STUDENT, orderBy email asc) returns
  const firstStudent = await prisma.user.findFirst({
    where: { role: 'STUDENT' },
    orderBy: { email: 'asc' },
    select: { id: true, email: true, name: true }
  });
  console.log('\n=== DEMO LOGIN would pick STUDENT: ===');
  console.log(JSON.stringify(firstStudent, null, 2));

  // 7. Total users by role
  const byRole = await prisma.user.groupBy({
    by: ['role'],
    _count: true,
  });
  console.log('\n=== USERS BY ROLE ===');
  console.log(JSON.stringify(byRole, null, 2));

  // 8. student02 enrollments
  const s02 = await prisma.user.findUnique({ where: { email: 'student02@demo.edu' }, select: { id: true } });
  if (s02) {
    const enroll2 = await prisma.courseEnrollment.findMany({
      where: { studentId: s02.id },
      include: { course: { select: { code: true } } }
    });
    console.log('\n=== student02 ENROLLMENTS ===');
    console.log(JSON.stringify(enroll2.map(e => ({ course: e.course.code, riskCategory: e.riskCategory, masteryScore: e.masteryScore })), null, 2));
  } else {
    console.log('\n=== student02@demo.edu NOT FOUND ===');
  }

  // 9. CS101 faculty dashboard risk counts
  const cs101 = await prisma.course.findUnique({ where: { code: 'CS101' }, select: { id: true } });
  if (cs101) {
    const riskCounts = await prisma.courseEnrollment.groupBy({
      by: ['riskCategory'],
      where: { courseId: cs101.id },
      _count: true,
    });
    console.log('\n=== CS101 RISK DISTRIBUTION ===');
    console.log(JSON.stringify(riskCounts, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
