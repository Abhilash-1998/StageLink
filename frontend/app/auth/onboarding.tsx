import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { CITIES as FALLBACK_CITIES, DEFAULT_CITY, INTERESTS as FALLBACK_INTERESTS } from "@/src/data/options";

type OnboardingConfig = {
  cities: string[];
  default_city: string;
  city_note: string;
  interests_prompt: string;
  interests: string[];
};

const FALLBACK_CONFIG: OnboardingConfig = {
  cities: [...FALLBACK_CITIES],
  default_city: DEFAULT_CITY,
  city_note: "gigZee is live in Hyderabad for now. More cities soon.",
  interests_prompt: "What brings you to gigZee?",
  interests: [...FALLBACK_INTERESTS],
};

// Single, welcoming profile builder. No role gate — action-based model means
// users pick what they want to do later from the Create tab.
export default function Onboarding() {
  const { user, fetchApi, refreshUser } = useAuth();
  const [config, setConfig] = useState<OnboardingConfig | null>(null);
  const [city, setCity] = useState(DEFAULT_CITY);
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCfg(true);
      try {
        const r = await fetchApi<OnboardingConfig>("/config/onboarding");
        if (cancelled) return;
        const next: OnboardingConfig = {
          cities: Array.isArray(r?.cities) && r.cities.length ? r.cities : FALLBACK_CONFIG.cities,
          default_city: r?.default_city || FALLBACK_CONFIG.default_city,
          city_note: r?.city_note || FALLBACK_CONFIG.city_note,
          interests_prompt: r?.interests_prompt || FALLBACK_CONFIG.interests_prompt,
          interests: Array.isArray(r?.interests) && r.interests.length ? r.interests : FALLBACK_CONFIG.interests,
        };
        if (!next.cities.includes(next.default_city)) next.default_city = next.cities[0];
        setConfig(next);
        setCity(next.default_city);
      } catch {
        if (!cancelled) {
          setConfig(FALLBACK_CONFIG);
          setCity(FALLBACK_CONFIG.default_city);
        }
      } finally {
        if (!cancelled) setLoadingCfg(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchApi]);

  const toggleInt = (v: string) =>
    setInterests(interests.includes(v) ? interests.filter(x => x !== v) : [...interests, v]);

  const save = async () => {
    setErr(null);
    if (!city.trim()) { setErr("Pick your city"); return; }
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
          bio, city, interests, genres: [], instruments: [], languages: ["English"],
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

  const cfg = config || FALLBACK_CONFIG;

  return (
    <SafeAreaView style={styles.bg}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Welcome, {user?.full_name?.split(" ")[0]}</Text>
          <Text style={styles.sub}>A few quick details. You can add gigs, gear, and more from the Create tab anytime.</Text>

          {loadingCfg ? (
            <ActivityIndicator color={theme.brand} style={{ marginTop: 24 }} />
          ) : (
            <>
              <Text style={styles.label}>City</Text>
              <View style={styles.chipWrap}>
                {cfg.cities.map(c => {
                  const on = city === c;
                  return (
                    <Pressable
                      key={c}
                      testID={`city-${c}`}
                      onPress={() => setCity(c)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {!!cfg.city_note && <Text style={styles.cityNote}>{cfg.city_note}</Text>}

              <Text style={styles.label}>{cfg.interests_prompt}</Text>
              <View style={styles.chipWrap}>
                {cfg.interests.map(x => {
                  const on = interests.includes(x);
                  return (
                    <Pressable key={x} testID={`int-${x}`} onPress={() => toggleInt(x)} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{x}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Short bio (optional)</Text>
              <TextInput
                testID="onboard-bio-input"
                style={[styles.input, { height: 110, textAlignVertical: "top", paddingTop: 12 }]}
                value={bio} onChangeText={setBio} multiline
                placeholder="Tell the community what you do…" placeholderTextColor={theme.textDim}
              />

              {err && <Text style={styles.err} testID="onboard-error">{err}</Text>}

              <Pressable testID="onboard-save-btn" onPress={save} disabled={saving} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Enter gigZee</Text>}
              </Pressable>
            </>
          )}
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
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: { flexShrink: 0, paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  chipOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  chipTxt: { ...type.label, color: theme.textDim, fontWeight: "500" },
  chipTxtOn: { ...type.label, color: theme.text },
  cityNote: { ...type.caption, color: theme.textDim, marginTop: 8 },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, marginTop: 28, alignItems: "center" },
  ctaText: { ...type.titleLg, color: "#fff" },
  err: { ...type.caption, color: theme.error, marginTop: 12 },
});
