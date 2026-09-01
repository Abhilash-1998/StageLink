/**
 * Backend API URL — controlled by frontend/.env only.
 *
 * In `.env`, uncomment ONE of:
 *   - Production: https://stagelink-api-production-f0c5.up.railway.app
 *   - Staging:    https://stagelink-api-staging-staging.up.railway.app
 *
 * Restart Metro after changing `.env`.
 */
function normalize(url: string | undefined | null): string {
  return String(url || "").trim().replace(/\/+$/, "");
}

export function getBackendBaseUrl(): string {
  const url = normalize(process.env.EXPO_PUBLIC_BACKEND_URL);
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_BACKEND_URL is not set. Edit frontend/.env and restart Metro.",
    );
  }
  return url;
}

export const API_BASE = getBackendBaseUrl();
export const API_URL = `${API_BASE}/api`;
