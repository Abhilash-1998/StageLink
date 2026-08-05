import { API_BASE } from "@/src/config/backend";

/**
 * Turn relative `/api/media/...` (and other absolute-path) URLs into full
 * backend URLs. Data URIs and http(s) links pass through unchanged.
 */
export function resolveMediaUrl(uri?: string | null): string | null {
  if (!uri || typeof uri !== "string") return null;
  const u = uri.trim();
  if (!u) return null;

  if (
    u.startsWith("data:") ||
    u.startsWith("http://") ||
    u.startsWith("https://") ||
    u.startsWith("file://") ||
    u.startsWith("content://") ||
    u.startsWith("ph://")
  ) {
    return u;
  }

  // Relative API path, e.g. /api/media/<id>
  if (u.startsWith("/")) {
    return `${API_BASE}${u}`;
  }

  return u;
}
