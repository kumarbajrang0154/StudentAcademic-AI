/**
 * Pure voice parser for attendance and marks entry in Student Academic AI.
 * Handles English and Indian-English speech patterns, number words, ranges, exceptions, and scores.
 */

export interface RosterStudent {
  id: string;
  rollNumber: string;
  name?: string;
}

export type AttendanceEntryStatus =
  | "PRESENT"
  | "ABSENT"
  | "ON_DUTY"
  | "MEDICAL_LEAVE";

export interface ParsedAttendanceEntry {
  rollNumber: string;
  studentId?: string;
  status: AttendanceEntryStatus;
  confidence: number;
  issues: string[];
}

export interface VoiceAttendanceResult {
  entries: ParsedAttendanceEntry[];
  unresolvedTokens: string[];
  summary: {
    total: number;
    present: number;
    absent: number;
    onDuty: number;
    medicalLeave: number;
    duplicates: number;
    unresolved: number;
  };
}

export interface ParsedMarksEntry {
  rollNumber: string;
  studentId?: string;
  score: number;
  confidence: number;
  issues: string[];
}

export interface VoiceMarksResult {
  entries: ParsedMarksEntry[];
  unresolvedTokens: string[];
  summary: {
    total: number;
    valid: number;
    outOfRange: number;
    duplicates: number;
    unresolved: number;
  };
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40, // common Indian-English spelling variation
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

/**
 * Extracts and parses a sequence of words into an integer number.
 * Supports:
 * - Direct digits ("101", "42", "7")
 * - Word forms ("forty two" -> 42, "one hundred five" -> 105)
 * - Digit-by-digit spoken words ("one oh one" -> 101, "four two" -> 42, "double zero seven" -> 7)
 */
export function parseNumberWords(text: string): number | null {
  const clean = text.trim().toLowerCase();
  if (!clean) return null;

  // Direct digits
  if (/^\d+$/.test(clean)) {
    return parseInt(clean, 10);
  }

  const tokens = clean
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Check if all tokens are known number words or digits
  let allRecognized = true;
  for (const t of tokens) {
    if (
      !(
        /^\d+$/.test(t) ||
        NUMBER_WORDS[t] !== undefined ||
        t === "and" ||
        t === "double" ||
        t === "triple"
      )
    ) {
      allRecognized = false;
      break;
    }
  }
  if (!allRecognized) return null;

  // Handle Indian-English multipliers like "double zero", "double two"
  const expanded: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "double" && i + 1 < tokens.length) {
      expanded.push(tokens[i + 1]!, tokens[i + 1]!);
      i++;
    } else if (t === "triple" && i + 1 < tokens.length) {
      expanded.push(tokens[i + 1]!, tokens[i + 1]!, tokens[i + 1]!);
      i++;
    } else if (t !== "and") {
      expanded.push(t);
    }
  }

  // Attempt digit-by-digit concatenation if multiple single-digit words ("one oh one", "four two")
  // Only if at least one word is in NUMBER_WORDS (e.g. not pure separate digits)
  const hasWordDigit = expanded.some((t) => NUMBER_WORDS[t] !== undefined && NUMBER_WORDS[t]! <= 9);
  if (hasWordDigit && expanded.length > 1) {
    let canBeDigitByDigit = true;
    let digitString = "";
    for (const t of expanded) {
      if (/^\d$/.test(t)) {
        digitString += t;
      } else if (NUMBER_WORDS[t] !== undefined && NUMBER_WORDS[t]! <= 9) {
        digitString += String(NUMBER_WORDS[t]);
      } else {
        canBeDigitByDigit = false;
        break;
      }
    }
    if (canBeDigitByDigit && digitString.length > 0) {
      return parseInt(digitString, 10);
    }
  }

  // Standard additive/multiplicative number parser (e.g. "forty two", "one hundred five")
  let total = 0;
  let current = 0;

  for (const t of expanded) {
    let val: number | undefined;
    if (/^\d+$/.test(t)) {
      val = parseInt(t, 10);
    } else {
      val = NUMBER_WORDS[t];
    }
    if (val === undefined) continue;

    if (val === 100) {
      current = (current === 0 ? 1 : current) * 100;
    } else if (val >= 20) {
      total += current;
      current = val;
    } else {
      current += val;
    }
  }

  total += current;
  const isZero =
    expanded.includes("zero") || expanded.includes("0") || expanded.includes("oh");
  return total > 0 || isZero ? total : null;
}

/**
 * Resolves a spoken numeric string or number to a roster student.
 * Rule: spoken numbers match the numeric suffix of the roster roll number.
 * e.g. "7" matches "2026-CS-07", "101" matches "2026-CS-101", etc.
 */
export function resolveRollToStudent(
  num: number | string,
  roster: RosterStudent[],
): RosterStudent | null {
  const targetNum =
    typeof num === "number" ? num : parseInt(String(num).replace(/\D/g, ""), 10);
  if (isNaN(targetNum)) return null;

  for (const student of roster) {
    // Extract trailing digits from roll number
    const match = student.rollNumber.match(/(\d+)$/);
    if (match && match[1]) {
      const studentNum = parseInt(match[1], 10);
      if (studentNum === targetNum) {
        return student;
      }
    }
  }
  return null;
}

