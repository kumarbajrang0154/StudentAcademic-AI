/**
 * QR / Code Self Check-in — pure HMAC logic.
 *
 * Protocol (TOTP-like, 30-second steps):
 *   step      = floor(Date.now() / 30_000)
 *   code      = HMAC-SHA256(secret, String(step)).slice(0, 3) interpreted as uint24 mod 1_000_000
 *               padded to 6 digits with leading zeros
 *
 * Validity: a submitted code is accepted if it matches the CURRENT step
 * or the PREVIOUS step (30-second grace period for clock skew / slow typing).
 *
 * Security note: shared-code proxying is possible — the faculty review step remains
 * required; nothing is auto-marked absent without faculty commit. This is documented
 * in the UI and README.
 */

import { createHmac } from "node:crypto";

/** How many milliseconds per code step */
export const CHECKIN_STEP_MS = 30_000;

/** Number of digits in the displayed code */
export const CHECKIN_CODE_DIGITS = 6;

/**
 * Derive the current step index from a given timestamp.
 * @param nowMs  epoch milliseconds (default: Date.now())
 */
export function checkinStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / CHECKIN_STEP_MS);
}

/**
 * Derive a 6-digit HMAC code for a given secret and step.
 * Pure function — deterministic given same inputs.
 */
export function checkinCode(secret: string, step: number): string {
  const hmac = createHmac("sha256", secret)
    .update(String(step))
    .digest();

  // Use first 3 bytes as uint24, mod 1_000_000
  const num =
    ((hmac[0]! << 16) | (hmac[1]! << 8) | hmac[2]!) % 1_000_000;

  return num.toString().padStart(CHECKIN_CODE_DIGITS, "0");
}

/**
 * Return the code(s) that are currently valid for a given secret.
 * Both the current step and the previous step are valid (±30s clock tolerance).
 */
export function currentCheckinCodes(
  secret: string,
  nowMs: number = Date.now(),
): { current: string; previous: string; step: number } {
  const step = checkinStep(nowMs);
  return {
    step,
    current: checkinCode(secret, step),
    previous: checkinCode(secret, step - 1),
  };
}

/**
 * Validate a submitted code against the secret.
 * Returns true only if the code matches the current or previous step.
 */
export function validateCheckinCode(
  secret: string,
  submitted: string,
  nowMs: number = Date.now(),
): boolean {
  const step = checkinStep(nowMs);
  const expected = [
    checkinCode(secret, step),
    checkinCode(secret, step - 1),
  ];
  // Constant-time-safe enough for this threat model (code is short-lived and low-stakes)
  return expected.includes(submitted.trim());
}

/**
 * Milliseconds remaining in the current step (for countdown display).
 */
export function msUntilNextStep(nowMs: number = Date.now()): number {
  return CHECKIN_STEP_MS - (nowMs % CHECKIN_STEP_MS);
}
