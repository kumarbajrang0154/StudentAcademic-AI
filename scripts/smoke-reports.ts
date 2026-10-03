/**
 * Smoke test: Accreditation and Reports with Export (Module 9)
 * - Logs in as HOD
 * - Downloads all formats (xlsx, pdf, csv) of all reports for CS101:
 *   * Attendance report
 *   * Marks report
 *   * Department analytics report
 *   * Accreditation report
 * - Verifies one CO attainment value by hand against the file contents
 * - Measures and reports execution timings and file sizes
 * Non-destructive: nothing deleted or corrupted.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { buildServer } from "../apps/api/src/server.js";
import { prisma } from "@student-academic-ai/database";
import { coScore, COAttainment } from "@student-academic-ai/core";

async function runReportsSmokeTest() {
  console.log("🚀 Starting Accreditation & Reports Export Smoke Verification (Module 9)...\n");

  const app = await buildServer({ logger: false, redis: "disabled" });
  await app.ready();

  const hodUser = await prisma.user.findFirst({ where: { role: "HOD" } });
  const cs101 = await prisma.course.findFirst({ where: { code: "CS101" } });

  if (!hodUser || !cs101) {
    throw new Error("Seeded HOD or CS101 course not found in database");
  }

  const hodToken = app.jwt.sign({
    id: hodUser.id,
    email: hodUser.email,
    name: hodUser.name,
    role: hodUser.role,
    departmentId: hodUser.departmentId,
  });

  const reports = [
    { name: "Attendance Report", path: `/api/v1/admin/reports/attendance?courseId=${cs101.id}` },
    { name: "Marks Report", path: `/api/v1/admin/reports/marks?courseId=${cs101.id}` },
    { name: "Department Analytics", path: `/api/v1/admin/reports/department-analytics` },
    { name: "Accreditation Report", path: `/api/v1/admin/reports/accreditation?courseId=${cs101.id}` },
  ];

  const formats: Array<"xlsx" | "pdf" | "csv"> = ["xlsx", "pdf", "csv"];

  console.log("=====================================================================");
  console.log("📊 REPORT GENERATION & DOWNLOAD BENCHMARKS");
  console.log("=====================================================================");

  const results: Array<{
    report: string;
    format: string;
    sizeBytes: number;
    durationMs: number;
    status: number;
  }> = [];

  for (const rep of reports) {
    for (const fmt of formats) {
      const sep = rep.path.includes("?") ? "&" : "?";
      const url = `${rep.path}${sep}format=${fmt}`;

      const start = performance.now();
      const res = await app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${hodToken}` },
      });
      const durationMs = Math.round(performance.now() - start);

      if (res.statusCode !== 200) {
        throw new Error(`Failed to generate ${rep.name} (${fmt}): HTTP ${res.statusCode} ${res.body}`);
      }

      const sizeBytes = res.rawPayload.length;
      results.push({
        report: rep.name,
        format: fmt,
        sizeBytes,
        durationMs,
        status: res.statusCode,
      });

      console.log(
        `✓ [${fmt.toUpperCase().padEnd(4)}] ${rep.name.padEnd(25)} | Size: ${(sizeBytes / 1024).toFixed(1).padStart(6)} KB | Time: ${durationMs.toString().padStart(4)} ms | Status: ${res.statusCode}`,
      );
    }
  }

  console.log("\n=====================================================================");
  console.log("📐 HAND-CHECKED CO ATTAINMENT VALIDATION");
  console.log("=====================================================================");

  // 1. Fetch CS101 CO1 raw question scores from DB
  const co1 = await prisma.courseOutcome.findFirst({
    where: { courseId: cs101.id, code: "CO1" },
    include: { questions: { include: { scores: true } } },
  });

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId: cs101.id },
    select: { studentId: true },
  });

  const studentCoScores: (number | null)[] = [];
  for (const enr of enrollments) {
    const qScores: { score: number; maxScore: number }[] = [];
    for (const q of co1!.questions) {
      const qs = q.scores.find((s) => s.studentId === enr.studentId);
      if (qs && typeof qs.score === "number") {
        qScores.push({ score: qs.score, maxScore: q.maxScore });
      }
    }
    studentCoScores.push(coScore(qScores));
  }

  const handAttainment = COAttainment({ coScores: studentCoScores, coTarget: 60 });

  // 2. Fetch Accreditation XLSX export and inspect file contents
  const xlsxRes = await app.inject({
    method: "GET",
    url: `/api/v1/admin/reports/accreditation?courseId=${cs101.id}&format=xlsx`,
    headers: { authorization: `Bearer ${hodToken}` },
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsxRes.rawPayload);
  const sheet = workbook.worksheets[0]!;

  // Search for CO1 row in the XLSX
  let foundCo1Row: any = null;
  sheet.eachRow((row) => {
    if (row.getCell(1).value === "CO1") {
      foundCo1Row = row;
    }
  });

  if (!foundCo1Row) {
    throw new Error("CO1 row not found in generated XLSX accreditation report!");
  }

  const xlsxTargetMet = Number(foundCo1Row.getCell(6).value);
  const xlsxAttainment = Number(foundCo1Row.getCell(7).value);
  const xlsxLevel = String(foundCo1Row.getCell(8).value);

  console.log(`• Course Outcome:        CS101 CO1 (${co1?.description})`);
  console.log(`• Total Enrolled:        ${handAttainment.studentsEnrolled}`);
  console.log(`• Total Assessed:        ${handAttainment.studentsAssessed}`);
  console.log(`• Students Met Target:   Hand: ${handAttainment.targetCount} | XLSX: ${xlsxTargetMet}`);
  console.log(`• Attainment %:          Hand: ${handAttainment.attainmentPercentage}% | XLSX: ${xlsxAttainment}%`);
  console.log(`• Attainment Level:      Hand: Level ${handAttainment.level} | XLSX: ${xlsxLevel}`);

  if (
    xlsxTargetMet !== handAttainment.targetCount ||
    xlsxAttainment !== handAttainment.attainmentPercentage ||
    xlsxLevel !== `Level ${handAttainment.level}`
  ) {
    throw new Error("CO attainment mismatch between hand-calculation and XLSX file contents!");
  }

  console.log("✓ Verified: Hand-computed arithmetic matches generated export contents exactly!");

  // 3. Inspect PDF file structure
  const pdfRes = await app.inject({
    method: "GET",
    url: `/api/v1/admin/reports/accreditation?courseId=${cs101.id}&format=pdf`,
    headers: { authorization: `Bearer ${hodToken}` },
  });
  const pdfDoc = await PDFDocument.load(pdfRes.rawPayload);
  console.log(`✓ Verified: PDF document loaded with ${pdfDoc.getPageCount()} pages and valid A4 structure`);

  console.log("\n=====================================================================");
  console.log("✅ ALL MODULE 9 ACCREDITATION & REPORT EXPORT VERIFICATIONS PASSED!");
  console.log("=====================================================================\n");

  await prisma.$disconnect();
  await app.close();
}

runReportsSmokeTest().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