/**
 * Normalizes input text by handling "to" vs "two" ambiguity based on surrounding context.
 * "101 to 105" -> range
 * "roll to" -> "roll two"
 * "except to" -> "except two"
 */
export function disambiguateToAndTwo(text: string): string {
  let result = text;
  // Replace "to" with "two" when preceded by keywords like roll, number, except, and followed by a boundary
  result = result.replace(/\b(roll|number|no|except|and|also)\s+to\b/gi, "$1 two");
  // Replace "two" with "to" when sandwiched between two numbers: "101 two 105" -> "101 to 105"
  result = result.replace(/(\b\d+\b)\s+two\s+(\b\d+\b)/gi, "$1 to $2");
  return result;
}

/**
 * Extracts individual numbers or expanded ranges from a text snippet.
 */
function extractNumbersAndRanges(text: string): string[] {
  const items: string[] = [];
  // Match ranges like "101 to 105" or "1 to 5"
  const rangeRegex =
    /(\b\d+|\b[a-z]+(?:\s+[a-z]+)?)\s+(?:to|through|-)\s+(\b\d+|\b[a-z]+(?:\s+[a-z]+)?)/gi;
  let remaining = text;
  let match;

  while ((match = rangeRegex.exec(text)) !== null) {
    const start = parseNumberWords(match[1]!);
    const end = parseNumberWords(match[2]!);
    if (start !== null && end !== null && start <= end && end - start <= 100) {
      for (let i = start; i <= end; i++) {
        items.push(String(i));
      }
      remaining = remaining.replace(match[0], " ");
    }
  }

  // Tokenize remaining text
  const words = remaining
    .replace(/[,;.]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w &&
        ![
          "roll",
          "number",
          "no",
          "and",
          "student",
          "students",
          "all",
          "present",
          "absent",
          "except",
          "on",
          "duty",
          "medical",
          "leave",
          "od",
          "ml",
        ].includes(w),
    );

  for (let i = 0; i < words.length; i++) {
    // Try two-word number like "forty two" ONLY if words[i] is not pure digits
    if (!/^\d+$/.test(words[i]!) && i + 1 < words.length && !/^\d+$/.test(words[i + 1]!)) {
      const twoWords = `${words[i]} ${words[i + 1]}`;
      const num2 = parseNumberWords(twoWords);
      if (num2 !== null) {
        items.push(String(num2));
        i++;
        continue;
      }
    }
    const single = parseNumberWords(words[i]!);
    if (single !== null) {
      items.push(String(single));
    }
  }

  return items;
}

/**
 * Parses attendance from a speech transcript tape.
 */
export function parseVoiceAttendance(
  rawTranscript: string,
  roster: RosterStudent[],
  speechConfidence: number = 1.0,
): VoiceAttendanceResult {
  const disambiguated = disambiguateToAndTwo(rawTranscript);
  const normalized = disambiguated.toLowerCase();

  const entriesMap = new Map<string, ParsedAttendanceEntry>();
  const duplicateRolls = new Set<string>();
  const unresolvedTokens: string[] = [];

  // Helper to record an entry with duplicate tracking
  const recordEntry = (
    rollStr: string,
    status: AttendanceEntryStatus,
    certainty: number = 1.0,
  ) => {
    const student = resolveRollToStudent(rollStr, roster);
    const resolvedRoll = student ? student.rollNumber : rollStr;
    const isDup = entriesMap.has(resolvedRoll);

    if (isDup) {
      duplicateRolls.add(resolvedRoll);
    }

    const issues: string[] = [];
    if (!student) {
      issues.push("UNRESOLVED_ROLL");
      if (!unresolvedTokens.includes(rollStr)) {
        unresolvedTokens.push(rollStr);
      }
    }
    if (isDup) {
      issues.push("DUPLICATE");
    }

    entriesMap.set(resolvedRoll, {
      rollNumber: resolvedRoll,
      studentId: student?.id,
      status,
      confidence: Math.round(speechConfidence * certainty * 100) / 100,
      issues,
    });
  };

  // Case A: "all present" baseline
  if (/\ball\s+present\b/i.test(normalized)) {
    for (const student of roster) {
      entriesMap.set(student.rollNumber, {
        rollNumber: student.rollNumber,
        studentId: student.id,
        status: "PRESENT",
        confidence: speechConfidence,
        issues: [],
      });
    }

    // Now look for exceptions after "except":
    const exceptIdx = normalized.indexOf("except");
    if (exceptIdx !== -1) {
      const exceptText = normalized.slice(exceptIdx + 6);
      const exceptNumbers = extractNumbersAndRanges(exceptText);
      for (const num of exceptNumbers) {
        recordEntry(num, "ABSENT", 1.0);
      }
    }
  } else {
    // Case B: explicit roll clauses
    let mainText = normalized;
    let exceptText = "";

    const exceptMatch = normalized.match(/(.*?)\s*\bexcept\s+(.*)/i);
    if (exceptMatch && exceptMatch[1] && exceptMatch[2]) {
      mainText = exceptMatch[1];
      exceptText = exceptMatch[2];
    }

    // Split main text into clauses by commas, periods, or conjunctions
    const clauses = mainText
      .split(/[,.;]|\band\s+(?:roll|no|number|\d)/i)
      .map((c) => c.trim())
      .filter(Boolean);

    for (const clause of clauses) {
      let status: AttendanceEntryStatus | null = null;
      if (
        clause.includes("medical") ||
        clause.includes("leave") ||
        clause.includes("ml")
      ) {
        status = "MEDICAL_LEAVE";
      } else if (clause.includes("duty") || clause.includes("od")) {
        status = "ON_DUTY";
      } else if (clause.includes("absent")) {
        status = "ABSENT";
      } else if (clause.includes("present")) {
        status = "PRESENT";
      }

      if (!status) continue;

      const numbers = extractNumbersAndRanges(clause);
      for (const num of numbers) {
        recordEntry(num, status, 1.0);
      }
    }

    // Process except numbers as ABSENT
    if (exceptText) {
      const exceptNumbers = extractNumbersAndRanges(exceptText);
      for (const num of exceptNumbers) {
        recordEntry(num, "ABSENT", 1.0);
      }
    }
  }

  const entries = Array.from(entriesMap.values());
  let present = 0;
  let absent = 0;
  let onDuty = 0;
  let medicalLeave = 0;

  for (const e of entries) {
    if (e.status === "PRESENT") present++;
    else if (e.status === "ABSENT") absent++;
    else if (e.status === "ON_DUTY") onDuty++;
    else if (e.status === "MEDICAL_LEAVE") medicalLeave++;
  }

  return {
    entries,
    unresolvedTokens,
    summary: {
      total: entries.length,
      present,
      absent,
      onDuty,
      medicalLeave,
      duplicates: duplicateRolls.size,
      unresolved: unresolvedTokens.length,
    },
  };
}

