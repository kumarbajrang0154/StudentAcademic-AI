export {
  attendancePercent,
  safeBunks,
  classesToRecover,
  predictedAttendance,
} from "./attendance.js";

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
