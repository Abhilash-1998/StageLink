import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Switch, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { confirmDelete } from "@/src/utils/confirm";
import {
  ensureNotificationPermissionAsync,
  getNotificationPermissionStatusAsync,
  getCachedPushToken,
  setCachedPushToken,
  isRemotePushAvailable,
} from "@/src/notifications/push";
import { syncPushRegistrationWithBackend } from "@/src/notifications/syncPushRegistration";
import { isRunningInExpoGo } from "expo";

/**
 * Settings — reached from the "Settings" button on own profile.
 * Hosts shortcuts: Edit profile, Applications, Help, Delete account, Sign out.
 * Analytics is commented out until subscription plans ship.
 */
export default function Settings() {
  const { logout, fetchApi } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const refreshPushStatus = async () => {
    if (Platform.OS === "web") return;
    if (isRunningInExpoGo()) {
      setPushEnabled(false);
      return;
    }
    const perm = await getNotificationPermissionStatusAsync();
    const token = getCachedPushToken();
    let serverCount = 0;
    try {
      const res = await fetchApi<{ active_count?: number }>("/devices");
      serverCount = res?.active_count || 0;
    } catch {}
    setPushEnabled(perm === "granted" && !!token && serverCount > 0);
  };

  useEffect(() => {
    if (Platform.OS === "web") return;
    refreshPushStatus();
  }, []);

  const togglePush = async (next: boolean) => {
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Push notifications work on the iOS and Android apps.");
      return;
    }
    if (!isRemotePushAvailable()) {
      Alert.alert(
        "Development build required",
        "Expo Go cannot receive push notifications on SDK 53+. Run: npx expo run:android",
      );
      return;
    }
    setPushBusy(true);
    try {
      if (next) {
        // 1) Ask the system permission dialog first (never jump to Settings prematurely).
        const perm = await ensureNotificationPermissionAsync();
        if (!perm.granted) {
          if (!perm.canAskAgain) {
            Alert.alert(
              "Enable notifications",
              "Notifications were previously denied. You can turn them on in Settings.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() },
              ],
            );
          }
          // If canAskAgain was true, the user just dismissed the system dialog — no Settings alert.
          setPushEnabled(false);
          return;
        }

        // 2) Permission granted — try to register a push token (may fail in Expo Go).
        const result = await syncPushRegistrationWithBackend(fetchApi, { force: true });
        if (result.ok) {
          setPushEnabled(true);
          await refreshPushStatus();
        } else {
          setPushEnabled(false);
          if (result.error) {
            Alert.alert("Push not ready", result.error);
          }
        }
      } else {
        const token = getCachedPushToken();
        if (token) {
          try {
            await fetchApi("/devices/unregister", {
              method: "POST",
              body: JSON.stringify({ token, expo_push_token: token }),
            });
          } catch {}
          setCachedPushToken(null);
        }
        setPushEnabled(false);
      }
    } catch (e: any) {
      Alert.alert("Couldn't update", e?.message || "Please try again.");
      setPushEnabled(false);
    } finally {
      setPushBusy(false);
      refreshPushStatus();
    }
  };

  const deleteAccount = async () => {
    const ok = await confirmDelete(
      "Delete account?",
      "This permanently deletes your profile, posts, listings, and messages. This cannot be undone.",
    );
    if (!ok) return;

    if (Platform.OS !== "web") {
      const ok2 = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Are you sure?",
          "Your gigZee account will be gone forever.",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Delete forever", style: "destructive", onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      });
      if (!ok2) return;
    }

    setDeleting(true);
    try {
      await fetchApi("/auth/me", { method: "DELETE" });
      await logout();
      router.replace("/auth/login");
    } catch (e: any) {
      Alert.alert("Couldn't delete account", e?.message || "Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="settings-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable testID="settings-edit-profile" onPress={() => router.push("/profile/edit")} style={styles.row}>
          <Ionicons name="person-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Edit profile</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
        </Pressable>

        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.row}>
          <Ionicons name="notifications-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Push notifications</Text>
          {pushBusy ? (
            <ActivityIndicator color={theme.brand} />
          ) : (
            <Switch
              testID="settings-push-toggle"
              value={pushEnabled}
              onValueChange={togglePush}
              trackColor={{ false: theme.bg3, true: theme.brand }}
              thumbColor="#fff"
            />
          )}
        </View>
        <Pressable testID="settings-notif-inbox" onPress={() => router.push("/notifications")} style={styles.row}>
          <Ionicons name="mail-unread-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Notification inbox</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
        </Pressable>

        <Text style={styles.sectionTitle}>Work</Text>
        <Pressable testID="settings-applications" onPress={() => router.push("/(tabs)/applications")} style={styles.row}>
          <Ionicons name="briefcase-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Applications & gigs</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
        </Pressable>
        {/* Analytics — gated for subscription plans (future)
        <Pressable testID="settings-analytics" onPress={() => router.push("/(tabs)/dashboard")} style={styles.row}>
          <Ionicons name="stats-chart-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Analytics</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
        </Pressable>
        */}

        <Text style={styles.sectionTitle}>Support</Text>
        <Pressable testID="settings-help" onPress={() => router.push("/settings/help")} style={styles.row}>
          <Ionicons name="help-circle-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Help</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
        </Pressable>

        <Text style={styles.sectionTitle}>Legal</Text>
        <Pressable
          testID="settings-privacy"
          onPress={() => Linking.openURL("https://abhilash-1998.github.io/StageLink/privacy-policy/")}
          style={styles.row}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Privacy Policy</Text>
          <Ionicons name="open-outline" size={18} color={theme.textDim} />
        </Pressable>
        <Pressable
          testID="settings-terms"
          onPress={() => Linking.openURL("https://abhilash-1998.github.io/StageLink/terms-of-service/")}
          style={styles.row}
        >
          <Ionicons name="document-text-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Terms of Service</Text>
          <Ionicons name="open-outline" size={18} color={theme.textDim} />
        </Pressable>
        <Pressable
          testID="settings-account-deletion-info"
          onPress={() => Linking.openURL("https://abhilash-1998.github.io/StageLink/account-deletion/")}
          style={styles.row}
        >
          <Ionicons name="information-circle-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Account deletion info</Text>
          <Ionicons name="open-outline" size={18} color={theme.textDim} />
        </Pressable>

        <Text style={styles.sectionTitle}>Session</Text>
        <Pressable
          testID="settings-signout"
          onPress={async () => { await logout(); }}
          style={styles.row}
        >
          <Ionicons name="log-out-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Sign out</Text>
          <View style={{ width: 18 }} />
        </Pressable>

        <Text style={styles.sectionTitle}>Danger zone</Text>
        <Pressable
          testID="settings-delete-account"
          onPress={deleteAccount}
          disabled={deleting}
          style={[styles.row, { borderColor: theme.error }]}
        >
          {deleting ? (
            <ActivityIndicator color={theme.error} />
          ) : (
            <Ionicons name="trash-outline" size={18} color={theme.error} />
          )}
          <Text style={[styles.rowTxt, { color: theme.error }]}>
            {deleting ? "Deleting…" : "Delete account"}
          </Text>
          <View style={{ width: 18 }} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { ...type.titleLg, color: theme.text, flex: 1, textAlign: "center", fontWeight: "800" },
  sectionTitle: { ...type.tiny, color: theme.textDim, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.border },
  rowTxt: { ...type.bodySm, color: theme.text, fontWeight: "600", flex: 1 },
});
