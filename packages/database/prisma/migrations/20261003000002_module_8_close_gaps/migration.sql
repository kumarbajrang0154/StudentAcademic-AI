-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('CAT1', 'CAT2', 'QUIZ', 'ASSIGNMENT', 'LAB', 'FINAL', 'OTHER');

-- AlterTable Assessment
ALTER TABLE "Assessment" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Assessment" ALTER COLUMN "type" TYPE "AssessmentType" USING (
  CASE "type"
    WHEN 'CAT1' THEN 'CAT1'::"AssessmentType"
    WHEN 'CAT2' THEN 'CAT2'::"AssessmentType"
    WHEN 'QUIZ' THEN 'QUIZ'::"AssessmentType"
    WHEN 'ASSIGNMENT' THEN 'ASSIGNMENT'::"AssessmentType"
    WHEN 'LAB' THEN 'LAB'::"AssessmentType"
    WHEN 'FINAL' THEN 'FINAL'::"AssessmentType"
    WHEN 'MIDTERM' THEN 'CAT1'::"AssessmentType"
    WHEN 'PROJECT' THEN 'CAT2'::"AssessmentType"
    WHEN 'FINAL_EXAM' THEN 'FINAL'::"AssessmentType"
    ELSE 'OTHER'::"AssessmentType"
  END
);
ALTER TABLE "Assessment" ALTER COLUMN "type" SET DEFAULT 'OTHER'::"AssessmentType";

-- AlterTable CourseEnrollment
ALTER TABLE "CourseEnrollment" ADD COLUMN "failRisk" TEXT DEFAULT 'ON_TRACK',
ADD COLUMN "weakSubjectFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "attendanceWarningLevel" TEXT DEFAULT 'NONE';

-- CreateTable AnalysisRun
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "enrollmentsProcessed" INTEGER NOT NULL DEFAULT 0,
    "newWarnings" INTEGER NOT NULL DEFAULT 0,
    "newCriticals" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisRun_startedAt_idx" ON "AnalysisRun"("startedAt");
