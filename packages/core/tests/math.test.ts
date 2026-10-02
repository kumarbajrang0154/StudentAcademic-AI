import { describe, it, expect } from "vitest";
import {
  attendancePercent,
  safeBunks,
  classesToRecover,
  predictedAttendance,
} from "../src/attendance.js";
import { courseMastery } from "../src/mastery.js";
import { velocity, velocityBand } from "../src/velocity.js";
import { percentile } from "../src/percentile.js";
import { riskScore, academicMetricsToRiskInputs } from "../src/risk.js";

describe("packages/core - Attendance Calculations", () => {
  it("attendancePercent returns 100 when total sessions T = 0", () => {
    expect(attendancePercent(0, 0, 0)).toBe(100);
    expect(attendancePercent(5, 2, 0)).toBe(100);
  });

  it("attendancePercent calculates standard attendance correctly", () => {
    // 35 / 42 = 83.333...%
    const pct = attendancePercent(30, 5, 42);
    expect(Math.round(pct * 100) / 100).toBe(83.33);
  });

  it("attendancePercent handles exactly 75%", () => {
    expect(attendancePercent(75, 0, 100)).toBe(75);
  });

  it("worked example must pass: P+OD=35, T=42 -> safeBunks = 4, and 35/46 = 76.09%", () => {
    const P = 30;
    const OD = 5;
    const T = 42;
    const bunks = safeBunks(P, OD, T, 0.75);
    expect(bunks).toBe(4);

    // Verify 35 / 46 = 76.0869...% -> rounds to 76.09%
    const postBunkAttendance = attendancePercent(P, OD, T + bunks);
    expect(Math.round(postBunkAttendance * 100) / 100).toBe(76.09);
    expect(postBunkAttendance).toBeGreaterThanOrEqual(75);

    // One more bunk would drop it below 75%
    const invalidBunkAttendance = attendancePercent(P, OD, T + bunks + 1);
    expect(invalidBunkAttendance).toBeLessThan(75);
  });

  it("safeBunks returns 0 when already below threshold", () => {
    // 60% attendance
    expect(safeBunks(60, 0, 100, 0.75)).toBe(0);
  });

  it("safeBunks returns 0 when exactly at 75%", () => {
    expect(safeBunks(75, 0, 100, 0.75)).toBe(0);
  });

  it("safeBunks handles T = 0", () => {
    expect(safeBunks(0, 0, 0, 0.75)).toBe(0);
  });

  it("classesToRecover calculates minimum classes needed to reach threshold", () => {
    // 30 / 50 = 60%, needs to reach 75%
    // (30 + m)/(50 + m) >= 0.75 => m = 30
    const m = classesToRecover(30, 0, 50, 0.75);
    expect(m).toBe(30);

    // At 30: (30 + 30) / (50 + 30) = 60 / 80 = 75%
    expect(attendancePercent(30 + m, 0, 50 + m)).toBe(75);

    // At 29: 59 / 79 = 74.68% < 75%
    expect(attendancePercent(30 + m - 1, 0, 50 + m - 1)).toBeLessThan(75);
  });

  it("classesToRecover returns 0 if already above or equal to threshold", () => {
    expect(classesToRecover(75, 0, 100, 0.75)).toBe(0);
    expect(classesToRecover(80, 0, 100, 0.75)).toBe(0);
    expect(classesToRecover(0, 0, 0, 0.75)).toBe(0);
  });

  it("predictedAttendance correctly forecasts attendance if attending or absent", () => {
    const P = 35;
    const OD = 0;
    const T = 42;
    const N = 4;

    const attendFuture = predictedAttendance(P, OD, T, N, true);
    // (35 + 4) / (42 + 4) = 39 / 46 = 84.78%
    expect(Math.round(attendFuture * 100) / 100).toBe(84.78);

    const bunkFuture = predictedAttendance(P, OD, T, N, false);
    // 35 / 46 = 76.09%
    expect(Math.round(bunkFuture * 100) / 100).toBe(76.09);
  });
});

describe("packages/core - Course Mastery Calculations", () => {
  it("excludes pending and zero-max components, normalizes proportionally if total weight < 100", () => {
    const components = [
      { name: "Quiz 1", score: 18, maxScore: 20, weight: 25 }, // 90% of 25 = 22.5
      {
        name: "Midterm",
        score: null,
        maxScore: 50,
        weight: 35,
        isPending: true,
      }, // pending: excluded
      { name: "Bonus Challenge", score: 5, maxScore: 0, weight: 10 }, // zero-max: excluded
      { name: "Assignment 1", score: 20, maxScore: 25, weight: 25 }, // 80% of 25 = 20.0
    ];

    // Total evaluated weight = 25 + 25 = 50
    // Weighted sum = 22.5 + 20.0 = 42.5
    // Normalized to 100: (42.5 / 50) * 100 = 85.0
    const mastery = courseMastery(components);
    expect(mastery).toBe(85);
  });

  it("calculates exact mastery when evaluated components total weight = 100", () => {
    const components = [
      { score: 40, maxScore: 50, weight: 50 }, // 80% of 50 = 40
      { score: 45, maxScore: 50, weight: 50 }, // 90% of 50 = 45
    ];
    expect(courseMastery(components)).toBe(85);
  });

  it("throws an error if total weight exceeds 100", () => {
    const components = [
      { score: 40, maxScore: 50, weight: 60 },
      { score: 45, maxScore: 50, weight: 50 },
    ];
    expect(() => courseMastery(components)).toThrow(
      "Total assessment weight exceeds 100",
    );
  });

  it("returns 0 when no valid components exist", () => {
    expect(courseMastery([])).toBe(0);
    expect(
      courseMastery([
        { score: null, maxScore: 50, weight: 30, isPending: true },
      ]),
    ).toBe(0);
    expect(courseMastery([{ score: 10, maxScore: 0, weight: 30 }])).toBe(0);
  });
});

