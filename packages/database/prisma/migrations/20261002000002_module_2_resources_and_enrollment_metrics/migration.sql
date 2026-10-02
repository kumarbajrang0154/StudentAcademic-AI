-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('VIDEO', 'TEXTBOOK', 'NOTES');

-- AlterTable
ALTER TABLE "CourseEnrollment" ADD COLUMN "attendanceRate" DOUBLE PRECISION,
ADD COLUMN "masteryScore" DOUBLE PRECISION,
ADD COLUMN "velocity" DOUBLE PRECISION,
ADD COLUMN "submissionDeficit" DOUBLE PRECISION,
ADD COLUMN "riskScore" DOUBLE PRECISION,
ADD COLUMN "riskCategory" "RiskCategory";

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "topicTag" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "chapterRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Resource_topicTag_idx" ON "Resource"("topicTag");
