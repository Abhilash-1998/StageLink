import Constants from "expo-constants";

// Fallback keeps shared APKs working even when EXPO_PUBLIC_BACKEND_URL
// is not configured in EAS environment variables.
const DEFAULT_BACKEND_URL = "https://stagelink-api-production-f0c5.up.railway.app";

function normalize(url: string | undefined | null): string {
  return String(url || "").trim().replace(/\/+$/, "");
}

export function getBackendBaseUrl(): string {
  const envUrl = normalize(process.env.EXPO_PUBLIC_BACKEND_URL);
  if (envUrl) return envUrl;

  const extraUrl = normalize(
    (Constants.expoConfig?.extra as { backendUrl?: string } | undefined)?.backendUrl,
  );
  if (extraUrl) return extraUrl;

  return DEFAULT_BACKEND_URL;
}

export const API_BASE = getBackendBaseUrl();
export const API_URL = `${API_BASE}/api`;
