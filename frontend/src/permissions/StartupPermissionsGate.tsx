import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme, type } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import {
  STARTUP_PERMS_KEY,
  hasPromptedStartupPermissions,
  requestStartupPermissions,
} from "@/src/permissions/startupPermissions";

/**
 * First-launch gate: explains + requests Notifications, Photos, and Camera
 * as soon as the app opens.
 */
export function StartupPermissionsGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(Platform.OS === "web");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    (async () => {
      const done = await hasPromptedStartupPermissions();
      if (cancelled) return;
      if (done) {
        setReady(true);
        return;
      }
      setVisible(true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onAllow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await requestStartupPermissions();
    } finally {
      setBusy(false);
      setVisible(false);
    }
  };

  const onNotNow = async () => {
    await storage.setItem(STARTUP_PERMS_KEY, true);
    setVisible(false);
  };

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={theme.brand} size="large" />
      </View>
    );
  }

  return (
    <>
      {children}
      <Modal visible={visible} animationType="fade" transparent>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.iconRow}>
              <View style={styles.iconBubble}>
                <Ionicons name="notifications" size={22} color={theme.brand} />
              </View>
              <View style={styles.iconBubble}>
                <Ionicons name="images" size={22} color={theme.brand} />
              </View>
              <View style={styles.iconBubble}>
                <Ionicons name="camera" size={22} color={theme.brand} />
              </View>
            </View>
            <Text style={styles.title}>Enable access</Text>
            <Text style={styles.body}>
              gigZee needs notifications for messages and gig updates, and photos/camera
              so you can share posts and pick a profile photo.
            </Text>
            <Pressable
              testID="startup-perms-allow"
              onPress={onAllow}
              style={styles.primary}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryTxt}>Allow permissions</Text>
              )}
            </Pressable>
            <Pressable
              testID="startup-perms-skip"
              onPress={onNotNow}
              style={styles.secondary}
              disabled={busy}
            >
              <Text style={styles.secondaryTxt}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: theme.bg2,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 22,
  },
  iconRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.brandTint,
    borderWidth: 1,
    borderColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.titleLg, color: theme.text, fontWeight: "800", marginBottom: 8 },
  body: { ...type.bodySm, color: theme.textMid, lineHeight: 20, marginBottom: 20 },
  primary: {
    backgroundColor: theme.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryTxt: { ...type.bodySm, color: "#fff", fontWeight: "700" },
  secondary: { paddingVertical: 10, alignItems: "center" },
  secondaryTxt: { ...type.caption, color: theme.textDim, fontWeight: "600" },
});
