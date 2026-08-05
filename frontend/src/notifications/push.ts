import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import {
  setCachedPushToken,
  setLastPushRegistrationError,
} from "@/src/notifications/pushTokenCache";

export {
  getCachedPushToken,
  setCachedPushToken,
  getLastPushRegistrationError,
} from "@/src/notifications/pushTokenCache";

type NotificationsModule = typeof import("expo-notifications");

let notificationsPromise: Promise<NotificationsModule | null> | null = null;
let handlerConfigured = false;

/**
 * Remote push (and importing expo-notifications) is unsupported in Expo Go on SDK 53+.
 * Importing the package logs a red ERROR on Android because of an auto-registration side effect.
 */
export function isRemotePushAvailable(): boolean {
  return Platform.OS !== "web" && !isRunningInExpoGo();
}

/** Lazy-load expo-notifications only in development / production builds — never in Expo Go. */
export async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (!isRemotePushAvailable()) return null;
  if (!notificationsPromise) {
    notificationsPromise = import("expo-notifications")
      .then((Notifications) => {
        if (!handlerConfigured) {
          handlerConfigured = true;
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowAlert: true,
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
            }),
          });
        }
        return Notifications;
      })
      .catch((e) => {
        console.warn("[gigZee] Failed to load expo-notifications", e);
        return null;
      });
  }
  return notificationsPromise;
}

export function getEasProjectId(): string | undefined {
  const raw =
    Constants.easConfig?.projectId ||
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ||
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    undefined;
  if (!raw || raw === "REPLACE_WITH_EAS_PROJECT_ID") return undefined;
  return raw;
}

export type NotificationPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
};

async function ensureAndroidChannel(Notifications: NotificationsModule) {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "gigZee",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#F97316",
    sound: "default",
    enableVibrate: true,
    showBadge: true,
  });
}

/**
 * Check / request notification permission only.
 * No-op (denied) in Expo Go — use a development build for push + permission wiring.
 */
export async function ensureNotificationPermissionAsync(): Promise<NotificationPermissionState> {
  if (Platform.OS === "web" || !isRemotePushAvailable()) {
    return { granted: false, canAskAgain: false, status: "denied" };
  }
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return { granted: false, canAskAgain: false, status: "denied" };
  }
  await ensureAndroidChannel(Notifications);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.status === "granted") {
    return {
      granted: true,
      canAskAgain: current.canAskAgain !== false,
      status: current.status,
    };
  }
  if (current.canAskAgain === false) {
    return {
      granted: false,
      canAskAgain: false,
      status: current.status,
    };
  }
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return {
    granted: requested.granted || requested.status === "granted",
    canAskAgain: requested.canAskAgain !== false,
    status: requested.status,
  };
}

export async function getNotificationPermissionStatusAsync(): Promise<string> {
  if (!isRemotePushAvailable()) return "denied";
  const Notifications = await getNotificationsModule();
  if (!Notifications) return "denied";
  const current = await Notifications.getPermissionsAsync();
  return current.status;
}

export type PushRegistrationResult = {
  token: string | null;
  error: string | null;
};

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  const result = await registerForPushNotificationsDetailed();
  return result.token;
}

export async function registerForPushNotificationsDetailed(): Promise<PushRegistrationResult> {
  setLastPushRegistrationError(null);
  if (Platform.OS === "web") {
    const error = "Push is not supported on web.";
    setLastPushRegistrationError(error);
    return { token: null, error };
  }

  if (!isRemotePushAvailable()) {
    const error =
      "Expo Go cannot receive remote push on SDK 53+. Use a development build: npx expo run:android / run:ios.";
    setLastPushRegistrationError(error);
    return { token: null, error };
  }

  const perm = await ensureNotificationPermissionAsync();
  if (!perm.granted) {
    const error = "Notification permission not granted.";
    setLastPushRegistrationError(error);
    return { token: null, error };
  }

  if (!Device.isDevice) {
    const error = "Push tokens require a physical device (or Android emulator with Google Play).";
    setLastPushRegistrationError(error);
    return { token: null, error };
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    const error =
      "Missing EAS projectId. Run `eas init` and set expo.extra.eas.projectId in app.json.";
    setLastPushRegistrationError(error);
    return { token: null, error };
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    const error = "expo-notifications is unavailable in this build.";
    setLastPushRegistrationError(error);
    return { token: null, error };
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    const value = token.data || null;
    if (!value) {
      const error = "Expo returned an empty push token.";
      setLastPushRegistrationError(error);
      return { token: null, error };
    }
    setCachedPushToken(value);
    setLastPushRegistrationError(null);
    return { token: value, error: null };
  } catch (e: any) {
    const error = e?.message || String(e);
    setLastPushRegistrationError(error);
    console.warn("[gigZee] Expo push token failed", e);
    return { token: null, error };
  }
}

export function getNotificationDeepLink(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (typeof data.path === "string" && data.path.startsWith("/")) return data.path;

  const type = String(data.type || "");
  const from = typeof data.from_user_id === "string" ? data.from_user_id : null;
  const gigId = typeof data.gig_id === "string" ? data.gig_id : null;
  const bandId = typeof data.band_id === "string" ? data.band_id : null;
  const equipmentId = typeof data.equipment_id === "string" ? data.equipment_id : null;
  const studioId = typeof data.studio_id === "string" ? data.studio_id : null;
  const lessonId = typeof data.lesson_id === "string" ? data.lesson_id : null;
  const authorId = typeof data.author_id === "string" ? data.author_id : from;

  if ((type === "message" || type === "messages.new") && from) return `/chat/${from}`;
  if (type.startsWith("gigs.") && gigId) return `/gig/${gigId}`;
  if ((type === "follow" || type === "social.follow") && from) return `/user/${from}`;
  if (type.startsWith("social.") && authorId) {
    if (type === "social.follow") return `/user/${from}`;
    return `/user/${authorId}/posts`;
  }
  if (type.startsWith("community.") && authorId) return `/user/${authorId}/posts`;
  if (type.startsWith("bands.") && bandId) return `/listing/band/${bandId}`;
  if (type.startsWith("equipment.") && equipmentId) return `/listing/equipment/${equipmentId}`;
  if (type.startsWith("studios.") && studioId) return `/listing/studio/${studioId}`;
  if (type.startsWith("lessons.") && lessonId) return `/listing/lesson/${lessonId}`;
  if (type.startsWith("system.")) return "/notifications";
  return null;
}

export async function syncAppBadge(count: number): Promise<void> {
  if (!isRemotePushAvailable()) return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Badge unsupported on some Android OEMs
  }
}
