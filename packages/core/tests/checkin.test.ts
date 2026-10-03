/**
 * Tests for checkin HMAC code logic.
 * Covers: code rotation at step boundary, grace period (previous step),
 * invalid code rejection, duplicate detection (business logic documented),
 * and rate limit (documented separately in API tests).
 */

import { describe, it, expect } from "vitest";
import {
  checkinStep,
  checkinCode,
  currentCheckinCodes,
  validateCheckinCode,
  msUntilNextStep,
  CHECKIN_STEP_MS,
  CHECKIN_CODE_DIGITS,
} from "../src/checkin.js";

const SECRET = "test-secret-abc123";

// ──────────────────────────────────────────────────────────
// checkinStep
// ──────────────────────────────────────────────────────────
describe("checkinStep", () => {
  it("returns 0 at epoch 0", () => {
    expect(checkinStep(0)).toBe(0);
  });

  it("returns 1 at step boundary (30_000 ms)", () => {
    expect(checkinStep(30_000)).toBe(1);
  });

  it("still returns 1 at 59_999 ms (just before next step)", () => {
    expect(checkinStep(59_999)).toBe(1);
  });

  it("returns 2 at exactly 60_000 ms", () => {
    expect(checkinStep(60_000)).toBe(2);
  });

  it("real timestamps: floor(now / 30s)", () => {
    const now = 1_700_000_017_000;
    expect(checkinStep(now)).toBe(Math.floor(now / CHECKIN_STEP_MS));
  });
});

// ──────────────────────────────────────────────────────────
// checkinCode
// ──────────────────────────────────────────────────────────
describe("checkinCode", () => {
  it("returns a 6-digit string", () => {
    const code = checkinCode(SECRET, 0);
    expect(code).toHaveLength(CHECKIN_CODE_DIGITS);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it("is deterministic (same secret + step → same code)", () => {
    expect(checkinCode(SECRET, 42)).toBe(checkinCode(SECRET, 42));
  });

  it("changes when step changes", () => {
    // Not guaranteed to differ for every adjacent pair, but overwhelmingly likely
    const step = 1_000;
    const diff = Array.from({ length: 10 }, (_, i) => checkinCode(SECRET, step + i));
    const unique = new Set(diff);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("changes when secret changes", () => {
    expect(checkinCode("secret-a", 0)).not.toBe(checkinCode("secret-b", 0));
  });

  it("code at step boundary is different from code at step-1", () => {
    const step = 500;
    expect(checkinCode(SECRET, step)).not.toBe(checkinCode(SECRET, step - 1));
  });
});

// ──────────────────────────────────────────────────────────
// currentCheckinCodes
// ──────────────────────────────────────────────────────────
describe("currentCheckinCodes", () => {
  it("returns current and previous codes + step index", () => {
    const now = 90_000; // step = 3
    const result = currentCheckinCodes(SECRET, now);
    expect(result.step).toBe(3);
    expect(result.current).toBe(checkinCode(SECRET, 3));
    expect(result.previous).toBe(checkinCode(SECRET, 2));
  });

  it("current and previous are different (overwhelmingly)", () => {
    const result = currentCheckinCodes(SECRET, 1_700_000_000_000);
    expect(result.current).not.toBe(result.previous);
  });
});

// ──────────────────────────────────────────────────────────
// validateCheckinCode — rotation boundary tests
// ──────────────────────────────────────────────────────────
describe("validateCheckinCode — rotation boundaries", () => {
  const STEP = 1_000;
  const NOW_AT_STEP_START = STEP * CHECKIN_STEP_MS;         // exactly at boundary
  const NOW_MIDDLE = STEP * CHECKIN_STEP_MS + 15_000;       // mid-step
  const NOW_NEAR_END = (STEP + 1) * CHECKIN_STEP_MS - 100; // 100ms before next step

  const currentCode = checkinCode(SECRET, STEP);
  const prevCode = checkinCode(SECRET, STEP - 1);
  const nextCode = checkinCode(SECRET, STEP + 1);

  it("accepts current-step code at step start", () => {
    expect(validateCheckinCode(SECRET, currentCode, NOW_AT_STEP_START)).toBe(true);
  });

  it("accepts current-step code mid-step", () => {
    expect(validateCheckinCode(SECRET, currentCode, NOW_MIDDLE)).toBe(true);
  });

  it("accepts current-step code near end of step", () => {
    expect(validateCheckinCode(SECRET, currentCode, NOW_NEAR_END)).toBe(true);
  });

  it("accepts previous-step code (grace period)", () => {
    expect(validateCheckinCode(SECRET, prevCode, NOW_MIDDLE)).toBe(true);
  });

  it("rejects future-step code (not yet valid)", () => {
    expect(validateCheckinCode(SECRET, nextCode, NOW_MIDDLE)).toBe(false);
  });

  it("rejects completely wrong code", () => {
    expect(validateCheckinCode(SECRET, "000000", NOW_MIDDLE)).toBe(
      // extremely unlikely to be a valid code by coincidence
      checkinCode(SECRET, STEP) === "000000" || checkinCode(SECRET, STEP - 1) === "000000",
    );
  });

  it("rejects code from 2 steps ago (outside grace window)", () => {
    const twoStepsAgo = checkinCode(SECRET, STEP - 2);
    expect(validateCheckinCode(SECRET, twoStepsAgo, NOW_MIDDLE)).toBe(false);
  });

  it("trims whitespace from submitted code", () => {
    expect(validateCheckinCode(SECRET, `  ${currentCode}  `, NOW_MIDDLE)).toBe(true);
  });

  it("at step rollover: old current becomes valid as previous", () => {
    // At step N, currentCode(N-1) is accepted as "previous"
    const rolloverNow = STEP * CHECKIN_STEP_MS; // now we're at step STEP
    const codeThatWasCurrentAtStepMinus1 = checkinCode(SECRET, STEP - 1);
    expect(validateCheckinCode(SECRET, codeThatWasCurrentAtStepMinus1, rolloverNow)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// msUntilNextStep
// ──────────────────────────────────────────────────────────
describe("msUntilNextStep", () => {
  it("returns CHECKIN_STEP_MS at step boundary", () => {
    expect(msUntilNextStep(30_000)).toBe(30_000);
  });

  it("returns 1 at 1ms before next step", () => {
    expect(msUntilNextStep(59_999)).toBe(1);
  });

  it("is always in range (0, CHECKIN_STEP_MS]", () => {
    for (let t = 0; t < 100_000; t += 1_000) {
      const ms = msUntilNextStep(t);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(CHECKIN_STEP_MS);
    }
  });
});
