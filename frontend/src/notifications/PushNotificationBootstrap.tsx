import React, { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import {
  getNotificationsModule,
  isRemotePushAvailable,
  getNotificationDeepLink,
  syncAppBadge,
  setCachedPushToken,
} from "@/src/notifications/push";
import { syncPushRegistrationWithBackend } from "@/src/notifications/syncPushRegistration";
import { createAnalytics } from "@/src/services/analytics";

function navigateFromData(data: Record<string, unknown> | undefined) {
  const path = getNotificationDeepLink(data);
  if (!path) return;
  try {
    router.push(path as never);
  } catch {
    // ignore navigation failures
  }
}

/**
 * After login: request permission, register Expo push token, keep it fresh,
 * handle taps (fg / bg / cold start), and sync the app icon badge.
 * No-ops in Expo Go (SDK 53+ removed remote push there).
 */
export function PushNotificationBootstrap({ children }: { children: React.ReactNode }) {
  const { user, status, fetchApi } = useAuth();
  const tokenRef = useRef<string | null>(null);
  const handledColdStart = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !user?.id) return;
    createAnalytics(fetchApi).appOpened();
  }, [status, user?.id, fetchApi]);

  // Permission + register (only after login, only in native builds)
  useEffect(() => {
    if (status !== "authenticated" || !user?.id || !isRemotePushAvailable()) return;

    let cancelled = false;
    (async () => {
      const result = await syncPushRegistrationWithBackend(fetchApi);
      if (cancelled) return;
      if (!result.ok) {
        if (result.error) console.warn("[gigZee] Push registration failed:", result.error);
        return;
      }
      tokenRef.current = result.token;
      try {
        const res = await fetchApi<{ unread: number }>("/notifications/unread-count");
        await syncAppBadge(res?.unread || 0);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [status, user?.id, fetchApi]);

  // Native device token rotation → refresh Expo push token + re-register
  useEffect(() => {
    if (status !== "authenticated" || !user?.id || !isRemotePushAvailable()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const Notifications = await getNotificationsModule();
      if (!Notifications || cancelled) return;
      const sub = Notifications.addPushTokenListener(async () => {
        const result = await syncPushRegistrationWithBackend(fetchApi, { force: true });
        if (!result.ok || !result.token || result.token === tokenRef.current) return;
        tokenRef.current = result.token;
      });
      remove = () => sub.remove();
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [status, user?.id, fetchApi]);

  // Re-register when returning to foreground (token can rotate offline)
  useEffect(() => {
    if (status !== "authenticated" || !user?.id || !isRemotePushAvailable()) return;
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      const result = await syncPushRegistrationWithBackend(fetchApi);
      if (result.ok && result.token && result.token !== tokenRef.current) {
        tokenRef.current = result.token;
      }
      try {
        const res = await fetchApi<{ unread: number }>("/notifications/unread-count");
        await syncAppBadge(res?.unread || 0);
      } catch {}
    });
    return () => sub.remove();
  }, [status, user?.id, fetchApi]);

  // Foreground receipt — badge bump; banner is handled by setNotificationHandler
  useEffect(() => {
    if (status !== "authenticated" || !isRemotePushAvailable()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const Notifications = await getNotificationsModule();
      if (!Notifications || cancelled) return;
      const sub = Notifications.addNotificationReceivedListener(() => {
        fetchApi<{ unread: number }>("/notifications/unread-count")
          .then((res) => syncAppBadge(res?.unread || 0))
          .catch(() => {});
      });
      remove = () => sub.remove();
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [status, fetchApi]);

  // Tap while running (fg or bg)
  useEffect(() => {
    if (!isRemotePushAvailable()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const Notifications = await getNotificationsModule();
      if (!Notifications || cancelled) return;
      const sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        navigateFromData(data);
      });
      remove = () => sub.remove();
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  // Cold start: opened from a killed-state notification
  useEffect(() => {
    if (!isRemotePushAvailable() || handledColdStart.current) return;
    let cancelled = false;
    (async () => {
      const Notifications = await getNotificationsModule();
      if (!Notifications || cancelled) return;
      const response = await Notifications.getLastNotificationResponseAsync();
      if (!response || handledColdStart.current) return;
      handledColdStart.current = true;
      const data = response.notification.request.content.data as Record<string, unknown>;
      setTimeout(() => navigateFromData(data), 600);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear local token ref on logout (unregister is handled in AuthContext.logout)
  useEffect(() => {
    if (status === "authenticated") return;
    tokenRef.current = null;
    setCachedPushToken(null);
    syncAppBadge(0);
  }, [status]);

  return <>{children}</>;
}
