import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Settings — reached from the "Settings" button on own profile.
 * Hosts everything that used to live inline on the profile screen: shortcuts
 * to Applications, Insights, and Sign out. Keeps the profile itself
 * identical to every other user's profile.
 */
export default function Settings() {
  const { logout } = useAuth();
  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="settings-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable testID="settings-edit-profile" onPress={() => router.push("/profile/edit")} style={styles.row}>
          <Ionicons name="person-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Edit profile</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
        </Pressable>

        <Text style={styles.sectionTitle}>Work</Text>
        <Pressable testID="settings-applications" onPress={() => router.push("/(tabs)/applications")} style={styles.row}>
          <Ionicons name="briefcase-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Applications & gigs</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
        </Pressable>
        <Pressable testID="settings-insights" onPress={() => router.push("/(tabs)/dashboard")} style={styles.row}>
          <Ionicons name="stats-chart-outline" size={18} color={theme.text} />
          <Text style={styles.rowTxt}>Insights</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
        </Pressable>

        <Text style={styles.sectionTitle}>Session</Text>
        <Pressable
          testID="settings-signout"
          onPress={async () => { await logout(); }}
          style={[styles.row, { borderColor: theme.error }]}
        >
          <Ionicons name="log-out-outline" size={18} color={theme.error} />
          <Text style={[styles.rowTxt, { color: theme.error }]}>Sign out</Text>
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
