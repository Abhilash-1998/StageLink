import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

const CITIES = ["Mumbai", "Bengaluru", "Delhi", "Pune", "Hyderabad", "Chennai", "Kolkata"];
const INTERESTS = ["Perform", "Hire talent", "Sell equipment", "Rent equipment", "Teach", "Book studios", "Build a band"];

// Single, welcoming profile builder. No role gate — action-based model means
// users pick what they want to do later from the Create tab.
export default function Onboarding() {
  const { user, fetchApi, refreshUser } = useAuth();
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleInt = (v: string) =>
    setInterests(interests.includes(v) ? interests.filter(x => x !== v) : [...interests, v]);

  const generateBio = async () => {
    if (!city.trim()) { setErr("Enter your city first"); return; }
    setErr(null); setAiLoading(true);
    try {
      // stub musician profile so LLM has context
      await fetchApi("/profile/musician", {
        method: "POST",
        body: JSON.stringify({ city, genres: [], instruments: [],
                               experience_years: 0, pricing_per_hour: 0 }),
      });
      const r: any = await fetchApi("/ai/bio", { method: "POST", body: JSON.stringify({ tone: "professional" }) });
      setBio(r.bio);
    } catch (e: any) { setErr(e.message); }
    finally { setAiLoading(false); }
  };

  const save = async () => {
    setErr(null);
    if (!city.trim()) { setErr("Enter your city"); return; }
    setSaving(true);
    try {
      // Enable both roles by default (action-based) and save minimal profiles.
      await fetchApi("/auth/roles", {
        method: "POST",
        body: JSON.stringify({ roles: ["musician", "organizer"] }),
      });
      await fetchApi("/profile/musician", {
        method: "POST",
        body: JSON.stringify({
          bio, city, genres: [], instruments: [], languages: ["English"],
          experience_years: 0, pricing_per_hour: 0,
        }),
      });
      await fetchApi("/profile/organizer", {
        method: "POST",
        body: JSON.stringify({ org_name: user?.full_name || "Independent", city, bio }),
      });
      await fetchApi("/auth/active-role", {
        method: "POST",
        body: JSON.stringify({ active_role: "musician" }),
      });
      await refreshUser();
      // AuthGate routes to /(tabs)
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.bg}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Welcome, {user?.full_name?.split(" ")[0]}</Text>
          <Text style={styles.sub}>A few quick details. You can add gigs, gear, and more from the Create tab anytime.</Text>

          <Text style={styles.label}>City</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {CITIES.map(c => {
              const on = city === c;
              return (
                <Pressable key={c} testID={`city-${c}`} onPress={() => setCity(c)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{c}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <TextInput
            testID="onboard-city-input" style={styles.input} value={city} onChangeText={setCity}
            placeholder="Or type another city…" placeholderTextColor={theme.textDim}
          />

          <Text style={styles.label}>What brings you to StageLink?</Text>
          <View style={styles.chipWrap}>
            {INTERESTS.map(x => {
              const on = interests.includes(x);
              return (
                <Pressable key={x} testID={`int-${x}`} onPress={() => toggleInt(x)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{x}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <Text style={styles.label}>Short bio (optional)</Text>
            <Pressable testID="ai-bio-btn" onPress={generateBio} disabled={aiLoading} style={styles.aiBtn}>
              {aiLoading ? <ActivityIndicator color={theme.brand} size="small" /> : <Ionicons name="sparkles" size={14} color={theme.brand} />}
              <Text style={styles.aiBtnTxt}>{aiLoading ? "Writing…" : "AI generate"}</Text>
            </Pressable>
          </View>
          <TextInput
            testID="onboard-bio-input"
            style={[styles.input, { height: 110, textAlignVertical: "top", paddingTop: 12 }]}
            value={bio} onChangeText={setBio} multiline
            placeholder="Tell the community what you do…" placeholderTextColor={theme.textDim}
          />

          {err && <Text style={styles.err} testID="onboard-error">{err}</Text>}

          <Pressable testID="onboard-save-btn" onPress={save} disabled={saving} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Enter StageLink</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  title: { ...type.h1, color: theme.text },
  sub: { ...type.bodyMd, color: theme.textDim, marginTop: 6, marginBottom: 20 },
  label: { ...type.label, color: theme.textMid, marginBottom: 6, marginTop: 14 },
  input: { ...type.bodyMd, backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, color: theme.text, marginTop: 8 },
  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: { flexShrink: 0, paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  chipOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  chipTxt: { ...type.label, color: theme.textDim, fontWeight: "500" },
  chipTxtOn: { ...type.label, color: theme.text },
  aiBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand },
  aiBtnTxt: { ...type.label, color: theme.brand },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, marginTop: 28, alignItems: "center" },
  ctaText: { ...type.titleLg, color: "#fff" },
  err: { ...type.caption, color: theme.error, marginTop: 12 },
});
