import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { MediaPickerSheet, PickedMedia } from "@/src/components/MediaPickerSheet";

type Action =
  | "post" | "hiring" | "band" | "equipment_rent" | "equipment_sale"
  | "studio" | "lesson" | "event";

const ACTIONS: { key: Action; label: string; desc: string; icon: any }[] = [
  { key: "post", label: "Community post", desc: "Share a performance, thought, or update", icon: "megaphone" },
  { key: "hiring", label: "Post a hiring gig", desc: "Find musicians for your event", icon: "briefcase" },
  { key: "band", label: "Create a band", desc: "Assemble members and get booked together", icon: "people" },
  { key: "equipment_rent", label: "Rent out equipment", desc: "List your gear for daily rental", icon: "cube" },
  { key: "equipment_sale", label: "Sell equipment", desc: "List gear for sale", icon: "pricetags" },
  { key: "studio", label: "Add a studio", desc: "List your recording or rehearsal space", icon: "mic" },
  { key: "lesson", label: "Offer music lessons", desc: "Teach students online or in-person", icon: "school" },
];

export default function Create() {
  const { fetchApi } = useAuth();
  const [action, setAction] = useState<Action | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Shared form state
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Guitar");
  const [desc, setDesc] = useState("");
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const onPickedMedia = (items: PickedMedia[]) => {
    if (!items.length) return;
    setMediaUri(items[0].uri);
    setMediaType(items[0].type);
    Haptics.selectionAsync().catch(() => {});
  };

  const reset = () => {
    setText(""); setTitle(""); setCity(""); setPrice(""); setCategory("Guitar"); setDesc("");
    setMediaUri(null); setMediaType(null);
    setErr(null); setOk(null);
  };

  const submit = async () => {
    setErr(null); setOk(null);
    try {
      setSaving(true);
      if (action === "post") {
        if (!text.trim() && !mediaUri) throw new Error("Say something or add media");
        await fetchApi("/posts", { method: "POST", body: JSON.stringify({
          text, media_url: mediaUri || undefined, media_type: mediaType || undefined,
        })});
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setOk("Posted to community");
      } else if (action === "hiring") {
        router.push("/gig/new");
        setAction(null); return;
      } else if (action === "band") {
        if (!title.trim() || !city.trim()) throw new Error("Name and city required");
        await fetchApi("/bands", { method: "POST", body: JSON.stringify({
          name: title, city, description: desc, genres: [],
          cover_url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800",
        })});
        setOk("Band created");
      } else if (action === "equipment_rent" || action === "equipment_sale") {
        if (!title.trim() || !city.trim() || !price.trim()) throw new Error("Fill all fields");
        await fetchApi("/equipment", { method: "POST", body: JSON.stringify({
          title, listing_type: action === "equipment_rent" ? "rent" : "sale",
          category, city, price: parseInt(price), description: desc,
          cover_url: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800",
        })});
        setOk("Listing published");
      } else if (action === "studio") {
        if (!title.trim() || !city.trim() || !price.trim()) throw new Error("Fill all fields");
        await fetchApi("/studios", { method: "POST", body: JSON.stringify({
          name: title, city, hourly_rate: parseInt(price), description: desc,
          cover_url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800",
        })});
        setOk("Studio added");
      } else if (action === "lesson") {
        if (!title.trim() || !city.trim() || !price.trim()) throw new Error("Fill all fields");
        await fetchApi("/lessons", { method: "POST", body: JSON.stringify({
          title, subject: category, city, price_per_hour: parseInt(price), format: "both",
          description: desc,
          cover_url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800",
        })});
        setOk("Lesson listed");
      }
      setTimeout(() => { reset(); setAction(null); }, 900);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (!action) {
    return (
      <SafeAreaView style={styles.bg} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.h1}>Create</Text>
          <Text style={styles.sub}>What would you like to share?</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 130, gap: 10 }}>
          {ACTIONS.map(a => (
            <Pressable key={a.key} testID={`action-${a.key}`} onPress={() => setAction(a.key)}
                       style={({ pressed }) => [styles.actionCard, pressed && { transform: [{ scale: 0.99 }] }]}>
              <View style={styles.actionIcon}><Ionicons name={a.icon} size={20} color={theme.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>{a.label}</Text>
                <Text style={styles.actionDesc}>{a.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const a = ACTIONS.find(x => x.key === action)!;

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.subHeader}>
          <Pressable testID="create-back" onPress={() => { reset(); setAction(null); }} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <Text style={styles.subTitle}>{a.label}</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          {action === "post" && (
            <>
              <Text style={styles.label}>What's on your mind?</Text>
              <TextInput testID="post-text" style={[styles.input, { height: 120, textAlignVertical: "top", paddingTop: 12 }]}
                         value={text} onChangeText={setText} multiline
                         placeholder="Share a performance, insight, or moment…" placeholderTextColor={theme.textDim} />
              {mediaUri && (
                <View style={styles.mediaPreview}>
                  <Image source={{ uri: mediaUri }} style={styles.mediaImg} />
                  {mediaType === "video" && <View style={styles.mediaPlay}><Ionicons name="play" size={22} color="#fff" /></View>}
                  <Pressable testID="clear-post-media" onPress={() => { setMediaUri(null); setMediaType(null); }} style={styles.mediaX}>
                    <Ionicons name="close" size={18} color="#fff" />
                  </Pressable>
                </View>
              )}
              <Pressable testID="post-add-media" onPress={() => setShowPicker(true)} style={styles.addMediaBtn}>
                <Ionicons name="images" size={18} color={theme.brand} />
                <Text style={styles.addMediaTxt}>{mediaUri ? "Change media" : "Add photo or video"}</Text>
              </Pressable>
            </>
          )}
          {action === "band" && (
            <>
              <Text style={styles.label}>Band name</Text>
              <TextInput testID="band-name" style={styles.input} value={title} onChangeText={setTitle} placeholder="Midnight Kolaba" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>Home city</Text>
              <TextInput testID="band-city" style={styles.input} value={city} onChangeText={setCity} placeholder="Mumbai" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>Description</Text>
              <TextInput testID="band-desc" style={[styles.input, { height: 100, textAlignVertical: "top", paddingTop: 12 }]}
                         value={desc} onChangeText={setDesc} multiline placeholder="What's your sound?" placeholderTextColor={theme.textDim} />
            </>
          )}
          {(action === "equipment_rent" || action === "equipment_sale") && (
            <>
              <Text style={styles.label}>Title</Text>
              <TextInput testID="eq-title" style={styles.input} value={title} onChangeText={setTitle} placeholder="Fender Stratocaster (2019)" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {["Guitar", "Bass", "Keys", "Drums", "Mic", "DJ", "Amp", "Mixer"].map(c => (
                  <Pressable key={c} testID={`eq-cat-${c}`} onPress={() => setCategory(c)} style={[styles.pill, category === c && styles.pillOn]}>
                    <Text style={[styles.pillTxt, category === c && styles.pillTxtOn]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.label}>City</Text>
              <TextInput testID="eq-city" style={styles.input} value={city} onChangeText={setCity} placeholder="Mumbai" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>Price (INR) {action === "equipment_rent" ? "/ day" : ""}</Text>
              <TextInput testID="eq-price" style={styles.input} value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="5000" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>Description</Text>
              <TextInput testID="eq-desc" style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
                         value={desc} onChangeText={setDesc} multiline placeholder="Condition, accessories, etc." placeholderTextColor={theme.textDim} />
            </>
          )}
          {action === "studio" && (
            <>
              <Text style={styles.label}>Studio name</Text>
              <TextInput testID="studio-name" style={styles.input} value={title} onChangeText={setTitle} placeholder="Loft Studios" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>City</Text>
              <TextInput testID="studio-city" style={styles.input} value={city} onChangeText={setCity} placeholder="Mumbai" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>Hourly rate (INR)</Text>
              <TextInput testID="studio-price" style={styles.input} value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="1500" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>Description</Text>
              <TextInput testID="studio-desc" style={[styles.input, { height: 100, textAlignVertical: "top", paddingTop: 12 }]}
                         value={desc} onChangeText={setDesc} multiline placeholder="Rooms, gear, vibe" placeholderTextColor={theme.textDim} />
            </>
          )}
          {action === "lesson" && (
            <>
              <Text style={styles.label}>Lesson title</Text>
              <TextInput testID="lesson-title" style={styles.input} value={title} onChangeText={setTitle} placeholder="Contemporary Guitar 101" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>Subject</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {["Vocals", "Guitar", "Piano", "Drums", "Bass", "Theory", "Production"].map(c => (
                  <Pressable key={c} testID={`lesson-subj-${c}`} onPress={() => setCategory(c)} style={[styles.pill, category === c && styles.pillOn]}>
                    <Text style={[styles.pillTxt, category === c && styles.pillTxtOn]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.label}>City</Text>
              <TextInput testID="lesson-city" style={styles.input} value={city} onChangeText={setCity} placeholder="Mumbai" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>Price / hour (INR)</Text>
              <TextInput testID="lesson-price" style={styles.input} value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="900" placeholderTextColor={theme.textDim} />
              <Text style={styles.label}>Description</Text>
              <TextInput testID="lesson-desc" style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
                         value={desc} onChangeText={setDesc} multiline placeholder="What will students learn?" placeholderTextColor={theme.textDim} />
            </>
          )}

          {err && <Text style={styles.err} testID="create-error">{err}</Text>}
          {ok && <Text style={styles.ok} testID="create-ok">{ok}</Text>}

          <Pressable testID="create-submit" onPress={submit} disabled={saving} style={styles.cta}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Publish</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <MediaPickerSheet
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onPicked={onPickedMedia}
        allowVideo={action === "post"}
        allowsMultiple={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  h1: { ...type.h1, color: theme.text },
  sub: { ...type.bodySm, color: theme.textDim, marginTop: 6 },
  subHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  subTitle: { ...type.titleMd, color: theme.text, fontWeight: "700" },
  actionCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.border },
  actionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center" },
  actionTitle: { ...type.bodyMd, color: theme.text, fontWeight: "700" },
  actionDesc: { ...type.caption, color: theme.textDim, marginTop: 3 },
  label: { ...type.label, color: theme.textMid, marginTop: 14, marginBottom: 6 },
  input: { ...type.bodySm, backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, color: theme.text },
  pillRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  pill: { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  pillOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  pillTxt: { ...type.caption, color: theme.textDim, fontWeight: "600" },
  pillTxtOn: { ...type.caption, color: theme.text, fontWeight: "700" },
  err: { ...type.caption, color: theme.error, marginTop: 12 },
  ok: { ...type.caption, color: theme.success, marginTop: 12 },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  ctaTxt: { ...type.titleMd, color: "#fff", fontWeight: "700" },
  mediaPreview: { marginTop: 12, borderRadius: theme.radius.md, overflow: "hidden", position: "relative" },
  mediaImg: { width: "100%", height: 220, backgroundColor: theme.bg3 },
  mediaX: { position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  mediaPlay: { position: "absolute", top: "45%", left: "45%", width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  addMediaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.brand, backgroundColor: theme.brandTint },
  addMediaTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },
});
