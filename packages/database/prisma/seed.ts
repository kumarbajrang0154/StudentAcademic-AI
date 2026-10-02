import {
  PrismaClient,
  Role,
  AttendanceStatus,
  InterventionStatus,
  ResourceType,
  RiskCategory,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  attendancePercent,
  courseMastery,
  academicMetricsToRiskInputs,
  riskScore,
  negativeVelocityWarning,
} from '@student-academic-ai/core';

const prisma = new PrismaClient();

const SHARED_PASSWORD = 'Demo@1234';
const PASSWORD_HASH = bcrypt.hashSync(SHARED_PASSWORD, 10);

async function main() {
  console.log('🌱 Starting database seeding for Student Academic AI (Module 2)...');

  // Clean existing data in reverse order of foreign keys for idempotency
  await prisma.resource.deleteMany();
  // Note: AuditLog is append-only by DB trigger, do not deleteMany on it
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

  // Program Outcomes (PO1 to PO6)
  const poData = [
    { code: 'PO1', description: 'Engineering Knowledge: Apply mathematics and engineering fundamentals.' },
    { code: 'PO2', description: 'Problem Analysis: Identify, formulate, and analyze complex engineering problems.' },
    { code: 'PO3', description: 'Design/Development: Design solutions for complex computational systems.' },
    { code: 'PO4', description: 'Investigations: Conduct experiments and interpret multi-dimensional data.' },
    { code: 'PO5', description: 'Modern Tool Usage: Select and apply appropriate techniques and IT tools.' },
    { code: 'PO6', description: 'The Engineer and Society: Apply contextual knowledge to societal responsibilities.' },
  ];

  const pos = [];
  for (const po of poData) {
    const createdPo = await prisma.programOutcome.create({
      data: {
        departmentId: department.id,
        code: po.code,
        description: po.description,
      },
    });
    pos.push(createdPo);
  }
  console.log(`✓ Created 6 Program Outcomes (PO1..PO6)`);

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
  console.log(`✓ Created Admin user: ${admin.email}`);

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
  console.log(`✓ Created HOD user: ${hod.email}`);

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
  console.log(`✓ Created Faculty, HOD, Admin, Mentor staff users`);

  // 6. Students (40 students) - Batch created
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

  // MentorAssignment: mentor1 -> 10 students (student01 to student10)
  const mentorAssignmentsData = [];
  for (let i = 0; i < 10; i++) {
    mentorAssignmentsData.push({
      mentorId: mentor.id,
      studentId: students[i]!.id,
      active: true,
    });
  }
  await prisma.mentorAssignment.createMany({ data: mentorAssignmentsData });

  // GuardianContact with consent for all 40 students
  const guardianContactsData = [];
  for (let i = 0; i < students.length; i++) {
    const student = students[i]!;
    const padded = String(i + 1).padStart(2, '0');
    guardianContactsData.push({
      studentId: student.id,
      phone: `+1-555-01${padded}`,
      consentGiven: true,
      consentAt: new Date('2026-08-01T10:00:00Z'),
    });
  }
  await prisma.guardianContact.createMany({ data: guardianContactsData });
  console.log(`✓ Created 40 Students, MentorAssignment for 10 students, and GuardianContacts with consent`);

  // 7. Educational Resources (~15 curated resources tied to real topicTags)
  const resourcesData = [
    { topicTag: 'Dynamic Programming: Knapsack', type: ResourceType.VIDEO, title: '0/1 Knapsack Problem Dynamic Programming Tutorial', url: 'https://youtube.com/watch?v=knapsack-dp', chapterRef: 'CLRS Chapter 16.2' },
    { topicTag: 'Dynamic Programming: Knapsack', type: ResourceType.NOTES, title: 'Knapsack Table State Transition Cheat Sheet', url: 'https://cdn.demo.edu/notes/dp-knapsack.pdf', chapterRef: 'Lecture 12 Notes' },
    { topicTag: 'Dynamic Programming: Knapsack', type: ResourceType.TEXTBOOK, title: 'Algorithm Design by Kleinberg & Tardos', url: 'https://library.demo.edu/books/algorithm-design', chapterRef: 'Chapter 6: Dynamic Programming' },
    { topicTag: 'Dynamic Programming: Longest Common Subsequence', type: ResourceType.VIDEO, title: 'LCS 2D Matrix DP Formulation Walkthrough', url: 'https://youtube.com/watch?v=lcs-tutorial', chapterRef: 'CLRS Chapter 15.4' },
    { topicTag: 'Asymptotic Complexity & Big-O', type: ResourceType.TEXTBOOK, title: 'Introduction to Algorithms 4th Edition', url: 'https://library.demo.edu/clrs4', chapterRef: 'Chapter 3: Growth of Functions' },
    { topicTag: 'Asymptotic Complexity & Big-O', type: ResourceType.NOTES, title: 'Master Theorem & Recurrence Relations Summary', url: 'https://cdn.demo.edu/notes/big-o.pdf', chapterRef: 'Unit 1 Handout' },
    { topicTag: 'Graph Algorithms: Shortest Path', type: ResourceType.VIDEO, title: 'Dijkstra and Bellman-Ford Visualized', url: 'https://youtube.com/watch?v=shortest-path', chapterRef: 'CLRS Chapter 24' },
    { topicTag: 'Graph Algorithms: Shortest Path', type: ResourceType.NOTES, title: 'Priority Queue Optimization in Dijkstra', url: 'https://cdn.demo.edu/notes/dijkstra.pdf', chapterRef: 'Lab 5 Manual' },
    { topicTag: 'Schema Normalization: 3NF & BCNF', type: ResourceType.VIDEO, title: 'Functional Dependencies and Lossless Decompositions', url: 'https://youtube.com/watch?v=db-normalization', chapterRef: 'Silberschatz Chapter 8' },
    { topicTag: 'Schema Normalization: 3NF & BCNF', type: ResourceType.TEXTBOOK, title: 'Database System Concepts 7th Edition', url: 'https://library.demo.edu/db-concepts', chapterRef: 'Chapter 8: Relational Database Design' },
    { topicTag: 'Transaction Isolation & 2PL', type: ResourceType.VIDEO, title: 'Two-Phase Locking (2PL) and Serializability Protocol', url: 'https://youtube.com/watch?v=2pl-transactions', chapterRef: 'Silberschatz Chapter 15' },
    { topicTag: 'Transaction Isolation & 2PL', type: ResourceType.NOTES, title: 'ACID Properties and Strict 2PL Summary', url: 'https://cdn.demo.edu/notes/transactions.pdf', chapterRef: 'Unit 3 Study Guide' },
    { topicTag: 'Concurrency Control & Deadlocks', type: ResourceType.TEXTBOOK, title: 'Transaction Processing: Concepts and Techniques', url: 'https://library.demo.edu/gray-reuter', chapterRef: 'Chapter 7: Concurrency Control' },
    { topicTag: 'Process Synchronization: Semaphores', type: ResourceType.VIDEO, title: 'Dining Philosophers and Producer-Consumer with Semaphores', url: 'https://youtube.com/watch?v=os-semaphores', chapterRef: 'Silberschatz OS Chapter 6' },
    { topicTag: 'Virtual Memory & Paging', type: ResourceType.VIDEO, title: 'Virtual Address Translation and Page Tables Explained', url: 'https://youtube.com/watch?v=virtual-memory', chapterRef: 'OSTEP Chapter 18' },
    { topicTag: 'Virtual Memory & Paging', type: ResourceType.NOTES, title: 'Multi-Level Paging and TLB Miss Handling', url: 'https://cdn.demo.edu/notes/virtual-memory.pdf', chapterRef: 'Unit 3 OS Handout' },
  ];
  await prisma.resource.createMany({ data: resourcesData });
  console.log(`✓ Created ${resourcesData.length} Educational Resources across topics`);

  // 8. Courses & Detailed Curriculum Units, Outcomes, Timetable Slots
  const coursesDef = [
    {
      code: 'CS101',
      name: 'Data Structures and Algorithms',
      credits: 4,
      facultyId: faculty1.id,
      units: [
        { unitNumber: 1, title: 'Foundations & Asymptotic Complexity', plannedHours: 8 },
        { unitNumber: 2, title: 'Dynamic Programming & Greedy Strategies', plannedHours: 12 },
        { unitNumber: 3, title: 'Graph Algorithms & Network Flow', plannedHours: 10 },
        { unitNumber: 4, title: 'Advanced Trees & Balanced Search Structures', plannedHours: 10 },
      ],
      cos: [
        { code: 'CO1', description: 'Analyze runtime and space complexity using asymptotic notations.' },
        { code: 'CO2', description: 'Design optimal solutions using dynamic programming and greedy strategies.' },
        { code: 'CO3', description: 'Apply graph traversal and shortest-path algorithms to real-world networks.' },
        { code: 'CO4', description: 'Construct balanced tree data structures for efficient indexing.' },
      ],
      topics: [
        'Asymptotic Complexity & Big-O',
        'Dynamic Programming: Knapsack',
        'Dynamic Programming: Longest Common Subsequence',
        'Graph Algorithms: Shortest Path',
        'Advanced Trees: B-Trees',
      ],
    },
    {
      code: 'CS102',
      name: 'Database Management Systems',
      credits: 4,
      facultyId: faculty2.id,
      units: [
        { unitNumber: 1, title: 'Relational Algebra & SQL Standards', plannedHours: 8 },
        { unitNumber: 2, title: 'Schema Normalization & Functional Dependencies', plannedHours: 10 },
        { unitNumber: 3, title: 'Transaction Processing, Concurrency & Indexing', plannedHours: 12 },
        { unitNumber: 4, title: 'Distributed Databases & NoSQL Storage', plannedHours: 10 },
      ],
      cos: [
        { code: 'CO1', description: 'Formulate relational algebra expressions and advanced SQL queries.' },
        { code: 'CO2', description: 'Decompose database schemas into 3NF and BCNF normal forms.' },
        { code: 'CO3', description: 'Implement concurrency control protocols and evaluate ACID isolation levels.' },
        { code: 'CO4', description: 'Design partitioned schemas for distributed and document storage engines.' },
      ],
      topics: [
        'Relational Algebra: Projections & Joins',
        'Schema Normalization: 3NF & BCNF',
        'Transaction Isolation & 2PL',
        'Concurrency Control & Deadlocks',
        'Distributed Databases: Sharding',
      ],
    },
    {
      code: 'CS103',
      name: 'Operating Systems & Concurrency',
      credits: 3,
      facultyId: faculty1.id,
      units: [
        { unitNumber: 1, title: 'Process Management & IPC', plannedHours: 8 },
        { unitNumber: 2, title: 'CPU Scheduling & Synchronization', plannedHours: 10 },
        { unitNumber: 3, title: 'Memory Virtualization & Paging', plannedHours: 12 },
        { unitNumber: 4, title: 'File Systems & Storage Architecture', plannedHours: 10 },
      ],
      cos: [
        { code: 'CO1', description: 'Analyze process states and interprocess communication mechanisms.' },
        { code: 'CO2', description: 'Solve race conditions and deadlocks using mutexes and semaphores.' },
        { code: 'CO3', description: 'Evaluate virtual memory page replacement algorithms and TLB performance.' },
        { code: 'CO4', description: 'Design directory hierarchies and inode-based file system allocation.' },
      ],
      topics: [
        'Process Management: IPC & Threads',
        'Process Synchronization: Semaphores',
        'Virtual Memory & Paging',
        'Page Replacement Algorithms: LRU',
        'File System Inodes & Directory Trees',
      ],
    },
  ];

  const now = new Date();

  for (const cDef of coursesDef) {
    const course = await prisma.course.create({
      data: {
        code: cDef.code,
        name: cDef.name,
        credits: cDef.credits,
        departmentId: department.id,
      },
    });

    // 4 Curriculum Units
    const createdUnits = [];
    for (const u of cDef.units) {
      const cu = await prisma.curriculumUnit.create({
        data: {
          courseId: course.id,
          unitNumber: u.unitNumber,
          title: u.title,
          plannedHours: u.plannedHours,
        },
      });
      createdUnits.push(cu);
    }

    // 4 Course Outcomes & Mappings to POs
    const createdCos = [];
    for (let i = 0; i < cDef.cos.length; i++) {
      const coDef = cDef.cos[i]!;
      const co = await prisma.courseOutcome.create({
        data: {
          courseId: course.id,
          code: coDef.code,
          description: coDef.description,
        },
      });
      createdCos.push(co);

      // Map to 2 corresponding POs
      const poTarget1 = pos[i % pos.length]!;
      const poTarget2 = pos[(i + 1) % pos.length]!;

      await prisma.coPoMapping.create({
        data: {
          coId: co.id,
          poId: poTarget1.id,
          correlationLevel: 3,
        },
      });

      await prisma.coPoMapping.create({
        data: {
          coId: co.id,
          poId: poTarget2.id,
          correlationLevel: 2,
        },
      });
    }

    // Timetable Slots: Mon-Fri (dayOfWeek 1 to 5)
    for (let day = 1; day <= 5; day++) {
      await prisma.timetableSlot.create({
        data: {
          courseId: course.id,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '10:00',
          room: `Hall-${cDef.code.slice(-2)}`,
        },
      });
    }

    // Enroll all 40 students
    const enrollmentData = students.map((s) => ({
      courseId: course.id,
      studentId: s.id,
      semester: 'Fall',
      academicYear: '2026-2027',
      status: 'ACTIVE',
    }));
    await prisma.courseEnrollment.createMany({ data: enrollmentData });

    // 20 Class Sessions (conducted over past 8 weeks)
    const baseDate = new Date('2026-08-08T09:00:00Z');
    const sessions = [];
    for (let s = 1; s <= 20; s++) {
      const sessionDate = new Date(baseDate.getTime() + (s - 1) * 2.5 * 24 * 60 * 60 * 1000);
      const session = await prisma.classSession.create({
        data: {
          courseId: course.id,
          facultyId: cDef.facultyId,
          sessionDate,
          startTime: '09:00',
          endTime: '10:00',
          topic: `Session ${s}: ${cDef.units[(s % 4)]!.title}`,
          room: `Hall-${cDef.code.slice(-2)}`,
        },
      });
      sessions.push({ session, s });
    }

    // Seed Attendance per student:
    // Scripted rules:
    // - student01 (hero): CS101 attendance 14/20 (70%): exactly 14 PRESENT, 6 ABSENT (sessions 10, 12, 14, 16, 18, 20 absent). CS102 & CS103 healthy (19/20 = 95%).
    // - student02: Critical in ALL 3 courses: 10/20 (50%) attendance across all 3 courses.
    // - student03: 98% attendance (20/20 present).
    // - student04: Was below 75% early (absent in 8 out of first 14), then last 6 sessions (15..20) all PRESENT!
    // - Others: ~70% Safe (>= 16/20 present), ~20% Moderate (15/20), ~10% Critical (< 14/20).
    const attendanceBatch = [];
    for (const { session, s } of sessions) {
      for (let stIdx = 0; stIdx < students.length; stIdx++) {
        const student = students[stIdx]!;
        let status: AttendanceStatus = AttendanceStatus.PRESENT;

        if (stIdx === 0) {
          // student01
          if (cDef.code === 'CS101') {
            const absentSessions = [10, 12, 14, 16, 18, 20];
            status = absentSessions.includes(s) ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
          } else {
            status = s === 15 ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT; // 19/20 = 95%
          }
        } else if (stIdx === 1) {
          // student02: 10/20 = 50% attendance
          status = s % 2 === 0 ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT;
        } else if (stIdx === 2) {
          // student03: 98% attendance (all present or 1 OD)
          status = s === 5 ? AttendanceStatus.ON_DUTY : AttendanceStatus.PRESENT;
        } else if (stIdx === 3) {
          // student04: recovery case: sessions 15-20 ALL PRESENT!
          if (s >= 15) {
            status = AttendanceStatus.PRESENT;
          } else {
            // First 14 sessions: 8 absent, 6 present
            const absentEarly = [1, 3, 5, 7, 9, 11, 13, 14];
            status = absentEarly.includes(s) ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
          }
        } else {
          // General distribution
          const hash = (stIdx * 17 + s * 13) % 100;
          if (stIdx >= 36) {
            // Critical
            status = hash < 45 ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
          } else if (stIdx >= 28) {
            // Moderate
            status = hash < 22 ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
          } else {
            // Safe
            status = hash < 6 ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
          }
        }

        attendanceBatch.push({
          sessionId: session.id,
          studentId: student.id,
          status,
        });
      }
    }
    await prisma.attendanceRecord.createMany({ data: attendanceBatch });

    // 4 Assessments: 3 past graded (spread over last 8 weeks) + 1 UPCOMING ungraded (due in 3 days)
    const assessmentsSpec = [
      {
        title: 'Quiz 1: Core Fundamentals',
        type: 'QUIZ',
        maxScore: 50,
        weight: 25,
        dueDate: new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000), // 6 weeks ago
        isGraded: true,
      },
      {
        title: 'Midterm Examination',
        type: 'MIDTERM',
        maxScore: 50,
        weight: 35,
        dueDate: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000), // 4 weeks ago
        isGraded: true,
      },
      {
        title: 'Comprehensive Evaluation & Project',
        type: 'PROJECT',
        maxScore: 100,
        weight: 40,
        dueDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago (recent!)
        isGraded: true,
      },
      {
        title: 'Final Term Assessment',
        type: 'FINAL_EXAM',
        maxScore: 50,
        weight: 0, // Ungraded upcoming
        dueDate:
          cDef.code === 'CS101'
            ? new Date(now.getTime() + 20 * 60 * 60 * 1000) // ~20h (T-24h)
            : cDef.code === 'CS102'
              ? new Date(now.getTime() + 46 * 60 * 60 * 1000) // ~46h (T-48h)
              : new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000), // ~4 days (UPCOMING)
        isGraded: false,
      },
    ];

    for (let aIdx = 0; aIdx < assessmentsSpec.length; aIdx++) {
      const aSpec = assessmentsSpec[aIdx]!;
      const assessment = await prisma.assessment.create({
        data: {
          courseId: course.id,
          title: aSpec.title,
          type: aSpec.type,
          maxScore: aSpec.maxScore,
          weight: aSpec.weight,
          dueDate: aSpec.dueDate,
        },
      });

      // 5 AssessmentQuestions per assessment
      const questions = [];
      for (let q = 0; q < 5; q++) {
        const targetUnit = createdUnits[q % 4]!;
        const targetCo = createdCos[q % 4]!;
        const targetTopic = cDef.topics[q]!;

        const question = await prisma.assessmentQuestion.create({
          data: {
            assessmentId: assessment.id,
            unitId: targetUnit.id,
            coId: targetCo.id,
            topicTag: targetTopic,
            maxScore: aSpec.maxScore / 5,
          },
        });
        questions.push({ question, q, targetUnit });
      }

      // If upcoming (aIdx === 3), leave UNGRADED (no StudentScore, no QuestionScore)
      if (!aSpec.isGraded) {
        continue;
      }

      // Graded scores generation
      const studentScoresBatch = [];
      const questionScoresBatch = [];

      for (let stIdx = 0; stIdx < students.length; stIdx++) {
        const student = students[stIdx]!;
        let studentTotalScore = 0;

        // Scripted student marks logic:
        // 1. student01 (hero):
        //    - CS101: High in Quiz 1 (45/50) and Midterm (44/50).
        //      In Assessment 3 (recent): fails Unit 2 questions ("Dynamic Programming") miserably:
        //      Overall score 15/100 -> sharp drop from ~89% to ~38%, velocity = (38 - 89)/14 = -3.64 <= -1.5 (CRITICAL)!
        //    - CS102 & CS103: healthy marks 85-90% throughout!
        // 2. student02 (escalation demo):
        //    - CS101, CS102, CS103: ~15-25% marks in all assessments!
        // 3. student03 (XAI conflict case):
        //    - 98% attendance, but ~20% test scores across all assessments!
        // 4. student04:
        //    - ~65% marks.
        // 5. CS102 Unit 3 (bottleneck demo):
        //    - More than 40% of class (stIdx >= 22 -> 18 students = 45%) scored < 50% on Unit 3 questions!

        let targetScorePct = 0.72; // default safe baseline

        if (stIdx === 0) {
          // student01
          if (cDef.code === 'CS101') {
            if (aIdx === 0) targetScorePct = 0.90; // 45 / 50
            else if (aIdx === 1) targetScorePct = 0.88; // 44 / 50
            else targetScorePct = 0.15; // 15 / 100 in recent Assessment 3 -> steep decline!
          } else {
            targetScorePct = 0.88; // CS102 & CS103 healthy
          }
        } else if (stIdx === 1) {
          // student02: Critical in ALL 3 courses
          targetScorePct = 0.20;
        } else if (stIdx === 2) {
          // student03: XAI conflict case: high attendance (98%), ~20% marks
          targetScorePct = 0.20;
        } else if (stIdx === 3) {
          // student04
          targetScorePct = 0.65;
        } else if (stIdx >= 36) {
          // Critical cohort (~10%)
          targetScorePct = 0.25;
        } else if (stIdx >= 28) {
          // Moderate cohort (~20%)
          targetScorePct = 0.55;
        } else {
          // Safe cohort (~70%)
          targetScorePct = 0.70 + ((stIdx * 7) % 25) / 100;
        }

        // Compute individual question scores that strictly sum to studentTotalScore
        const qScores: number[] = [];
        const qMax = aSpec.maxScore / 5;

        for (let q = 0; q < 5; q++) {
          const { targetUnit } = questions[q]!;
          let qRatio = targetScorePct;

          // Special bottleneck condition: CS102 Unit 3 has > 40% failure (< 50% score)
          if (cDef.code === 'CS102' && targetUnit.unitNumber === 3) {
            if (stIdx >= 20) {
              // 20 out of 40 students = 50% of the class score below 50%
              qRatio = 0.30;
            }
          }

          // Special hero condition: student01 in CS101 Unit 2 has very low marks
          if (stIdx === 0 && cDef.code === 'CS101' && targetUnit.unitNumber === 2 && aIdx === 2) {
            qRatio = 0.05; // 5% in Dynamic Programming
          }

          const qScore = Math.round(qMax * qRatio * 10) / 10;
          qScores.push(qScore);
          studentTotalScore += qScore;
        }

        studentTotalScore = Math.round(studentTotalScore * 10) / 10;

        studentScoresBatch.push({
          assessmentId: assessment.id,
          studentId: student.id,
          score: studentTotalScore,
          feedback: 'Evaluated according to course rubric standards.',
        });

        for (let q = 0; q < 5; q++) {
          questionScoresBatch.push({
            questionId: questions[q]!.question.id,
            studentId: student.id,
            score: qScores[q]!,
          });
        }
      }

      await prisma.studentScore.createMany({ data: studentScoresBatch });
      await prisma.questionScore.createMany({ data: questionScoresBatch });
    }

    console.log(`✓ Seeded course ${cDef.code} with 4 units, 4 COs, 5 timetable slots, 20 sessions, 4 assessments (5 questions each)`);
  }

  // 9. Recompute and persist CourseEnrollment metrics — BATCHED for Neon free-tier
  // Strategy: 3 bulk fetches → in-memory computation → single $transaction with all updates
  console.log('🔄 Recomputing all enrollment metrics (attendance, mastery, velocity, risk)...');

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Bulk fetch 1: all enrollments
  const allEnrollments = await prisma.courseEnrollment.findMany({
    select: { studentId: true, courseId: true },
  });

  // Bulk fetch 2: all attendance records (joined to session for courseId)
  const allSessions = await prisma.classSession.findMany({
    select: { id: true, courseId: true },
  });
  const sessionCourseMap = new Map<string, string>(); // sessionId -> courseId
  for (const s of allSessions) {
    sessionCourseMap.set(s.id, s.courseId);
  }
  const allAttendance = await prisma.attendanceRecord.findMany({
    select: { sessionId: true, studentId: true, status: true },
  });
  // Map: `${studentId}_${courseId}` -> {present, onDuty, total}
  type AttSummary = { present: number; onDuty: number; total: number };
  const attMap = new Map<string, AttSummary>();
  for (const rec of allAttendance) {
    const cId = sessionCourseMap.get(rec.sessionId);
    if (!cId) continue;
    const key = `${rec.studentId}_${cId}`;
    const cur = attMap.get(key) ?? { present: 0, onDuty: 0, total: 0 };
    cur.total++;
    if (rec.status === AttendanceStatus.PRESENT) cur.present++;
    else if (rec.status === AttendanceStatus.ON_DUTY || rec.status === AttendanceStatus.MEDICAL_LEAVE) cur.onDuty++;
    attMap.set(key, cur);
  }

  // Bulk fetch 3: all assessments + student scores in one query
  const allAssessments = await prisma.assessment.findMany({
    select: {
      id: true,
      courseId: true,
      maxScore: true,
      weight: true,
      dueDate: true,
      scores: { select: { studentId: true, score: true } },
    },
    orderBy: { dueDate: 'asc' },
  });
  // Map: courseId -> assessment list (sorted by dueDate asc already)
  const assessmentsByCourse = new Map<string, typeof allAssessments>();
  for (const a of allAssessments) {
    const list = assessmentsByCourse.get(a.courseId) ?? [];
    list.push(a);
    assessmentsByCourse.set(a.courseId, list);
  }
  // Map: `${assessmentId}_${studentId}` -> score
  const studentScoreMap = new Map<string, number>();
  for (const a of allAssessments) {
    for (const s of a.scores) {
      if (s.score !== null) {
        studentScoreMap.set(`${a.id}_${s.studentId}`, s.score);
      }
    }
  }

  // Compute metrics in-memory, collect all update payloads
  const updates: Array<{
    studentId: string;
    courseId: string;
    attendanceRate: number;
    masteryScore: number;
    velocity: number;
    submissionDeficit: number;
    riskScoreVal: number;
    riskCategory: RiskCategory;
  }> = [];

  for (const enr of allEnrollments) {
    // Attendance
    const attSummary = attMap.get(`${enr.studentId}_${enr.courseId}`) ?? { present: 0, onDuty: 0, total: 0 };
    const attendanceRate = attendancePercent(attSummary.present, attSummary.onDuty, attSummary.total);

    // Assessments for this course
    const courseAssessments = assessmentsByCourse.get(enr.courseId) ?? [];

    const gradedComponents = courseAssessments
      .filter((a) => studentScoreMap.has(`${a.id}_${enr.studentId}`))
      .map((a) => ({
        score: studentScoreMap.get(`${a.id}_${enr.studentId}`)!,
        maxScore: a.maxScore,
        weight: a.weight,
      }));
    const masteryScore = courseMastery(gradedComponents);

    // Velocity (14-day window)
    const componentsOld = courseAssessments
      .filter((a) => a.dueDate && a.dueDate <= fourteenDaysAgo && studentScoreMap.has(`${a.id}_${enr.studentId}`))
      .map((a) => ({
        score: studentScoreMap.get(`${a.id}_${enr.studentId}`)!,
        maxScore: a.maxScore,
        weight: a.weight,
      }));
    const masteryOld = componentsOld.length > 0 ? courseMastery(componentsOld) : 0;
    const velocity = Math.round(((masteryScore - masteryOld) / 14) * 1000) / 1000;

    // Submission deficit
    const pastDue = courseAssessments.filter((a) => a.dueDate && a.dueDate < now);
    let submissionDeficit = 0;
    if (pastDue.length > 0) {
      const missing = pastDue.filter((a) => !studentScoreMap.has(`${a.id}_${enr.studentId}`)).length;
      submissionDeficit = Math.round((missing / pastDue.length) * 1000) / 10;
    }

    // Risk score + override rules
    const rInputs = academicMetricsToRiskInputs(attendanceRate, masteryScore, velocity, 100 - submissionDeficit);
    const rResult = riskScore(rInputs);
    let category = rResult.category;
    if (
      negativeVelocityWarning(velocity) ||
      (attendanceRate <= 60 && masteryScore <= 35) ||
      rResult.score >= 65
    ) {
      category = RiskCategory.CRITICAL;
    }

    updates.push({
      studentId: enr.studentId,
      courseId: enr.courseId,
      attendanceRate,
      masteryScore,
      velocity,
      submissionDeficit,
      riskScoreVal: rResult.score,
      riskCategory: category,
    });
  }

  // Write all 120 updates in a single transaction (2 round-trips to Neon)
  await prisma.$transaction(
    updates.map((u) =>
      prisma.courseEnrollment.updateMany({
        where: { studentId: u.studentId, courseId: u.courseId },
        data: {
          attendanceRate: u.attendanceRate,
          masteryScore: u.masteryScore,
          velocity: u.velocity,
          submissionDeficit: u.submissionDeficit,
          riskScore: u.riskScoreVal,
          riskCategory: u.riskCategory,
        },
      }),
    ),
  );
  console.log(`✓ Successfully updated metrics for all ${allEnrollments.length} course enrollments`);

  // 10. Intervention for student01
  await prisma.intervention.create({
    data: {
      studentId: students[0]!.id,
      mentorId: mentor.id,
      title: 'Academic Velocity & Attendance Intervention (CS101)',
      description: 'Recent sharp decline in Unit 2 Dynamic Programming assessments and 70% attendance threshold.',
      status: InterventionStatus.SCHEDULED,
      scheduledFor: new Date('2026-10-10T14:00:00Z'),
    },
  });

  console.log('✅ Database seeding (Module 2) finished successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
