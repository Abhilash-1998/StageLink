import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

const GENRES = ["Jazz", "Pop", "Rock", "Indie", "EDM", "Classical", "Fusion", "R&B", "Soul"];
const INSTRS = ["Vocals", "Guitar", "Keyboard", "Violin", "Drums", "DJ Deck"];
const TYPES = ["wedding", "corporate", "club", "festival", "private"];

const COVERS = [
  "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800",
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800",
  "https://images.unsplash.com/photo-1519741497674-611481863552?w=800",
];

export default function NewGig() {
  const { fetchApi } = useAuth();
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState("club");
  const [genre, setGenre] = useState("Jazz");
  const [instr, setInstr] = useState("Vocals");
  const [budget, setBudget] = useState("");
  const [desc, setDesc] = useState("");
  const [cover, setCover] = useState(COVERS[0]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!title.trim() || !city.trim() || !date.trim() || !budget.trim() || !desc.trim()) {
      setErr("Please fill all required fields"); return;
    }
    setLoading(true);
    try {
      const g: any = await fetchApi("/gigs", {
        method: "POST", body: JSON.stringify({
          title, city, date, event_type: type, genre, instrument_needed: instr,
          budget: parseInt(budget), description: desc, cover_url: cover,
        }),
      });
      router.replace(`/gig/${g.id}`);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.bg}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="back-btn" onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={theme.text} /></Pressable>
          <Text style={styles.h1}>New Gig</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Title</Text>
          <TextInput testID="new-title" style={styles.input} value={title} onChangeText={setTitle} placeholder="Rooftop Jazz Night" placeholderTextColor={theme.textDim} />
          <Text style={styles.label}>City</Text>
          <TextInput testID="new-city" style={styles.input} value={city} onChangeText={setCity} placeholder="Mumbai" placeholderTextColor={theme.textDim} />
          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput testID="new-date" style={styles.input} value={date} onChangeText={setDate} placeholder="2026-06-15" placeholderTextColor={theme.textDim} />
          <Text style={styles.label}>Event type</Text>
          <View style={styles.chipRow}>{TYPES.map(t => (
            <Pressable key={t} testID={`type-${t}`} onPress={() => setType(t)} style={[styles.chip, type === t && styles.chipOn]}><Text style={[styles.chipTxt, type === t && styles.chipTxtOn]}>{t}</Text></Pressable>
          ))}</View>
          <Text style={styles.label}>Genre</Text>
          <View style={styles.chipRow}>{GENRES.map(g => (
            <Pressable key={g} onPress={() => setGenre(g)} style={[styles.chip, genre === g && styles.chipOn]}><Text style={[styles.chipTxt, genre === g && styles.chipTxtOn]}>{g}</Text></Pressable>
          ))}</View>
          <Text style={styles.label}>Instrument needed</Text>
          <View style={styles.chipRow}>{INSTRS.map(i => (
            <Pressable key={i} onPress={() => setInstr(i)} style={[styles.chip, instr === i && styles.chipOn]}><Text style={[styles.chipTxt, instr === i && styles.chipTxtOn]}>{i}</Text></Pressable>
          ))}</View>
          <Text style={styles.label}>Budget (INR)</Text>
          <TextInput testID="new-budget" style={styles.input} value={budget} onChangeText={setBudget} keyboardType="number-pad" placeholder="15000" placeholderTextColor={theme.textDim} />
          <Text style={styles.label}>Description</Text>
          <TextInput testID="new-desc" style={[styles.input, { height: 100, textAlignVertical: "top" }]} value={desc} onChangeText={setDesc} multiline placeholder="What's the vibe?" placeholderTextColor={theme.textDim} />

          <Text style={styles.label}>Cover image</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {COVERS.map(c => (
              <Pressable key={c} onPress={() => setCover(c)}>
                <View style={[styles.coverThumb, cover === c && { borderColor: theme.brand }]}>
                  <View style={{ backgroundColor: "#333", flex: 1, borderRadius: 10 }} />
                </View>
              </Pressable>
            ))}
          </ScrollView>

          {err && <Text style={styles.err}>{err}</Text>}
          <Pressable testID="new-submit" onPress={submit} disabled={loading} style={styles.cta}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Publish Gig</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  h1: { color: theme.text, fontSize: 18, fontWeight: "700" },
  label: { color: theme.textMid, fontSize: 13, fontWeight: "600", marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, color: theme.text, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  chipOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  chipTxt: { color: theme.textDim, fontSize: 12, fontWeight: "500", textTransform: "capitalize" },
  chipTxtOn: { color: theme.text, fontWeight: "700" },
  coverThumb: { width: 90, height: 60, borderRadius: 12, borderWidth: 2, borderColor: theme.border, padding: 2 },
  err: { color: theme.error, marginTop: 12 },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  ctaTxt: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
