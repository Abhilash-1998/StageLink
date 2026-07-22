import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

const FEATURES = [
  { icon: "sparkles" as const, title: "Unlimited AI credits", desc: "AI bios, pricing, contracts anytime" },
  { icon: "trending-up" as const, title: "Featured profile", desc: "Get 5x more visibility on discover" },
  { icon: "briefcase" as const, title: "Unlimited applications", desc: "Apply to as many gigs as you want" },
  { icon: "flash" as const, title: "Priority chat & support", desc: "Instant replies from organizers" },
  { icon: "shield-checkmark" as const, title: "Verified badge", desc: "Stand out with a verified marker" },
];

export default function Subscription() {
  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.headerRow}>
        <Pressable testID="back-btn" onPress={() => router.back()}><Ionicons name="close" size={24} color={theme.text} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <LinearGradient colors={[theme.brand2, theme.brandTint]} style={styles.hero}>
          <Ionicons name="diamond" size={40} color="#fff" />
          <Text style={styles.heroTitle}>StageLink Premium</Text>
          <Text style={styles.heroSub}>Level up your live music career</Text>
        </LinearGradient>

        <View style={{ marginTop: 24, gap: 12 }}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.feat}>
              <View style={styles.featIcon}><Ionicons name={f.icon} size={18} color={theme.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featTitle}>{f.title}</Text>
                <Text style={styles.featDesc}>{f.desc}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={theme.success} />
            </View>
          ))}
        </View>

        <View style={styles.plans}>
          <Pressable testID="plan-monthly" style={styles.plan}>
            <Text style={styles.planName}>Monthly</Text>
            <Text style={styles.planPrice}>₹499<Text style={styles.planPer}> / mo</Text></Text>
          </Pressable>
          <Pressable testID="plan-yearly" style={[styles.plan, styles.planBest]}>
            <View style={styles.bestTag}><Text style={styles.bestTagTxt}>SAVE 40%</Text></View>
            <Text style={[styles.planName, { color: theme.text }]}>Yearly</Text>
            <Text style={[styles.planPrice, { color: theme.text }]}>₹3,599<Text style={styles.planPer}> / yr</Text></Text>
          </Pressable>
        </View>

        <Pressable testID="subscribe-btn" style={styles.cta}>
          <Text style={styles.ctaTxt}>Start 7-day free trial</Text>
        </Pressable>
        <Text style={styles.disc}>Payments via Stripe. Cancel anytime.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: "row", justifyContent: "flex-end", padding: 12 },
  hero: { borderRadius: theme.radius.lg, padding: 28, alignItems: "center", gap: 12 },
  heroTitle: { ...type.h1, color: "#fff" },
  heroSub: { ...type.bodySm, color: "rgba(255,255,255,0.85)" },
  feat: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, padding: 14, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border },
  featIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center" },
  featTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  featDesc: { ...type.caption, color: theme.textDim, marginTop: 2 },
  plans: { flexDirection: "row", gap: 12, marginTop: 24 },
  plan: { flex: 1, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.border, alignItems: "center", position: "relative" },
  planBest: { borderColor: theme.brand, backgroundColor: theme.brandTint },
  planName: { ...type.caption, color: theme.textDim, fontWeight: "600" },
  planPrice: { ...type.h2, color: theme.text, marginTop: 6 },
  planPer: { ...type.caption, color: theme.textDim, fontWeight: "500" },
  bestTag: { position: "absolute", top: -10, backgroundColor: theme.brand, paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.pill },
  bestTagTxt: { ...type.badge, color: "#fff" },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  ctaTxt: { ...type.titleMd, color: "#fff", fontWeight: "700" },
  disc: { ...type.tiny, color: theme.textDim, textAlign: "center", marginTop: 12 },
});
