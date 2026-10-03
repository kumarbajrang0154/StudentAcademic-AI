-- AlterTable
ALTER TABLE "Intervention" ADD COLUMN     "actionItems" JSONB,
ADD COLUMN     "courseId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "durationMin" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "postScoreAvg" DOUBLE PRECISION,
ADD COLUMN     "preScoreAvg" DOUBLE PRECISION,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ALTER COLUMN "title" SET DEFAULT 'Academic Mentoring Session',
ALTER COLUMN "description" SET DEFAULT '',
ALTER COLUMN "scheduledFor" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MentorNote" (
    "id" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentorNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MentorNote_mentorId_studentId_idx" ON "MentorNote"("mentorId", "studentId");

-- CreateIndex
CREATE INDEX "MentorNote_studentId_idx" ON "MentorNote"("studentId");

-- CreateIndex
CREATE INDEX "Intervention_courseId_idx" ON "Intervention"("courseId");

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorNote" ADD CONSTRAINT "MentorNote_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorNote" ADD CONSTRAINT "MentorNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
