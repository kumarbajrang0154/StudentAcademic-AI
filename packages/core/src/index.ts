export {
  attendancePercent,
  safeBunks,
  classesToRecover,
  predictedAttendance,
  attendanceWarningLevel,
  type AttendanceWarningLevel,
} from "./attendance.js";

export {
  failRisk,
  PASS_MARK,
  type FailRiskLabel,
  type FailRiskInputs,
  type FailRiskResult,
} from "./fail-risk.js";

export { courseMastery, type CourseMasteryComponent } from "./mastery.js";

export {
  velocity,
  velocityBand,
  negativeVelocityWarning,
  normalizeVelocityRisk,
  type VelocityBand,
} from "./velocity.js";

export { percentile, type PercentileResult } from "./percentile.js";

export {
  riskScore,
  explainRisk,
  academicMetricsToRiskInputs,
  DEFAULT_RISK_WEIGHTS,
  PLANNED_SESSIONS_PER_COURSE,
  type RiskCategory,
  type RiskInputs,
  type RiskWeights,
  type RiskResult,
  type FactorAttribution,
  type ProtectiveFactor,
  type RiskExplanation,
} from "./risk.js";

export {
  parseNumberWords,
  resolveRollToStudent,
  disambiguateToAndTwo,
  parseVoiceAttendance,
  parseVoiceMarks,
  type RosterStudent,
  type AttendanceEntryStatus,
  type ParsedAttendanceEntry,
  type VoiceAttendanceResult,
  type ParsedMarksEntry,
  type VoiceMarksResult,
} from "./voice.js";

export {
  findInterventionSlot,
  INTERVENTION_DURATION_MIN,
  type TimetableSlotInput,
  type ExistingInterventionInput,
  type FindSlotOptions,
  type SlotResult,
  type FindSlotResponse,
} from "./slot.js";

export {
  coScore,
  coAttainmentLevel,
  COAttainment,
  poAttainment,
  programPOAttainment,
  CO_TARGET,
  ATTAINMENT_LEVEL_3_THRESHOLD,
  ATTAINMENT_LEVEL_2_THRESHOLD,
  ATTAINMENT_LEVEL_1_THRESHOLD,
  type QuestionScoreItem,
  type COAttainmentResult,
  type CoPoWeightItem,
} from "./accreditation.js";

