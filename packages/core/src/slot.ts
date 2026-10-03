export interface TimetableSlotInput {
  dayOfWeek: number; // 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri
  startTime: string; // "HH:MM" (24h)
  endTime: string;   // "HH:MM" (24h)
}

export interface ExistingInterventionInput {
  scheduledAt: Date | string;
  durationMin?: number;
}

export interface FindSlotOptions {
  startDate?: Date | string;
  timetableSlots?: TimetableSlotInput[];
  existingInterventions?: ExistingInterventionInput[];
  officeStartHour?: number; // default 15 (3 PM)
  officeEndHour?: number;   // default 17 (5 PM)
  slotDurationMin?: number; // default 15 minutes
  maxWorkingDays?: number;  // default 5 working days
}

export interface SlotResult {
  slotStart: Date;
  slotEnd: Date;
  durationMin: number;
}

export interface FindSlotResponse {
  slot: SlotResult | null;
  reason?: string;
}

/**
 * Converts "HH:MM" string to minutes from start of day.
 */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Pure function to find the first free 15-minute slot in the next 5 working days
 * inside office hours (Mon-Fri 15:00-17:00), skipping weekends, the student's
 * TimetableSlots, and the mentor's existing interventions.
 */
export function findInterventionSlot(options: FindSlotOptions = {}): FindSlotResponse {
  const officeStartHour = options.officeStartHour ?? 15;
  const officeEndHour = options.officeEndHour ?? 17;
  const slotDurationMin = options.slotDurationMin ?? 15;
  const maxWorkingDays = options.maxWorkingDays ?? 5;
  const timetableSlots = options.timetableSlots ?? [];
  const existingInterventions = options.existingInterventions ?? [];

  const start = options.startDate ? new Date(options.startDate) : new Date();

  // Parse existing interventions into absolute millisecond ranges
  const existingRanges = existingInterventions.map((item) => {
    const s = new Date(item.scheduledAt).getTime();
    const duration = (item.durationMin ?? 15) * 60 * 1000;
    return { start: s, end: s + duration };
  });

  let workingDaysChecked = 0;
  // Start from next calendar day at midnight
  const currentDay = new Date(start);
  currentDay.setDate(currentDay.getDate() + 1);
  currentDay.setHours(0, 0, 0, 0);

  // Scan up to 14 calendar days to guarantee finding working days
  for (let d = 0; d < 14 && workingDaysChecked < maxWorkingDays; d++) {
    const dayOfWeek = currentDay.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      currentDay.setDate(currentDay.getDate() + 1);
      continue;
    }

    workingDaysChecked++;

    // Generate slots within office hours for this working day
    const startMin = officeStartHour * 60;
    const endMin = officeEndHour * 60;

    for (let m = startMin; m + slotDurationMin <= endMin; m += slotDurationMin) {
      const slotStart = new Date(currentDay);
      slotStart.setHours(Math.floor(m / 60), m % 60, 0, 0);

      const slotEnd = new Date(slotStart.getTime() + slotDurationMin * 60 * 1000);
      const slotStartMs = slotStart.getTime();
      const slotEndMs = slotEnd.getTime();

      // 1. Check against mentor's existing interventions
      const clashesWithIntervention = existingRanges.some(
        (range) => slotStartMs < range.end && slotEndMs > range.start,
      );
      if (clashesWithIntervention) continue;

      // 2. Check against student's TimetableSlots
      const slotMinutesStart = m;
      const slotMinutesEnd = m + slotDurationMin;

      const clashesWithTimetable = timetableSlots.some((tt) => {
        // tt.dayOfWeek: 1 = Mon, ..., 5 = Fri
        if (tt.dayOfWeek !== dayOfWeek) return false;
        const ttStart = timeToMinutes(tt.startTime);
        const ttEnd = timeToMinutes(tt.endTime);
        return slotMinutesStart < ttEnd && slotMinutesEnd > ttStart;
      });
      if (clashesWithTimetable) continue;

      // If no clashes, we found the first available slot!
      return {
        slot: {
          slotStart,
          slotEnd,
          durationMin: slotDurationMin,
        },
      };
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return {
    slot: null,
    reason: `No available ${slotDurationMin}-minute slots found within office hours (${officeStartHour}:00-${officeEndHour}:00) across the next ${maxWorkingDays} working days due to timetable and intervention conflicts.`,
  };
}
