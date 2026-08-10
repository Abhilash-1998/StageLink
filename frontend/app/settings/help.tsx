import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

const SUPPORT_EMAIL = "support@gigze.app";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I apply to a gig?",
    a: "Open Discover, tap a gig, then use Apply / Collaborate. You can track status under Applications & gigs.",
  },
  {
    q: "How do I hire someone?",
    a: "Open their profile and tap Hire / Invite, or create a gig from Create and share it with collaborators.",
  },
  {
    q: "How do I hide my phone number?",
    a: "Go to Edit profile → Privacy and turn on Hide contact. Others won’t see your number on your profile.",
  },
  {
    q: "How do I delete my account?",
    a: "Settings → Delete account. This permanently removes your profile, posts, listings, and messages. More info: https://abhilash-1998.github.io/StageLink/account-deletion/",
  },
  {
    q: "Where is the Privacy Policy?",
    a: "Read it at https://abhilash-1998.github.io/StageLink/privacy-policy/ (also linked from Settings → Legal).",
  },
];

export default function HelpScreen() {
  const emailSupport = () => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("gigZee help")}`,
    ).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="help-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Help</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Pressable testID="help-email" onPress={emailSupport} style={styles.contactCard}>
          <View style={styles.contactIcon}>
            <Ionicons name="mail-outline" size={22} color={theme.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.contactTitle}>Contact support</Text>
            <Text style={styles.contactSub}>{SUPPORT_EMAIL}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={theme.textDim} />
        </Pressable>

        <Text style={styles.sectionTitle}>Common questions</Text>
        {FAQS.map((item) => (
          <View key={item.q} style={styles.faqCard}>
            <Text style={styles.faqQ}>{item.q}</Text>
            <Text style={styles.faqA}>{item.a}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { ...type.titleLg, color: theme.text, flex: 1, textAlign: "center", fontWeight: "800" },
  sectionTitle: {
    ...type.tiny, color: theme.textDim, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6,
  },
  contactCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  contactIcon: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand,
  },
  contactTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  contactSub: { ...type.caption, color: theme.textDim, marginTop: 2 },
  faqCard: {
    backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 16,
    borderWidth: 1, borderColor: theme.border, gap: 6,
  },
  faqQ: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  faqA: { ...type.caption, color: theme.textMid, lineHeight: 20 },
});
