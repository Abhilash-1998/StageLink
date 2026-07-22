import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ImageBackground, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

const OPTIONS = [
  { key: "musician", label: "I'm a Musician", desc: "Find gigs, showcase your work, get booked.", img: "https://images.pexels.com/photos/18368848/pexels-photo-18368848.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", icon: "musical-notes" as const },
  { key: "organizer", label: "I'm an Organizer", desc: "Post events, discover talent, manage bookings.", img: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800", icon: "megaphone" as const },
];

export default function RoleSelect() {
  const { fetchApi, refreshUser } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (role: "musician" | "organizer") => {
    setBusy(role);
    try {
      await fetchApi("/auth/role", { method: "POST", body: JSON.stringify({ role }) });
      await refreshUser();
      router.replace("/auth/onboarding");
    } finally { setBusy(null); }
  };

  return (
    <SafeAreaView style={styles.bg}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose your path</Text>
        <Text style={styles.sub}>You can change this later in settings.</Text>
      </View>
      <View style={styles.cards}>
        {OPTIONS.map(o => (
          <Pressable key={o.key} testID={`role-${o.key}-card`} onPress={() => pick(o.key as any)} style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}>
            <ImageBackground source={{ uri: o.img }} style={StyleSheet.absoluteFill} imageStyle={{ borderRadius: theme.radius.lg }} />
            <LinearGradient colors={["rgba(9,9,11,0.35)", "rgba(9,9,11,0.95)"]} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.lg }]} />
            <View style={styles.cardInner}>
              <View style={styles.iconWrap}><Ionicons name={o.icon} size={22} color={theme.brand} /></View>
              <Text style={styles.cardTitle}>{o.label}</Text>
              <Text style={styles.cardDesc}>{o.desc}</Text>
              {busy === o.key && <ActivityIndicator color={theme.text} style={{ marginTop: 12 }} />}
            </View>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg, padding: 24 },
  header: { marginTop: 16, marginBottom: 24 },
  title: { color: theme.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: theme.textDim, fontSize: 15, marginTop: 6 },
  cards: { flex: 1, gap: 16 },
  card: { flex: 1, borderRadius: theme.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: theme.border },
  cardInner: { flex: 1, padding: 22, justifyContent: "flex-end" },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(225,29,72,0.15)", borderWidth: 1, borderColor: "rgba(225,29,72,0.4)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  cardTitle: { color: theme.text, fontSize: 24, fontWeight: "800" },
  cardDesc: { color: theme.textMid, fontSize: 14, marginTop: 6, lineHeight: 20 },
});