/**
 * Parses marks entries from a speech transcript tape.
 * Supported patterns:
 * - "Roll 7, 18 marks"
 * - "Roll 12, 15 out of 20"
 * - "Quiz 1 roll 9 score 14"
 * - "Roll number 101 score 95"
 */
export function parseVoiceMarks(
  rawTranscript: string,
  roster: RosterStudent[],
  maxScore: number = 100,
  speechConfidence: number = 1.0,
): VoiceMarksResult {
  const disambiguated = disambiguateToAndTwo(rawTranscript);
  const normalized = disambiguated.toLowerCase();

  const entriesMap = new Map<string, ParsedMarksEntry>();
  const duplicateRolls = new Set<string>();
  const unresolvedTokens: string[] = [];

  // Robust global regex that matches each roll and score pair:
  // e.g. "roll 7, 18 marks", "roll 12, 15 out of 20", "quiz 1 roll 9 score 14", "roll 5 score 25"
  const marksRegex =
    /\b(?:roll\s*(?:no|number)?|student)\s*([a-z0-9]+(?:\s+(?:one|two|three|four|five|six|seven|eight|nine))?)\s*(?:(?:score|marks|scored|got|is|has|out\s+of|\/|[,:-])\s*)*\s*([a-z0-9]+(?:\s+(?:one|two|three|four|five|six|seven|eight|nine))?)/gi;

  let match;
  while ((match = marksRegex.exec(normalized)) !== null) {
    const rollStr = match[1]!.trim();
    const scoreStr = match[2]!.trim();

    const rollNum = parseNumberWords(rollStr);
    const scoreVal = parseNumberWords(scoreStr);

    if (rollNum === null || scoreVal === null) continue;

    const student = resolveRollToStudent(rollNum, roster);
    const resolvedRoll = student ? student.rollNumber : String(rollNum);
    const isDup = entriesMap.has(resolvedRoll);

    if (isDup) {
      duplicateRolls.add(resolvedRoll);
    }

    const issues: string[] = [];
    if (!student) {
      issues.push("UNRESOLVED_ROLL");
      if (!unresolvedTokens.includes(String(rollNum))) {
        unresolvedTokens.push(String(rollNum));
      }
    }
    if (isDup) {
      issues.push("DUPLICATE");
    }
    if (scoreVal < 0 || scoreVal > maxScore) {
      issues.push("OUT_OF_RANGE");
    }

    entriesMap.set(resolvedRoll, {
      rollNumber: resolvedRoll,
      studentId: student?.id,
      score: scoreVal,
      confidence: Math.round(speechConfidence * 1.0 * 100) / 100,
      issues,
    });
  }

  const entries = Array.from(entriesMap.values());
  const valid = entries.filter((e) => !e.issues.includes("OUT_OF_RANGE")).length;
  const outOfRange = entries.filter((e) => e.issues.includes("OUT_OF_RANGE")).length;

  return {
    entries,
    unresolvedTokens,
    summary: {
      total: entries.length,
      valid,
      outOfRange,
      duplicates: duplicateRolls.size,
      unresolved: unresolvedTokens.length,
    },
  };
}
