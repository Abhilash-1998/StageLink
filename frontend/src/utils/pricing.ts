/** Shared pricing helpers — amount + unit (not always hourly). */

export const PRICING_TYPES = [
  "per_event",
  "per_session",
  "per_hour",
  "per_song",
  "per_day",
  "starting_at",
] as const;

export type PricingType = (typeof PRICING_TYPES)[number];

export const PRICING_TYPE_LABELS: Record<string, string> = {
  per_event: "Per event",
  per_session: "Per session",
  per_hour: "Per hour",
  per_song: "Per song",
  per_day: "Per day",
  starting_at: "Starting at",
};

export function pricingUnitLabel(type?: string | null): string {
  if (!type) return "Per hour";
  return PRICING_TYPE_LABELS[type] || type.replace(/_/g, " ");
}

/** Short suffix for cards, e.g. "/ event" */
export function pricingSuffix(type?: string | null): string {
  switch (type) {
    case "per_event": return "/ event";
    case "per_session": return "/ session";
    case "per_song": return "/ song";
    case "per_day": return "/ day";
    case "starting_at": return "starting at";
    case "per_hour":
    default: return "/ hour";
  }
}

export function formatINR(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

/** e.g. "₹5,000 / event" or "₹5,000 starting at" */
export function formatBaseRate(amount: number, type?: string | null): string {
  if (!amount || amount <= 0) return "";
  const money = formatINR(amount);
  if (type === "starting_at") return `${money} starting at`;
  return `${money} ${pricingSuffix(type)}`;
}
