import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";
import { ensureNotificationPermissionAsync, isRemotePushAvailable } from "@/src/notifications/push";

export const STARTUP_PERMS_KEY = "gigze_startup_permissions_v1";

export type StartupPermissionResult = {
  notifications: boolean;
  photos: boolean;
  camera: boolean;
};

async function pause(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Request OS dialogs for notifications + photos + camera (sequentially). */
export async function requestStartupPermissions(): Promise<StartupPermissionResult> {
  const result: StartupPermissionResult = {
    notifications: false,
    photos: false,
    camera: false,
  };
  if (Platform.OS === "web") return result;

  // 1) Notifications — skipped in Expo Go (importing expo-notifications errors on Android SDK 53+)
  try {
    if (isRemotePushAvailable()) {
      const perm = await ensureNotificationPermissionAsync();
      result.notifications = perm.granted;
    }
  } catch {
    // ignore — continue to media prompts
  }

  await pause(350);

  // 2) Photo library
  try {
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (cur.granted) {
      result.photos = true;
    } else if (cur.canAskAgain !== false) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      result.photos = req.granted;
    }
  } catch {}

  await pause(350);

  // 3) Camera
  try {
    const cur = await ImagePicker.getCameraPermissionsAsync();
    if (cur.granted) {
      result.camera = true;
    } else if (cur.canAskAgain !== false) {
      const req = await ImagePicker.requestCameraPermissionsAsync();
      result.camera = req.granted;
    }
  } catch {}

  await storage.setItem(STARTUP_PERMS_KEY, true);
  return result;
}

export async function hasPromptedStartupPermissions(): Promise<boolean> {
  const v = await storage.getItem(STARTUP_PERMS_KEY, false);
  return v === true;
}
