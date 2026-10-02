import { describe, it, expect } from "vitest";
import {
  parseNumberWords,
  resolveRollToStudent,
  disambiguateToAndTwo,
  parseVoiceAttendance,
  parseVoiceMarks,
  RosterStudent,
} from "../src/voice.js";

const mockRoster: RosterStudent[] = Array.from({ length: 40 }, (_, i) => {
  const padded = String(i + 1).padStart(2, "0");
  return {
    id: `student-id-${padded}`,
    rollNumber: `2026-CS-${padded}`,
    name: `Student ${padded}`,
  };
});

describe("packages/core - Voice Parser: parseNumberWords", () => {
  it("parses single digit numbers in digits and words", () => {
    expect(parseNumberWords("0")).toBe(0);
    expect(parseNumberWords("zero")).toBe(0);
    expect(parseNumberWords("oh")).toBe(0);
    expect(parseNumberWords("7")).toBe(7);
    expect(parseNumberWords("seven")).toBe(7);
  });

  it("parses teens correctly", () => {
    expect(parseNumberWords("eleven")).toBe(11);
    expect(parseNumberWords("twelve")).toBe(12);
    expect(parseNumberWords("thirteen")).toBe(13);
    expect(parseNumberWords("nineteen")).toBe(19);
  });

  it("parses compound numbers like 'forty two'", () => {
    expect(parseNumberWords("forty two")).toBe(42);
    expect(parseNumberWords("twenty five")).toBe(25);
    expect(parseNumberWords("ninety nine")).toBe(99);
  });

  it("handles Indian-English spelling variation 'fourty'", () => {
    expect(parseNumberWords("fourty two")).toBe(42);
  });

  it("parses digit-by-digit spoken numbers", () => {
    expect(parseNumberWords("one oh one")).toBe(101);
    expect(parseNumberWords("four two")).toBe(42);
    expect(parseNumberWords("one zero five")).toBe(105);
  });

  it("parses hundreds with and without 'and'", () => {
    expect(parseNumberWords("one hundred")).toBe(100);
    expect(parseNumberWords("one hundred five")).toBe(105);
    expect(parseNumberWords("one hundred and twenty")).toBe(120);
  });

  it("handles multiplier keywords like 'double' in speech", () => {
    expect(parseNumberWords("double zero seven")).toBe(7);
    expect(parseNumberWords("double two")).toBe(22);
  });

  it("returns null for unrecognized or non-number strings", () => {
    expect(parseNumberWords("hello")).toBeNull();
    expect(parseNumberWords("present")).toBeNull();
    expect(parseNumberWords("")).toBeNull();
    expect(parseNumberWords("   ")).toBeNull();
  });
});

describe("packages/core - Voice Parser: resolveRollToStudent", () => {
  it("resolves single digit numeric suffix to padded roll number", () => {
    const student = resolveRollToStudent(7, mockRoster);
    expect(student).not.toBeNull();
    expect(student?.rollNumber).toBe("2026-CS-07");
    expect(student?.id).toBe("student-id-07");
  });

  it("resolves roll 1 to student 01", () => {
    const student = resolveRollToStudent("1", mockRoster);
    expect(student?.rollNumber).toBe("2026-CS-01");
  });

  it("resolves double digit roll numbers", () => {
    const student = resolveRollToStudent(40, mockRoster);
    expect(student?.rollNumber).toBe("2026-CS-40");
  });

  it("returns null for unknown roll numbers outside roster", () => {
    expect(resolveRollToStudent(99, mockRoster)).toBeNull();
    expect(resolveRollToStudent(0, mockRoster)).toBeNull();
    expect(resolveRollToStudent("unknown", mockRoster)).toBeNull();
  });
});

describe("packages/core - Voice Parser: disambiguateToAndTwo", () => {
  it("preserves valid ranges like '101 to 105'", () => {
    expect(disambiguateToAndTwo("roll 101 to 105 present")).toContain("101 to 105");
  });

  it("converts 'roll to' into 'roll two'", () => {
    expect(disambiguateToAndTwo("roll to present")).toContain("roll two");
  });

  it("converts 'except to' into 'except two'", () => {
    expect(disambiguateToAndTwo("all present except to")).toContain("except two");
  });

  it("converts '101 two 105' into '101 to 105'", () => {
    expect(disambiguateToAndTwo("101 two 105")).toBe("101 to 105");
  });
});

