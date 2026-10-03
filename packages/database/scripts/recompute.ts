/**
 * db:recompute — recomputes all CourseEnrollment metrics for every course.
 * Idempotent: safe to run multiple times. Logs before/after distribution.
 *
 * Reuses the same logic as the ADMIN "Run Analysis" button in the dashboard.
 *
 * Usage:
 *   npm run db:recompute
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { recomputeAllEnrollments } from "../../apps/api/src/services/enrollment.service.js";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 db:recompute — Recomputing all CourseEnrollment metrics...\n");

  const courses = await prisma.course.findMany({ select: { id: true, code: true } });
  console.log(`  Courses: ${courses.map(c => c.code).join(", ")}`);

  const total = await recomputeAllEnrollments();
  console.log(`\n✅ Done. Recomputed ${total} enrollments across ${courses.length} courses.`);

  // Print risk distribution
  const dist = await prisma.courseEnrollment.groupBy({
    by: ["riskCategory"],
    _count: true,
  });
  console.log("\n=== Global Risk Distribution ===");
  for (const row of dist) {
    console.log(`  ${row.riskCategory ?? "null"}: ${row._count}`);
  }

  // Print key demo scenario checks
  for (const email of ["student01@demo.edu", "student02@demo.edu", "student03@demo.edu"]) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) { console.log(`  ${email}: NOT FOUND`); continue; }
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { studentId: u.id },
      include: { course: { select: { code: true } } },
    });
    for (const e of enrollments) {
      console.log(`  ${email} / ${e.course.code}: risk=${e.riskCategory}, attendance=${e.attendanceRate}%, mastery=${e.masteryScore}%`);
    }
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("❌ db:recompute failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
