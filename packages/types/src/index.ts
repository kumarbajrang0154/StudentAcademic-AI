import { z } from "zod";

// ==========================================
// System Enums
// ==========================================

export const RoleEnum = z.enum([
  "STUDENT",
  "FACULTY",
  "MENTOR",
  "HOD",
  "ADMIN",
]);
export type Role = z.infer<typeof RoleEnum>;

export const RiskCategoryEnum = z.enum(["SAFE", "MODERATE", "CRITICAL"]);
export type RiskCategory = z.infer<typeof RiskCategoryEnum>;

export const AttendanceStatusEnum = z.enum([
  "PRESENT",
  "ABSENT",
  "ON_DUTY",
  "MEDICAL_LEAVE",
]);
export type AttendanceStatus = z.infer<typeof AttendanceStatusEnum>;

export const InterventionStatusEnum = z.enum([
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);
export type InterventionStatus = z.infer<typeof InterventionStatusEnum>;

export const VelocityBandEnum = z.enum([
  "RAPID_IMPROVEMENT",
  "IMPROVING",
  "STABLE",
  "DECLINING",
  "RAPID_DECLINE",
]);
export type VelocityBand = z.infer<typeof VelocityBandEnum>;

// ==========================================
// Core Math Engine Types & Schemas
// ==========================================

export const AttendanceInputSchema = z.object({
  present: z.number().int().nonnegative(),
  onDuty: z.number().int().nonnegative(),
  totalSessions: z.number().int().nonnegative(),
  theta: z.number().positive().max(1).default(0.75),
});
export type AttendanceInput = z.infer<typeof AttendanceInputSchema>;

export const MasteryComponentSchema = z.object({
  name: z.string().optional(),
  score: z.number().nonnegative().nullable().optional(),
  maxScore: z.number().positive(),
  weight: z.number().positive().max(100),
  isPending: z.boolean().optional(),
});
export type MasteryComponent = z.infer<typeof MasteryComponentSchema>;

export const VelocityInputSchema = z.object({
  m1: z.number(),
  m2: z.number(),
  days: z.number().positive(),
});
export type VelocityInput = z.infer<typeof VelocityInputSchema>;

export const PercentileResultSchema = z.object({
  percentile: z.number().nullable(),
  reason: z.string().optional(),
});
export type PercentileResult = z.infer<typeof PercentileResultSchema>;

export const RiskInputsSchema = z.object({
  attendance: z.number().min(0).max(100),
  mastery: z.number().min(0).max(100),
  velocity: z.number().min(0).max(100),
  submission: z.number().min(0).max(100),
});
export type RiskInputs = z.infer<typeof RiskInputsSchema>;

export const RiskWeightsSchema = z.object({
  attendance: z.number().min(0).max(1).default(0.35),
  mastery: z.number().min(0).max(1).default(0.35),
  velocity: z.number().min(0).max(1).default(0.15),
  submission: z.number().min(0).max(1).default(0.15),
});
export type RiskWeights = z.infer<typeof RiskWeightsSchema>;

export const RiskResultSchema = z.object({
  score: z.number().min(0).max(100),
  category: RiskCategoryEnum,
  breakdown: z.object({
    attendanceContribution: z.number(),
    masteryContribution: z.number(),
    velocityContribution: z.number(),
    submissionContribution: z.number(),
  }),
});
export type RiskResult = z.infer<typeof RiskResultSchema>;

// ==========================================
// API & Health Schemas
// ==========================================

export const HealthCheckResponseSchema = z.object({
  status: z.literal("ok"),
  db: z.enum(["up", "down"]),
  redis: z.enum(["up", "down"]),
  timestamp: z.string().datetime().optional(),
  uptime: z.number().optional(),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

// ==========================================
// Entity Payloads & Domain Models
// ==========================================

export const UserSchema = z.object({
  id: z.string().cuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: RoleEnum,
  departmentId: z.string().cuid().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

export const DepartmentSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Department = z.infer<typeof DepartmentSchema>;

export const CourseSchema = z.object({
  id: z.string().cuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  departmentId: z.string().cuid(),
  credits: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Course = z.infer<typeof CourseSchema>;

export const CourseAssessmentWeightValidationSchema = z
  .array(
    z.object({
      id: z.string().cuid().optional(),
      title: z.string().min(1),
      weight: z.number().positive().max(100),
    }),
  )
  .refine(
    (items) => {
      const sum = items.reduce((acc, curr) => acc + curr.weight, 0);
      return sum <= 100;
    },
    {
      message:
        "The total weight of assessments for a course must not exceed 100.",
    },
  );