describe("packages/core - Voice Parser: parseVoiceAttendance", () => {
  it("parses single roll present/absent", () => {
    const res = parseVoiceAttendance("roll 5 present, roll 6 absent", mockRoster);
    const entry5 = res.entries.find((e) => e.rollNumber === "2026-CS-05");
    const entry6 = res.entries.find((e) => e.rollNumber === "2026-CS-06");

    expect(entry5?.status).toBe("PRESENT");
    expect(entry6?.status).toBe("ABSENT");
  });

  it("parses on duty and medical leave entries", () => {
    const res = parseVoiceAttendance("roll 7 on duty, roll 8 medical leave", mockRoster);
    const entry7 = res.entries.find((e) => e.rollNumber === "2026-CS-07");
    const entry8 = res.entries.find((e) => e.rollNumber === "2026-CS-08");

    expect(entry7?.status).toBe("ON_DUTY");
    expect(entry8?.status).toBe("MEDICAL_LEAVE");
  });

  it("parses ranges like 'roll 1 to 5 present'", () => {
    const res = parseVoiceAttendance("roll 1 to 5 present", mockRoster);
    expect(res.entries.length).toBe(5);
    for (let i = 1; i <= 5; i++) {
      const padded = String(i).padStart(2, "0");
      const entry = res.entries.find((e) => e.rollNumber === `2026-CS-${padded}`);
      expect(entry?.status).toBe("PRESENT");
    }
  });

  it("parses 'all present except 5 and 9'", () => {
    const res = parseVoiceAttendance("all present except 5 and 9", mockRoster);
    expect(res.entries.length).toBe(40);
    const entry5 = res.entries.find((e) => e.rollNumber === "2026-CS-05");
    const entry9 = res.entries.find((e) => e.rollNumber === "2026-CS-09");
    const entry1 = res.entries.find((e) => e.rollNumber === "2026-CS-01");

    expect(entry5?.status).toBe("ABSENT");
    expect(entry9?.status).toBe("ABSENT");
    expect(entry1?.status).toBe("PRESENT");
  });

  it("parses range with exception: 'roll 1 to 5 present except 3'", () => {
    const res = parseVoiceAttendance("roll 1 to 5 present except 3", mockRoster);
    const entry3 = res.entries.find((e) => e.rollNumber === "2026-CS-03");
    const entry4 = res.entries.find((e) => e.rollNumber === "2026-CS-04");

    expect(entry3?.status).toBe("ABSENT");
    expect(entry4?.status).toBe("PRESENT");
  });

  it("flags duplicate mentions with issue DUPLICATE and keeps last mention", () => {
    const res = parseVoiceAttendance("roll 5 present, roll 5 absent", mockRoster);
    const entry5 = res.entries.find((e) => e.rollNumber === "2026-CS-05");

    expect(entry5?.status).toBe("ABSENT");
    expect(entry5?.issues).toContain("DUPLICATE");
    expect(res.summary.duplicates).toBe(1);
  });

  it("flags unknown roll numbers with UNRESOLVED_ROLL", () => {
    const res = parseVoiceAttendance("roll 99 absent", mockRoster);
    expect(res.unresolvedTokens).toContain("99");
    expect(res.entries[0]?.issues).toContain("UNRESOLVED_ROLL");
  });

  it("multiplies speech confidence by parser certainty", () => {
    const res = parseVoiceAttendance("roll 1 present", mockRoster, 0.8);
    expect(res.entries[0]?.confidence).toBe(0.8);
  });

  it("correctly computes attendance summary counts", () => {
    const res = parseVoiceAttendance(
      "roll 1 to 3 present, roll 4 absent, roll 5 on duty, roll 6 medical leave",
      mockRoster,
    );
    expect(res.summary.total).toBe(6);
    expect(res.summary.present).toBe(3);
    expect(res.summary.absent).toBe(1);
    expect(res.summary.onDuty).toBe(1);
    expect(res.summary.medicalLeave).toBe(1);
  });
});

describe("packages/core - Voice Parser: parseVoiceMarks", () => {
  it("parses 'Roll 7, 18 marks'", () => {
    const res = parseVoiceMarks("roll 7, 18 marks", mockRoster, 20);
    const entry7 = res.entries.find((e) => e.rollNumber === "2026-CS-07");
    expect(entry7?.score).toBe(18);
    expect(entry7?.issues).toEqual([]);
  });

  it("parses 'Roll 12, 15 out of 20'", () => {
    const res = parseVoiceMarks("roll 12, 15 out of 20", mockRoster, 20);
    const entry12 = res.entries.find((e) => e.rollNumber === "2026-CS-12");
    expect(entry12?.score).toBe(15);
  });

  it("parses 'Quiz 1 roll 9 score 14'", () => {
    const res = parseVoiceMarks("quiz 1 roll 9 score 14", mockRoster, 20);
    const entry9 = res.entries.find((e) => e.rollNumber === "2026-CS-09");
    expect(entry9?.score).toBe(14);
  });

  it("flags score greater than maxScore as OUT_OF_RANGE", () => {
    const res = parseVoiceMarks("roll 5 score 25", mockRoster, 20);
    const entry5 = res.entries.find((e) => e.rollNumber === "2026-CS-05");
    expect(entry5?.score).toBe(25);
    expect(entry5?.issues).toContain("OUT_OF_RANGE");
    expect(res.summary.outOfRange).toBe(1);
  });

  it("flags duplicate rolls in marks transcript", () => {
    const res = parseVoiceMarks("roll 5 score 15, roll 5 score 18", mockRoster, 20);
    const entry5 = res.entries.find((e) => e.rollNumber === "2026-CS-05");
    expect(entry5?.score).toBe(18);
    expect(entry5?.issues).toContain("DUPLICATE");
    expect(res.summary.duplicates).toBe(1);
  });

  it("flags unknown roll numbers in marks transcript", () => {
    const res = parseVoiceMarks("roll 88 score 15", mockRoster, 20);
    expect(res.unresolvedTokens).toContain("88");
    expect(res.entries[0]?.issues).toContain("UNRESOLVED_ROLL");
  });

  it("computes summary of valid, out-of-range, and duplicate marks", () => {
    const res = parseVoiceMarks(
      "roll 1 score 10, roll 2 score 25, roll 3 score 15",
      mockRoster,
      20,
    );
    expect(res.summary.total).toBe(3);
    expect(res.summary.valid).toBe(2);
    expect(res.summary.outOfRange).toBe(1);
  });
});
