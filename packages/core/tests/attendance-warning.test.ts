import { describe, it, expect } from "vitest";
import { attendanceWarningLevel } from "../src/attendance.js";

describe("attendanceWarningLevel", () => {
  describe("BREACH boundary (< 75.0%)", () => {
    it("returns BREACH for percent strictly below 75.0", () => {
      expect(attendanceWarningLevel(74.9, 0)).toBe("BREACH");
      expect(attendanceWarningLevel(70.0, 0)).toBe("BREACH");
      expect(attendanceWarningLevel(0.0, 0)).toBe("BREACH");
    });
  });

  describe("URGENT boundary (>= 75.0% and < 77.0%)", () => {
    it("returns URGENT at exact boundary 75.0%", () => {
      expect(attendanceWarningLevel(75.0, 0)).toBe("URGENT");
      expect(attendanceWarningLevel(75.0, 1)).toBe("URGENT");
    });

    it("returns URGENT just below 77.0%", () => {
      expect(attendanceWarningLevel(76.9, 1)).toBe("URGENT");
      expect(attendanceWarningLevel(76.99, 1)).toBe("URGENT");
    });
  });

  describe("WATCH boundary (>= 77.0% and < 80.0%, OR safeBunks <= 2)", () => {
    it("returns WATCH at exact boundary 77.0% even with many safe bunks", () => {
      expect(attendanceWarningLevel(77.0, 5)).toBe("WATCH");
      expect(attendanceWarningLevel(78.5, 4)).toBe("WATCH");
      expect(attendanceWarningLevel(79.9, 3)).toBe("WATCH");
    });

    it("returns WATCH at or above 80.0% if safeBunks <= 2", () => {
      expect(attendanceWarningLevel(80.0, 2)).toBe("WATCH");
      expect(attendanceWarningLevel(80.0, 1)).toBe("WATCH");
      expect(attendanceWarningLevel(80.0, 0)).toBe("WATCH");
      expect(attendanceWarningLevel(85.0, 2)).toBe("WATCH");
      expect(attendanceWarningLevel(95.0, 1)).toBe("WATCH");
    });
  });

  describe("NONE boundary (>= 80.0% AND safeBunks > 2)", () => {
    it("returns NONE at exact boundary 80.0% when safeBunks > 2", () => {
      expect(attendanceWarningLevel(80.0, 3)).toBe("NONE");
    });

    it("returns NONE for healthy attendance with safe bunks > 2", () => {
      expect(attendanceWarningLevel(82.5, 4)).toBe("NONE");
      expect(attendanceWarningLevel(90.0, 6)).toBe("NONE");
      expect(attendanceWarningLevel(100.0, 8)).toBe("NONE");
    });
  });
});
