import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { DatePickerField } from "@/src/components/DatePickerField";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

type Weekly = Record<string, string[]>;

function emptyWeekly(): Weekly {
  return Object.fromEntries(DAYS.map((d) => [d.key, []]));
}

export default function AvailabilityScreen() {
  const { user, fetchApi } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekly, setWeekly] = useState<Weekly>(emptyWeekly);
  const [awayOn, setAwayOn] = useState(false);
  const [awayStart, setAwayStart] = useState<string | null>(null);
  const [awayEnd, setAwayEnd] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res: any = await fetchApi(`/profile/musician/${user.id}`);
      const a = res?.profile?.availability || {};
      const next = emptyWeekly();
      const src = a.weekly || {};
      for (const d of DAYS) {
        const slots = src[d.key];
        next[d.key] = Array.isArray(slots) && slots.length > 0 ? ["available"] : [];
      }
      setWeekly(next);
      if (a.vacation?.start) {
        setAwayOn(true);
        setAwayStart(a.vacation.start);
        setAwayEnd(a.vacation.end || null);
      }
    } catch {
      setWeekly(emptyWeekly());
    } finally {
      setLoading(false);
    }
  }, [fetchApi, user]);

  useEffect(() => { load(); }, [load]);

  const toggleDay = (key: string) => {
    setWeekly((prev) => {
      const on = (prev[key] || []).length > 0;
      return { ...prev, [key]: on ? [] : ["available"] };
    });
    Haptics.selectionAsync().catch(() => {});
  };

  const setAll = (on: boolean) => {
    setWeekly(Object.fromEntries(DAYS.map((d) => [d.key, on ? ["available"] : []])));
    Haptics.selectionAsync().catch(() => {});
  };

  const save = async () => {
    setErr(null);
    setOk(null);
    if (awayOn) {
      if (!awayStart || !awayEnd) {
        setErr("Pick both Away from and Until dates");
        return;
      }
      if (awayEnd < awayStart) {
        setErr("Until date must be on or after Away from");
        return;
      }
    }
    try {
      setSaving(true);
      await fetchApi("/profile/musician", {
        method: "PATCH",
        body: JSON.stringify({
          availability: {
            weekly,
            vacation: awayOn && awayStart && awayEnd
              ? { start: awayStart, end: awayEnd }
              : null,
          },
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setOk("Availability saved");
      setTimeout(() => router.back(), 700);
    } catch (e: any) {
      setErr(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.bg} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      </SafeAreaView>
    );
  }

  const activeDays = DAYS.filter((d) => (weekly[d.key] || []).length > 0).length;

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="avail-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Availability</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>Tap the days you’re free for gigs, sessions, or collabs.</Text>

        <View style={styles.quickRow}>
          <Pressable testID="avail-all" onPress={() => setAll(true)} style={styles.quickBtn}>
            <Text style={styles.quickTxt}>All days</Text>
          </Pressable>
          <Pressable testID="avail-none" onPress={() => setAll(false)} style={styles.quickBtn}>
            <Text style={styles.quickTxt}>Clear</Text>
          </Pressable>
          <Text style={styles.quickMeta}>{activeDays}/7 days</Text>
        </View>

        <View style={styles.dayList}>
          {DAYS.map((d) => {
            const on = (weekly[d.key] || []).length > 0;
            return (
              <Pressable
                key={d.key}
                testID={`avail-day-${d.key}`}
                onPress={() => toggleDay(d.key)}
                style={[styles.dayRow, on && styles.dayRowOn]}
              >
                <Text style={[styles.dayLbl, on && styles.dayLblOn]}>{d.label}</Text>
                <View style={[styles.dot, on && styles.dotOn]}>
                  {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.awayCard}>
          <View style={styles.awayHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.awayTitle}>Away / vacation</Text>
              <Text style={styles.awaySub}>Hide yourself as unavailable for a date range</Text>
            </View>
            <Switch
              testID="avail-away-switch"
              value={awayOn}
              onValueChange={setAwayOn}
              thumbColor={awayOn ? theme.brand : "#666"}
              trackColor={{ true: theme.brandTint, false: theme.bg3 }}
            />
          </View>
          {awayOn && (
            <View style={{ marginTop: 14, gap: 10 }}>
              <Text style={styles.label}>Away from</Text>
              <DatePickerField
                testID="avail-away-start"
                value={awayStart}
                onChange={setAwayStart}
                placeholder="Start date"
              />
              <Text style={styles.label}>Until</Text>
              <DatePickerField
                testID="avail-away-end"
                value={awayEnd}
                onChange={setAwayEnd}
                placeholder="End date"
                minimumDate={awayStart ? new Date(`${awayStart}T12:00:00`) : undefined}
              />
            </View>
          )}
        </View>

        {err && <Text style={styles.err} testID="avail-error">{err}</Text>}
        {ok && <Text style={styles.ok} testID="avail-ok">{ok}</Text>}

        <Pressable testID="avail-save" onPress={save} disabled={saving} style={styles.cta}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Save availability</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { ...type.titleMd, color: theme.text, fontWeight: "700" },
  body: { padding: 20, paddingBottom: 60 },
  lead: { ...type.bodySm, color: theme.textDim, marginBottom: 16 },
  quickRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  quickBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill,
    backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border,
  },
  quickTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  quickMeta: { ...type.caption, color: theme.textDim, marginLeft: "auto" },
  dayList: { gap: 8 },
  dayRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: theme.radius.md,
    backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border,
  },
  dayRowOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  dayLbl: { ...type.bodySm, color: theme.textMid, fontWeight: "600" },
  dayLblOn: { color: theme.text, fontWeight: "700" },
  dot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: theme.border,
    alignItems: "center", justifyContent: "center",
  },
  dotOn: { backgroundColor: theme.brand, borderColor: theme.brand },
  awayCard: {
    marginTop: 24, padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border,
  },
  awayHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  awayTitle: { ...type.bodyMd, color: theme.text, fontWeight: "700" },
  awaySub: { ...type.caption, color: theme.textDim, marginTop: 3 },
  label: { ...type.label, color: theme.textMid, marginBottom: 6 },
  err: { ...type.caption, color: theme.error, marginTop: 16 },
  ok: { ...type.caption, color: theme.success, marginTop: 16 },
  cta: {
    marginTop: 24, backgroundColor: theme.brand, borderRadius: theme.radius.pill,
    paddingVertical: 16, alignItems: "center",
  },
  ctaTxt: { ...type.titleMd, color: "#fff", fontWeight: "700" },
});
