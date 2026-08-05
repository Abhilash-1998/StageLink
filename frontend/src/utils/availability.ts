/** Musician availability helpers — weekly mon..sun + optional vacation range. */

export type Availability = {
  weekly?: Record<string, string[] | null> | null;
  vacation?: { start?: string | null; end?: string | null } | null;
  unavailable_dates?: string[] | null;
};

export type TodayStatus = "available" | "unavailable" | "unknown";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function localYMD(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hasWeeklySlots(weekly?: Availability["weekly"]): boolean {
  if (!weekly || typeof weekly !== "object") return false;
  return Object.values(weekly).some((slots) => Array.isArray(slots) && slots.length > 0);
}

/** Whether a musician is bookable today based on weekly + vacation. */
export function availabilityToday(availability?: Availability | null): TodayStatus {
  if (!availability) return "unknown";
  const weekly = availability.weekly;
  const hasSchedule = hasWeeklySlots(weekly);

  const today = localYMD();
  const vac = availability.vacation;
  if (vac?.start && vac?.end && today >= vac.start && today <= vac.end) {
    return "unavailable";
  }

  const blocked = availability.unavailable_dates || [];
  if (blocked.includes(today)) return "unavailable";

  if (!hasSchedule) return "unknown";

  const key = DAY_KEYS[new Date().getDay()];
  const slots = weekly?.[key];
  if (Array.isArray(slots) && slots.length > 0) return "available";
  return "unavailable";
}

export function availabilityTodayLabel(status: TodayStatus): string | null {
  if (status === "available") return "Available today";
  if (status === "unavailable") return "Unavailable today";
  return null;
}
