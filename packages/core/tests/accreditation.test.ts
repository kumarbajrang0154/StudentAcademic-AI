import { describe, it, expect } from "vitest";
import {
  coScore,
  coAttainmentLevel,
  COAttainment,
  poAttainment,
  programPOAttainment,
  CO_TARGET,
  ATTAINMENT_LEVEL_1_THRESHOLD,
  ATTAINMENT_LEVEL_2_THRESHOLD,
  ATTAINMENT_LEVEL_3_THRESHOLD,
} from "../src/index.js";

describe("Accreditation Calculations (OBE / NBA)", () => {
  it("exports exact documented OBE constants", () => {
    expect(CO_TARGET).toBe(60);
    expect(ATTAINMENT_LEVEL_1_THRESHOLD).toBe(50);
    expect(ATTAINMENT_LEVEL_2_THRESHOLD).toBe(60);
    expect(ATTAINMENT_LEVEL_3_THRESHOLD).toBe(70);
  });
  describe("coScore", () => {
    it("computes exact percentage from question scores tagged with a CO", () => {
      // Hand-checked: Q1 (4/5), Q2 (8/10), Q3 (12/15)
      // Total score = 4 + 8 + 12 = 24
      // Total max = 5 + 10 + 15 = 30
      // coScore = (24 / 30) * 100 = 80.0%
      const score = coScore([
        { score: 4, maxScore: 5 },
        { score: 8, maxScore: 10 },
        { score: 12, maxScore: 15 },
      ]);
      expect(score).toBe(80);
    });

    it("returns null for empty questions or unassessed students", () => {
      expect(coScore([])).toBeNull();
      expect(coScore([{ score: 0, maxScore: 0 }])).toBeNull();
    });

    it("handles zero scores correctly when questions exist", () => {
      // Student scored 0 on a 10-mark question
      const score = coScore([{ score: 0, maxScore: 10 }]);
      expect(score).toBe(0);
    });
  });

  describe("coAttainmentLevel boundaries", () => {
    it("maps exact boundary percentages to the correct attainment level", () => {
      expect(coAttainmentLevel(70.0)).toBe(3);
      expect(coAttainmentLevel(75.5)).toBe(3);
      expect(coAttainmentLevel(69.99)).toBe(2);
      expect(coAttainmentLevel(60.0)).toBe(2);
      expect(coAttainmentLevel(59.99)).toBe(1);
      expect(coAttainmentLevel(50.0)).toBe(1);
      expect(coAttainmentLevel(49.99)).toBe(0);
      expect(coAttainmentLevel(0.0)).toBe(0);
    });
  });

  describe("COAttainment", () => {
    it("hand-checked: calculates attainment % and level, excluding unassessed students", () => {
      // 5 students enrolled:
      // Student 1: 85% (>= 60, meets target)
      // Student 2: 60% (>= 60, meets target exact boundary)
      // Student 3: 45% (< 60, fails target)
      // Student 4: null (unassessed, e.g. absent from CO assessment)
      // Student 5: 72% (>= 60, meets target)
      //
      // Total enrolled = 5
      // Assessed = 4 (Student 4 excluded)
      // Target count = 3 (Students 1, 2, 5)
      // Attainment % = (3 / 4) * 100 = 75.0%
      // Level = 3 (75% >= 70%)
      const result = COAttainment({
        coScores: [85, 60, 45, null, 72],
      });

      expect(result.studentsEnrolled).toBe(5);
      expect(result.studentsAssessed).toBe(4);
      expect(result.targetCount).toBe(3);
      expect(result.attainmentPercentage).toBe(75.0);
      expect(result.level).toBe(3);
    });

    it("returns level 0 when zero assessed students exist", () => {
      const result = COAttainment({
        coScores: [null, null],
      });
      expect(result.studentsEnrolled).toBe(2);
      expect(result.studentsAssessed).toBe(0);
      expect(result.targetCount).toBe(0);
      expect(result.attainmentPercentage).toBe(0);
      expect(result.level).toBe(0);
    });

    it("verifies level 2 and level 1 transitions", () => {
      // 10 students: 6 meet target -> 60% -> Level 2
      const level2Res = COAttainment({
        coScores: [70, 70, 70, 70, 70, 70, 40, 40, 40, 40],
      });
      expect(level2Res.attainmentPercentage).toBe(60);
      expect(level2Res.level).toBe(2);

      // 10 students: 5 meet target -> 50% -> Level 1
      const level1Res = COAttainment({
        coScores: [70, 70, 70, 70, 70, 40, 40, 40, 40, 40],
      });
      expect(level1Res.attainmentPercentage).toBe(50);
      expect(level1Res.level).toBe(1);

      // 10 students: 4 meet target -> 40% -> Level 0
      const level0Res = COAttainment({
        coScores: [70, 70, 70, 70, 40, 40, 40, 40, 40, 40],
      });
      expect(level0Res.attainmentPercentage).toBe(40);
      expect(level0Res.level).toBe(0);
    });
  });

  describe("POAttainment (Course level)", () => {
    it("hand-checked: weighted average of CO levels mapped via CoPoMapping weights", () => {
      // CO1: Level 3, Weight 3 -> 3 * 3 = 9
      // CO2: Level 2, Weight 2 -> 2 * 2 = 4
      // CO3: Level 1, Weight 1 -> 1 * 1 = 1
      // Sum weights = 3 + 2 + 1 = 6
      // PO Attainment = (9 + 4 + 1) / 6 = 14 / 6 = 2.33
      const po = poAttainment([
        { coLevel: 3, weight: 3 },
        { coLevel: 2, weight: 2 },
        { coLevel: 1, weight: 1 },
      ]);
      expect(po).toBe(2.33);
    });

    it("returns 0 when mappings array is empty or weights sum to 0", () => {
      expect(poAttainment([])).toBe(0);
      expect(poAttainment([{ coLevel: 3, weight: 0 }])).toBe(0);
    });
  });

  describe("programPOAttainment (Department / Program level)", () => {
    it("hand-checked: averages PO attainment across department courses", () => {
      // Course 1 PO1 = 2.33
      // Course 2 PO1 = 2.67
      // Course 3 PO1 = 2.00
      // Program PO1 = (2.33 + 2.67 + 2.00) / 3 = 7.00 / 3 = 2.33
      const programPO = programPOAttainment([2.33, 2.67, 2.0]);
      expect(programPO).toBe(2.33);
    });

    it("returns 0 if empty course array", () => {
      expect(programPOAttainment([])).toBe(0);
    });
  });
});
