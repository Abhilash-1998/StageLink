import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

type Choice = "musician" | "organizer" | "both";

const OPTIONS: { key: Choice; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "musician", label: "I'm a Musician", desc: "Find gigs, showcase your work, get booked.", icon: "musical-notes" },
  { key: "organizer", label: "I Hire Musicians", desc: "Post events, discover talent, manage bookings.", icon: "megaphone" },
  { key: "both", label: "Both", desc: "Perform and hire. Switch anytime from your profile.", icon: "infinite" },
];

export default function RoleSelect() {
  const { fetchApi, refreshUser } = useAuth();
  const [busy, setBusy] = useState<Choice | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (choice: Choice) => {
    setErr(null); setBusy(choice);
    const roles = choice === "both" ? ["musician", "organizer"] : [choice];
    try {
      await fetchApi("/auth/roles", { method: "POST", body: JSON.stringify({ roles }) });
      await refreshUser();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  return (
    <SafeAreaView style={styles.bg}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.title}>What brings you to gigZee?</Text>
          <Text style={styles.sub}>You can update this later from your profile.</Text>
        </View>
        <View style={styles.cards}>
          {OPTIONS.map(o => (
            <Pressable key={o.key} testID={`role-${o.key}-card`} onPress={() => pick(o.key)}
                       disabled={!!busy}
                       style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.99 }] }]}>
              <View style={styles.cardInner}>
                <View style={styles.iconWrap}><Ionicons name={o.icon} size={20} color={theme.brand} /></View>
                <Text style={styles.cardTitle}>{o.label}</Text>
                <Text style={styles.cardDesc}>{o.desc}</Text>
                {busy === o.key && <ActivityIndicator color={theme.text} style={{ marginTop: 10 }} />}
              </View>
            </Pressable>
          ))}
        </View>
        {err && <Text style={styles.err} testID="role-error">{err}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  header: { marginTop: 8, marginBottom: 20 },
  title: { ...type.displayMd, color: theme.text },
  sub: { ...type.bodySm, color: theme.textDim, marginTop: 6 },
  cards: { gap: 14 },
  card: {
    minHeight: 120,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bg2,
  },
  cardInner: { padding: 20, justifyContent: "flex-start" },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(225,29,72,0.15)",
    borderWidth: 1, borderColor: "rgba(225,29,72,0.4)",
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  cardTitle: { ...type.h2, color: theme.text },
  cardDesc: { ...type.bodySm, color: theme.textMid, marginTop: 4 },
  err: { ...type.caption, color: theme.error, marginTop: 16, textAlign: "center" },
});
