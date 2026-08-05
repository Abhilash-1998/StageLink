import { Platform } from "react-native";
import {
  ensureNotificationPermissionAsync,
  registerForPushNotificationsDetailed,
  setCachedPushToken,
  isRemotePushAvailable,
  getCachedPushToken,
  getLastPushRegistrationError,
} from "@/src/notifications/push";

type FetchApi = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export type PushSyncResult = {
  ok: boolean;
  token: string | null;
  error: string | null;
  permissionGranted: boolean;
  registeredOnServer: boolean;
};

async function pause(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Request permission, mint Expo token, and register with gigZee backend (with retries). */
export async function syncPushRegistrationWithBackend(
  fetchApi: FetchApi,
  options?: { force?: boolean },
): Promise<PushSyncResult> {
  if (!isRemotePushAvailable()) {
    const error =
      "Expo Go cannot receive push on SDK 53+. Install a development build: npx expo run:android";
    return { ok: false, token: null, error, permissionGranted: false, registeredOnServer: false };
  }

  const perm = await ensureNotificationPermissionAsync();
  if (!perm.granted) {
    const error = "Notification permission not granted.";
    return { ok: false, token: null, error, permissionGranted: false, registeredOnServer: false };
  }

  const cached = getCachedPushToken();
  if (!options?.force && cached) {
    try {
      await fetchApi("/devices/register", {
        method: "POST",
        body: JSON.stringify({
          token: cached,
          expo_push_token: cached,
          platform: Platform.OS,
          device_name: Platform.OS,
        }),
      });
      return {
        ok: true,
        token: cached,
        error: null,
        permissionGranted: true,
        registeredOnServer: true,
      };
    } catch {
      // Cached token may be stale — fall through to fresh registration.
    }
  }

  let token: string | null = null;
  let error: string | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await registerForPushNotificationsDetailed();
    token = result.token;
    error = result.error;
    if (token) break;
    await pause(400 * (attempt + 1));
  }

  if (!token) {
    return {
      ok: false,
      token: null,
      error: error || getLastPushRegistrationError() || "Could not get Expo push token.",
      permissionGranted: true,
      registeredOnServer: false,
    };
  }

  setCachedPushToken(token);

  try {
    await fetchApi("/devices/register", {
      method: "POST",
      body: JSON.stringify({
        token,
        expo_push_token: token,
        platform: Platform.OS,
        device_name: Platform.OS,
      }),
    });
    return { ok: true, token, error: null, permissionGranted: true, registeredOnServer: true };
  } catch (e: any) {
    const msg = e?.message || "Failed to register device with server.";
    return { ok: false, token, error: msg, permissionGranted: true, registeredOnServer: false };
  }
}
