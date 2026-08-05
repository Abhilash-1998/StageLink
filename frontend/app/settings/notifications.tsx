import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";

const LABELS: { key: string; label: string; hint: string; available: boolean }[] = [
  { key: "messages", label: "Messages", hint: "Direct messages", available: true },
  { key: "social", label: "Social", hint: "Follows, likes, comments", available: true },
  { key: "gigs", label: "Gigs", hint: "Applications & cancellations", available: true },
  { key: "community", label: "Community", hint: "Feed updates", available: true },
  { key: "system", label: "System", hint: "Account & announcements", available: true },
  { key: "bands", label: "Bands", hint: "Coming soon", available: false },
  { key: "equipment", label: "Equipment", hint: "Coming soon", available: false },
  { key: "studios", label: "Studios", hint: "Coming soon", available: false },
  { key: "lessons", label: "Lessons", hint: "Coming soon", available: false },
  { key: "promotions", label: "Promotions", hint: "Offers & tips", available: true },
];

export default function NotificationPrefsScreen() {
  const { fetchApi } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res: any = await fetchApi("/notifications/prefs");
        setPrefs(res.prefs || {});
      } catch {
        setPrefs({});
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchApi]);

  const toggle = async (key: string, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaving(key);
    try {
      const res: any = await fetchApi("/notifications/prefs", {
        method: "PUT",
        body: JSON.stringify({ [key]: value }),
      });
      if (res?.prefs) setPrefs(res.prefs);
    } catch {
      setPrefs((p) => ({ ...p, [key]: !value }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="prefs-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Notification settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
          <Text style={styles.hint}>
            Choose what you want to hear about. Push + in-app inbox both respect these.
          </Text>
          {LABELS.map((row) => (
            <View key={row.key} style={[styles.row, !row.available && { opacity: 0.55 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTxt}>{row.label}</Text>
                <Text style={styles.rowHint}>{row.hint}</Text>
              </View>
              {saving === row.key ? (
                <ActivityIndicator color={theme.brand} />
              ) : (
                <Switch
                  testID={`pref-${row.key}`}
                  value={!!prefs[row.key]}
                  disabled={!row.available}
                  onValueChange={(v) => toggle(row.key, v)}
                  trackColor={{ false: theme.bg3, true: theme.brand }}
                  thumbColor="#fff"
                />
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { ...type.titleLg, color: theme.text, flex: 1, textAlign: "center", fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hint: { ...type.caption, color: theme.textDim, marginBottom: 4, lineHeight: 18 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  rowTxt: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  rowHint: { ...type.tiny, color: theme.textDim, marginTop: 2 },
});
