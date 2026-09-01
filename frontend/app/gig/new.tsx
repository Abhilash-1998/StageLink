import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { GENRES, INSTRUMENTS as INSTRS, EVENT_TYPES as TYPES, DEFAULT_CITY } from "@/src/data/options";
import { DatePickerField } from "@/src/components/DatePickerField";
import { MediaPickerSheet, PickedMedia } from "@/src/components/MediaPickerSheet";

export default function NewGig() {
  const { fetchApi } = useAuth();
  const [title, setTitle] = useState("");
  const city = DEFAULT_CITY;
  const [date, setDate] = useState<string | null>(null); // YYYY-MM-DD
  const [type, setType] = useState("club");
  const [genre, setGenre] = useState("Jazz");
  const [instr, setInstr] = useState("Vocals");
  const [budget, setBudget] = useState("");
  const [desc, setDesc] = useState("");
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!title.trim() || !city.trim() || !date || !budget.trim() || !desc.trim()) {
      setErr("Please fill all required fields"); return;
    }
    if (!coverUri) {
      setErr("Add a cover photo"); return;
    }
    setLoading(true);
    try {
      const g: any = await fetchApi("/gigs", {
        method: "POST", body: JSON.stringify({
          title, city, date, event_type: type, genre, instrument_needed: instr,
          budget: parseInt(budget), description: desc, cover_url: coverUri,
        }),
      });
      router.replace(`/gig/${g.id}`);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <SafeAreaView style={styles.bg}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="back-btn" onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={theme.text} /></Pressable>
          <Text style={styles.h1}>New Gig</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Cover photo</Text>
          <Text style={styles.hint}>Required — this is what people see in Discover.</Text>
          {coverUri ? (
            <View style={styles.coverWrap}>
              <Image source={{ uri: coverUri }} style={styles.coverImg} />
              <Pressable testID="gig-clear-cover" onPress={() => setCoverUri(null)} style={styles.coverX}>
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <Pressable testID="gig-add-cover" onPress={() => setShowPicker(true)} style={styles.addCover}>
              <Ionicons name="camera" size={22} color={theme.brand} />
              <Text style={styles.addCoverTxt}>Add cover</Text>
            </Pressable>
          )}
          <Text style={styles.label}>Title</Text>
          <TextInput testID="new-title" style={styles.input} value={title} onChangeText={setTitle} placeholder="Rooftop Jazz Night" placeholderTextColor={theme.textDim} />
          <Text style={styles.label}>City</Text>
          <View style={[styles.input, { justifyContent: "center" }]}>
            <Text style={{ ...type.bodySm, color: theme.text }}>{city}</Text>
          </View>
          <Text style={styles.label}>Date</Text>
          <DatePickerField
            testID="new-date"
            value={date}
            onChange={setDate}
            placeholder="Pick gig date"
            minimumDate={today}
          />
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

          {err && <Text style={styles.err}>{err}</Text>}
          <Pressable testID="new-submit" onPress={submit} disabled={loading} style={styles.cta}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Publish Gig</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      <MediaPickerSheet
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onPicked={(items: PickedMedia[]) => {
          const photo = items.find((i) => i.type === "image");
          if (photo) setCoverUri(photo.uri);
        }}
        allowVideo={false}
        allowImage
        allowsMultiple={false}
        selectionLimit={1}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  h1: { ...type.titleLg, color: theme.text, fontWeight: "700" },
  label: { ...type.label, color: theme.textMid, marginTop: 16, marginBottom: 6 },
  input: { ...type.bodySm, backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, color: theme.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  chipOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  chipTxt: { ...type.caption, color: theme.textDim, fontWeight: "500", textTransform: "capitalize" },
  chipTxtOn: { ...type.caption, color: theme.text, fontWeight: "700", textTransform: "capitalize" },
  err: { ...type.caption, color: theme.error, marginTop: 12 },
  hint: { ...type.caption, color: theme.textDim, marginBottom: 8 },
  coverWrap: { height: 160, borderRadius: theme.radius.md, overflow: "hidden", backgroundColor: theme.bg3, position: "relative" },
  coverImg: { width: "100%", height: "100%" },
  coverX: { position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" },
  addCover: {
    height: 120, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.brand, borderStyle: "dashed",
    backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center", gap: 6,
  },
  addCoverTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  ctaTxt: { ...type.titleMd, color: "#fff", fontWeight: "700" },
});