describe("packages/core - Velocity & Velocity Bands", () => {
  it("calculates velocity accurately over time", () => {
    expect(velocity(60, 75, 30)).toBe(0.5);
    expect(velocity(80, 70, 20)).toBe(-0.5);
  });

  it("throws error if days <= 0", () => {
    expect(() => velocity(50, 60, 0)).toThrow(
      "Elapsed days must be greater than zero",
    );
  });

  it("assigns correct velocity bands", () => {
    expect(velocityBand(0.6)).toBe("RAPID_IMPROVEMENT");
    expect(velocityBand(0.5)).toBe("RAPID_IMPROVEMENT");
    expect(velocityBand(0.2)).toBe("IMPROVING");
    expect(velocityBand(0.0)).toBe("STABLE");
    expect(velocityBand(-0.05)).toBe("STABLE");
    expect(velocityBand(-0.3)).toBe("DECLINING");
    expect(velocityBand(-0.5)).toBe("RAPID_DECLINE");
    expect(velocityBand(-0.8)).toBe("RAPID_DECLINE");
  });
});

describe("packages/core - Percentile Calculations", () => {
  it("returns null and reason if cohort size is less than 15", () => {
    const smallCohort = [50, 60, 70, 80, 90];
    const res = percentile(70, smallCohort);
    expect(res.percentile).toBeNull();
    expect(res.reason).toContain("Cohort size must be at least 15");
  });

  it("calculates percentile rank correctly when cohort size >= 15", () => {
    // 20 students with scores 10, 20, 30, ..., 200
    const cohort = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    // Student with score 100:
    // Below 100: 10..90 (9 scores)
    // Equal 100: 1 score
    // Rank = (9 + 0.5) / 20 * 100 = 9.5 / 20 * 100 = 47.5%
    const res = percentile(100, cohort);
    expect(res.percentile).toBe(47.5);
    expect(res.reason).toBeUndefined();
  });
});

describe("packages/core - Risk Score Engine", () => {
  it("calculates risk score and categorizes into SAFE, MODERATE, and CRITICAL", () => {
    // Safe case: low risk inputs
    const safeInputs = {
      attendance: 10,
      mastery: 15,
      velocity: 20,
      submission: 10,
    };
    const safeRes = riskScore(safeInputs);
    // 10*0.35 + 15*0.35 + 20*0.15 + 10*0.15 = 3.5 + 5.25 + 3.0 + 1.5 = 13.25
    expect(safeRes.score).toBe(13.25);
    expect(safeRes.category).toBe("SAFE");

    // Moderate case: 30 <= score < 65
    const modInputs = {
      attendance: 45,
      mastery: 40,
      velocity: 50,
      submission: 30,
    };
    const modRes = riskScore(modInputs);
    // 45*0.35 + 40*0.35 + 50*0.15 + 30*0.15 = 15.75 + 14.0 + 7.5 + 4.5 = 41.75
    expect(modRes.score).toBe(41.75);
    expect(modRes.category).toBe("MODERATE");

    // Critical case: score >= 65
    const critInputs = {
      attendance: 70,
      mastery: 75,
      velocity: 65,
      submission: 60,
    };
    const critRes = riskScore(critInputs);
    // 70*0.35 + 75*0.35 + 65*0.15 + 60*0.15 = 24.5 + 26.25 + 9.75 + 9.0 = 69.5
    expect(critRes.score).toBe(69.5);
    expect(critRes.category).toBe("CRITICAL");
  });

  it("clamps results to [0, 100]", () => {
    const extremeLow = riskScore({
      attendance: -20,
      mastery: -10,
      velocity: -5,
      submission: 0,
    });
    expect(extremeLow.score).toBe(0);
    expect(extremeLow.category).toBe("SAFE");

    const extremeHigh = riskScore({
      attendance: 150,
      mastery: 120,
      velocity: 110,
      submission: 105,
    });
    expect(extremeHigh.score).toBe(100);
    expect(extremeHigh.category).toBe("CRITICAL");
  });

  it("converts academic performance metrics to risk inputs properly", () => {
    const inputs = academicMetricsToRiskInputs(90, 85, 0.4, 95);
    expect(inputs.attendance).toBe(10);
    expect(inputs.mastery).toBe(15);
    expect(inputs.submission).toBe(5);
    expect(inputs.velocity).toBe(30); // 50 - 0.4*50 = 30
  });
});
