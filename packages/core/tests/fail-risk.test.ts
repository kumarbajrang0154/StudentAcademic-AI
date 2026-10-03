import { describe, it, expect } from "vitest";
import { failRisk, PASS_MARK } from "../src/fail-risk.js";

describe("failRisk", () => {
  it("exports PASS_MARK as 40", () => {
    expect(PASS_MARK).toBe(40);
  });

  it("calculates projectedFinal as mastery + (velocity * 14) clamped 0-100", () => {
    // 50 + (1.5 * 14) = 50 + 21 = 71
    const res1 = failRisk({
      mastery: 50,
      velocity: 1.5,
      attendance: 85,
      riskCategory: "SAFE",
    });
    expect(res1.projectedFinal).toBe(71);

    // Negative velocity clamped at 0
    // 20 + (-2.0 * 14) = 20 - 28 = -8 -> clamped to 0
    const res2 = failRisk({
      mastery: 20,
      velocity: -2.0,
      attendance: 60,
      riskCategory: "CRITICAL",
    });
    expect(res2.projectedFinal).toBe(0);

    // High velocity clamped at 100
    // 95 + (1.0 * 14) = 109 -> clamped to 100
    const res3 = failRisk({
      mastery: 95,
      velocity: 1.0,
      attendance: 90,
      riskCategory: "SAFE",
    });
    expect(res3.projectedFinal).toBe(100);
  });

  describe("LIKELY_TO_FAIL classification", () => {
    it("classifies as LIKELY_TO_FAIL when projectedFinal < PASS_MARK (40)", () => {
      // 35 + (0 * 14) = 35 < 40
      const res = failRisk({
        mastery: 35,
        velocity: 0,
        attendance: 80,
        riskCategory: "MODERATE",
      });
      expect(res.label).toBe("LIKELY_TO_FAIL");
      expect(res.reasons.some((r) => r.includes("below pass mark 40%"))).toBe(true);
    });

    it("classifies as LIKELY_TO_FAIL when riskCategory is CRITICAL and mastery < 50 even if projectedFinal >= 40", () => {
      // 45 + (0.5 * 14) = 45 + 7 = 52 (>= 40), but CRITICAL and mastery=45 (< 50)
      const res = failRisk({
        mastery: 45,
        velocity: 0.5,
        attendance: 65,
        riskCategory: "CRITICAL",
      });
      expect(res.label).toBe("LIKELY_TO_FAIL");
      expect(res.reasons.some((r) => r.includes("Critical risk category"))).toBe(true);
    });

    it("includes low attendance warning in reasons when attendance < 75%", () => {
      const res = failRisk({
        mastery: 30,
        velocity: 0,
        attendance: 68,
        riskCategory: "CRITICAL",
      });
      expect(res.label).toBe("LIKELY_TO_FAIL");
      expect(res.reasons.some((r) => r.includes("Attendance 68% is below"))).toBe(true);
    });
  });

  describe("AT_RISK classification", () => {
    it("classifies as AT_RISK when projectedFinal is between 40 and 54.9", () => {
      // 48 + (0 * 14) = 48 (< 55 and >= 40)
      const res = failRisk({
        mastery: 48,
        velocity: 0,
        attendance: 80,
        riskCategory: "SAFE",
      });
      expect(res.label).toBe("AT_RISK");
      expect(res.reasons.some((r) => r.includes("below safe margin 55%"))).toBe(true);
    });

    it("classifies as AT_RISK when riskCategory is MODERATE", () => {
      // mastery 60, projected 60, but MODERATE risk
      const res = failRisk({
        mastery: 60,
        velocity: 0,
        attendance: 85,
        riskCategory: "MODERATE",
      });
      expect(res.label).toBe("AT_RISK");
      expect(res.reasons.some((r) => r.includes("MODERATE"))).toBe(true);
    });

    it("classifies as AT_RISK when attendance < 75%", () => {
      // mastery 70, projected 70, SAFE risk, but attendance 72%
      const res = failRisk({
        mastery: 70,
        velocity: 0,
        attendance: 72,
        riskCategory: "SAFE",
      });
      expect(res.label).toBe("AT_RISK");
      expect(res.reasons.some((r) => r.includes("below minimum 75%"))).toBe(true);
    });
  });

  describe("ON_TRACK classification", () => {
    it("classifies as ON_TRACK when projectedFinal >= 55, risk SAFE, and attendance >= 75%", () => {
      const res = failRisk({
        mastery: 75,
        velocity: 0.2,
        attendance: 88,
        riskCategory: "SAFE",
      });
      expect(res.label).toBe("ON_TRACK");
      expect(res.reasons.some((r) => r.includes("on track to clear pass mark"))).toBe(true);
    });

    it("boundary: exactly projectedFinal 55, attendance 75, risk SAFE -> ON_TRACK", () => {
      const res = failRisk({
        mastery: 55,
        velocity: 0,
        attendance: 75,
        riskCategory: "SAFE",
      });
      expect(res.label).toBe("ON_TRACK");
    });
  });
});
