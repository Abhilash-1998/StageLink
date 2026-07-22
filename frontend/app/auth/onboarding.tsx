import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

const GENRES = ["Jazz", "Pop", "Rock", "Indie", "EDM", "Classical", "Fusion", "R&B", "Soul", "House"];
const INSTRUMENTS = ["Vocals", "Guitar", "Keyboard", "Violin", "Drums", "Bass", "DJ Deck", "Saxophone"];

export default function Onboarding() {
  const { user, fetchApi, refreshUser } = useAuth();
  const isMusician = user?.roles?.includes("musician");
  const isOrganizer = user?.roles?.includes("organizer");

  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [orgName, setOrgName] = useState("");
  const [exp, setExp] = useState("");
  const [price, setPrice] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [instr, setInstr] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (arr: string[], setter: any, v: string) =>
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const generateBio = async () => {
    if (!city.trim()) { setErr("Enter your city first"); return; }
    setErr(null); setAiLoading(true);
    try {
      await fetchApi("/profile/musician", {
        method: "POST",
        body: JSON.stringify({ city, genres, instruments: instr,
          experience_years: parseInt(exp || "0"), pricing_per_hour: parseInt(price || "0") }),
      });
      const r: any = await fetchApi("/ai/bio", { method: "POST", body: JSON.stringify({ tone: "professional" }) });
      setBio(r.bio);
    } catch (e: any) { setErr(e.message); }
    finally { setAiLoading(false); }
  };

  const save = async () => {
    setErr(null);
    if (!city.trim()) { setErr("Enter your city"); return; }
    if (isMusician && genres.length === 0) { setErr("Select at least one genre"); return; }
    if (isMusician && instr.length === 0) { setErr("Select at least one instrument"); return; }
    if (isOrganizer && !orgName.trim()) { setErr("Enter organization name"); return; }
    setSaving(true);
    try {
      if (isMusician) {
        await fetchApi("/profile/musician", {
          method: "POST",
          body: JSON.stringify({
            bio, city, genres, instruments: instr, languages: ["English"],
            experience_years: parseInt(exp || "0"), pricing_per_hour: parseInt(price || "0"),
          }),
        });
      }
      if (isOrganizer) {
        await fetchApi("/profile/organizer", {
          method: "POST",
          body: JSON.stringify({ org_name: orgName || (user?.full_name || "My Organization"), city, bio }),
        });
      }
      // set active role explicitly
      const active = isMusician ? "musician" : "organizer";
      await fetchApi("/auth/active-role", { method: "POST", body: JSON.stringify({ active_role: active }) });
      await refreshUser();
      // AuthGate routes to /(tabs)
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.bg}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.sub}>A few details to get you started on StageLink.</Text>

          {isOrganizer && (
            <>
              <Text style={styles.label}>Organization name</Text>
              <TextInput testID="onboard-org-input" style={styles.input} value={orgName} onChangeText={setOrgName} placeholder="Nova Events" placeholderTextColor={theme.textDim} />
            </>
          )}

          <Text style={styles.label}>City</Text>
          <TextInput testID="onboard-city-input" style={styles.input} value={city} onChangeText={setCity} placeholder="Mumbai" placeholderTextColor={theme.textDim} />

          {isMusician && (
            <>
              <Text style={styles.label}>Years of experience</Text>
              <TextInput testID="onboard-exp-input" style={styles.input} value={exp} onChangeText={setExp} keyboardType="number-pad" placeholder="5" placeholderTextColor={theme.textDim} />

              <Text style={styles.label}>Hourly rate (INR)</Text>
              <TextInput testID="onboard-price-input" style={styles.input} value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="5000" placeholderTextColor={theme.textDim} />

              <Text style={styles.label}>Genres</Text>
              <View style={styles.chipRow}>
                {GENRES.map(g => {
                  const on = genres.includes(g);
                  return (
                    <Pressable key={g} testID={`chip-genre-${g}`} onPress={() => toggle(genres, setGenres, g)} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{g}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Instruments</Text>
              <View style={styles.chipRow}>
                {INSTRUMENTS.map(g => {
                  const on = instr.includes(g);
                  return (
                    <Pressable key={g} testID={`chip-instr-${g}`} onPress={() => toggle(instr, setInstr, g)} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{g}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <Text style={styles.label}>Bio</Text>
            {isMusician && (
              <Pressable testID="ai-bio-btn" onPress={generateBio} disabled={aiLoading} style={styles.aiBtn}>
                {aiLoading ? <ActivityIndicator color={theme.brand} size="small" /> : <Ionicons name="sparkles" size={14} color={theme.brand} />}
                <Text style={styles.aiBtnTxt}>{aiLoading ? "Writing…" : "AI generate"}</Text>
              </Pressable>
            )}
          </View>
          <TextInput testID="onboard-bio-input" style={[styles.input, { height: 120, textAlignVertical: "top", paddingTop: 12 }]} value={bio} onChangeText={setBio} multiline placeholder="Tell us your story…" placeholderTextColor={theme.textDim} />

          {err && <Text style={styles.err} testID="onboard-error">{err}</Text>}

          <Pressable testID="onboard-save-btn" onPress={save} disabled={saving} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Continue</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  title: { color: theme.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: theme.textDim, fontSize: 14, marginTop: 6, marginBottom: 20 },
  label: { color: theme.textMid, fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, color: theme.text, fontSize: 15 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  chipOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  chipTxt: { color: theme.textDim, fontSize: 13, fontWeight: "500" },
  chipTxtOn: { color: theme.text, fontWeight: "600" },
  aiBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand },
  aiBtnTxt: { color: theme.brand, fontWeight: "600", fontSize: 12 },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, marginTop: 28, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  err: { color: theme.error, marginTop: 12, fontSize: 13 },
});
