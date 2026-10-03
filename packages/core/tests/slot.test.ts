import { describe, it, expect } from "vitest";
import { findInterventionSlot, INTERVENTION_DURATION_MIN } from "../src/slot.js";

describe("findInterventionSlot", () => {
  it("finds the first available 15-minute slot inside office hours (15:00-17:00) on the next working day", () => {
    expect(INTERVENTION_DURATION_MIN).toBe(15);
    // Start on Monday 2026-10-05
    const startDate = new Date("2026-10-05T10:00:00Z");
    const result = findInterventionSlot({ startDate });

    expect(result.slot).not.toBeNull();
    // Next day is Tuesday 2026-10-06 at 15:00 local time
    const slot = result.slot!;
    expect(slot.durationMin).toBe(INTERVENTION_DURATION_MIN);
    expect(slot.slotStart.getHours()).toBe(15);
    expect(slot.slotStart.getMinutes()).toBe(0);
    expect(slot.slotEnd.getHours()).toBe(15);
    expect(slot.slotEnd.getMinutes()).toBe(15);
  });

  it("skips weekends when looking for the next working day", () => {
    // Friday 2026-10-09
    const startDate = new Date("2026-10-09T18:00:00Z");
    const result = findInterventionSlot({ startDate });

    expect(result.slot).not.toBeNull();
    // Next day must be Monday (day of week 1), NOT Saturday or Sunday
    const dayOfWeek = result.slot!.slotStart.getDay();
    expect(dayOfWeek).toBe(1); // Monday
  });

  it("avoids clashes with student timetable slots", () => {
    // Start on Sunday 2026-10-04 -> next day is Monday (dayOfWeek 1)
    const startDate = new Date("2026-10-04T12:00:00Z");
    const timetableSlots = [
      { dayOfWeek: 1, startTime: "15:00", endTime: "15:30" }, // busy until 15:30
    ];

    const result = findInterventionSlot({ startDate, timetableSlots });
    expect(result.slot).not.toBeNull();
    // First free slot should be 15:30
    expect(result.slot!.slotStart.getHours()).toBe(15);
    expect(result.slot!.slotStart.getMinutes()).toBe(30);
  });

  it("avoids clashes with mentor existing interventions", () => {
    // Next day is Tuesday 2026-10-06
    const startDate = new Date("2026-10-05T10:00:00Z");
    // Calculate expected Tuesday 15:00
    const nextDay = new Date(startDate);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(15, 0, 0, 0);

    const existingInterventions = [
      { scheduledAt: nextDay, durationMin: 30 }, // busy 15:00 to 15:30
    ];

    const result = findInterventionSlot({ startDate, existingInterventions });
    expect(result.slot).not.toBeNull();
    // First free slot should be 15:30
    expect(result.slot!.slotStart.getHours()).toBe(15);
    expect(result.slot!.slotStart.getMinutes()).toBe(30);
  });

  it("advances to subsequent working day if an entire day is blocked", () => {
    const startDate = new Date("2026-10-05T10:00:00Z"); // Monday
    // Tuesday (day 2) timetable covers full office hours
    const timetableSlots = [
      { dayOfWeek: 2, startTime: "15:00", endTime: "17:00" },
    ];

    const result = findInterventionSlot({ startDate, timetableSlots });
    expect(result.slot).not.toBeNull();
    // Should advance to Wednesday (day 3) at 15:00
    expect(result.slot!.slotStart.getDay()).toBe(3);
    expect(result.slot!.slotStart.getHours()).toBe(15);
    expect(result.slot!.slotStart.getMinutes()).toBe(0);
  });

  it("returns null with an informative reason when all slots across 5 working days are occupied", () => {
    const startDate = new Date("2026-10-05T10:00:00Z");
    // Block Monday-Friday 15:00-17:00
    const timetableSlots = [
      { dayOfWeek: 1, startTime: "15:00", endTime: "17:00" },
      { dayOfWeek: 2, startTime: "15:00", endTime: "17:00" },
      { dayOfWeek: 3, startTime: "15:00", endTime: "17:00" },
      { dayOfWeek: 4, startTime: "15:00", endTime: "17:00" },
      { dayOfWeek: 5, startTime: "15:00", endTime: "17:00" },
    ];

    const result = findInterventionSlot({ startDate, timetableSlots, maxWorkingDays: 5 });
    expect(result.slot).toBeNull();
    expect(result.reason).toContain("No available 15-minute slots found");
  });
});
