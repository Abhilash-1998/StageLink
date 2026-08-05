// Single source of truth for date formatting across gigZee.
// Rule: display dates as DD/MM/YYYY everywhere.

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Format any ISO string, Date, or YYYY-MM-DD date into DD/MM/YYYY.
 * Returns empty string on invalid input.
 */
export function formatDate(input?: string | Date | null): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Human relative time for feed timestamps ("2h", "3d") with fallback to
 * DD/MM/YYYY once older than a week.
 */
export function formatRelative(input?: string | Date | null): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return formatDate(d);
}

/** Convert DD/MM/YYYY user input back to ISO YYYY-MM-DD for backend. */
export function parseDDMMYYYY(input: string): string | null {
  const m = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  return isNaN(new Date(iso).getTime()) ? null : iso;
}
