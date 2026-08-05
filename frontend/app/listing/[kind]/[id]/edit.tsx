import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { MediaPickerSheet, PickedMedia } from "@/src/components/MediaPickerSheet";
import { EQUIPMENT_CATEGORIES, LESSON_SUBJECTS, DEFAULT_CITY } from "@/src/data/options";
import { DEFAULT_COVERS } from "@/src/utils/covers";

type ListingKind = "band" | "equipment" | "studio" | "lesson";

const ENDPOINTS: Record<ListingKind, string> = {
  band: "/bands",
  equipment: "/equipment",
  studio: "/studios",
  lesson: "/lessons",
};

const TITLES: Record<ListingKind, string> = {
  band: "Edit band",
  equipment: "Edit equipment",
  studio: "Edit studio",
  lesson: "Edit lesson",
};

const MAX_IMAGES = 3;

/** User-uploaded photos only — skip generic Unsplash covers. */
function collectUserImages(item: any): string[] {
  const out: string[] = [];
  const isGeneric = (u: string) =>
    u.includes("images.unsplash.com") ||
    Object.values(DEFAULT_COVERS).includes(u);

  const push = (u?: string | null) => {
    if (!u || typeof u !== "string") return;
    const s = u.trim();
    if (!s || isGeneric(s) || out.includes(s)) return;
    out.push(s);
  };

  if (Array.isArray(item?.images)) {
    for (const u of item.images) push(u);
  }
  // Older listings often stored the upload only on cover_url
  push(item?.cover_url);
  return out.slice(0, MAX_IMAGES);
}

export default function EditListing() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { user, fetchApi } = useAuth();
  const listingKind = (kind || "") as ListingKind;
  const endpoint = ENDPOINTS[listingKind];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Guitar");
  const [mapsUrl, setMapsUrl] = useState("");
  const [listingType, setListingType] = useState<"rent" | "sale">("rent");
  const [format, setFormat] = useState<"online" | "in-person" | "both">("both");
  const [images, setImages] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !endpoint) {
      setErr("Invalid listing");
      setLoading(false);
      return;
    }
    try {
      const res: any = await fetchApi(`${endpoint}/${id}`);
      const item = res?.item || res;
      if (!item?.id) throw new Error("Not found");
      const ownerId = item.owner_id || item.teacher_id;
      if (user?.id && ownerId && user.id !== ownerId) {
        throw new Error("You can only edit your own listings");
      }
      if (listingKind === "band") {
        setTitle(item.name || "");
        setDesc(item.description || "");
        setCoverUrl(item.cover_url || null);
      } else if (listingKind === "equipment") {
        setTitle(item.title || "");
        setDesc(item.description || "");
        setPrice(item.price != null ? String(item.price) : "");
        setCategory(item.category || "Guitar");
        setListingType(item.listing_type === "sale" ? "sale" : "rent");
        const photos = collectUserImages(item);
        setImages(photos);
        setCoverUrl(photos[0] || item.cover_url || null);
      } else if (listingKind === "studio") {
        setTitle(item.name || "");
        setDesc(item.description || "");
        setPrice(item.hourly_rate != null ? String(item.hourly_rate) : "");
        setMapsUrl(item.maps_url || "");
        const photos = collectUserImages(item);
        setImages(photos);
        setCoverUrl(photos[0] || item.cover_url || null);
      } else if (listingKind === "lesson") {
        setTitle(item.title || "");
        setDesc(item.description || "");
        setPrice(item.price_per_hour != null ? String(item.price_per_hour) : "");
        setCategory(item.subject || LESSON_SUBJECTS[0] || "Guitar");
        setFormat(item.format || "both");
        setCoverUrl(item.cover_url || null);
      }
    } catch (e: any) {
      setErr(e?.message || "Could not load listing");
    } finally {
      setLoading(false);
    }
  }, [id, endpoint, fetchApi, listingKind, user?.id]);

  useEffect(() => { load(); }, [load]);

  const onPicked = (items: PickedMedia[]) => {
    const photos = items.filter((i) => i.type === "image").map((i) => i.uri);
    if (!photos.length) return;
    setImages((prev) => [...prev, ...photos].slice(0, MAX_IMAGES));
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setErr(null);
    try {
      setSaving(true);
      let body: any;
      if (listingKind === "band") {
        if (!title.trim()) throw new Error("Band name required");
        body = {
          name: title.trim(),
          city: DEFAULT_CITY,
          description: desc,
          genres: [],
          looking_for: [],
          cover_url: coverUrl || undefined,
        };
      } else if (listingKind === "equipment") {
        if (!title.trim() || !price.trim()) throw new Error("Title and price required");
        const photos = images.slice(0, MAX_IMAGES);
        if (photos.length < 1) throw new Error("Add at least one photo");
        body = {
          title: title.trim(),
          listing_type: listingType,
          category,
          city: DEFAULT_CITY,
          price: parseInt(price, 10) || 0,
          description: desc,
          images: photos,
          cover_url: photos[0],
        };
      } else if (listingKind === "studio") {
        if (!title.trim() || !price.trim()) throw new Error("Name and hourly rate required");
        const photos = images.slice(0, MAX_IMAGES);
        if (photos.length < 1) throw new Error("Add at least one photo");
        body = {
          name: title.trim(),
          city: DEFAULT_CITY,
          hourly_rate: parseInt(price, 10) || 0,
          description: desc,
          maps_url: mapsUrl.trim() || null,
          images: photos,
          cover_url: photos[0],
        };
      } else if (listingKind === "lesson") {
        if (!title.trim() || !price.trim()) throw new Error("Title and price required");
        body = {
          title: title.trim(),
          subject: category,
          city: DEFAULT_CITY,
          price_per_hour: parseInt(price, 10) || 0,
          format,
          description: desc,
          cover_url: coverUrl || undefined,
        };
      } else {
        throw new Error("Unsupported listing type");
      }

      await fetchApi(`${endpoint}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e: any) {
      setErr(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (!endpoint) {
    return (
      <SafeAreaView style={styles.bg} edges={["top"]}>
        <View style={styles.center}><Text style={styles.err}>Unsupported listing</Text></View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.bg} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      </SafeAreaView>
    );
  }

  const photoSlotsLeft = Math.max(0, MAX_IMAGES - images.length);
  const showPhotos = listingKind === "equipment" || listingKind === "studio";

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="edit-listing-back" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>{TITLES[listingKind]}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {showPhotos && (
            <>
              <Text style={styles.label}>Photos ({images.length}/{MAX_IMAGES})</Text>
              <Text style={[styles.label, { marginTop: 0, marginBottom: 8, color: theme.textDim, fontWeight: "500" }]}>
                Required — at least 1 photo
              </Text>
              <View style={styles.eqGrid}>
                {images.map((uri, idx) => (
                  <View key={`${idx}-${uri.slice(0, 24)}`} style={styles.eqThumbWrap}>
                    <Image source={{ uri }} style={styles.eqThumb} />
                    {idx === 0 && (
                      <View style={styles.eqCoverBadge}><Text style={styles.eqCoverTxt}>Cover</Text></View>
                    )}
                    <Pressable testID={`edit-img-remove-${idx}`} onPress={() => removeImage(idx)} style={styles.eqThumbX}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {photoSlotsLeft > 0 && (
                  <Pressable testID="edit-add-photos" onPress={() => setShowPicker(true)} style={styles.eqAddTile}>
                    <Ionicons name="camera" size={22} color={theme.brand} />
                    <Text style={styles.eqAddTxt}>Add</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}

          <Text style={styles.label}>
            {listingKind === "band" || listingKind === "studio" ? "Name" : "Title"}
          </Text>
          <TextInput
            testID="edit-title"
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholderTextColor={theme.textDim}
          />

          {listingKind === "equipment" && (
            <>
              <Text style={styles.label}>Type</Text>
              <View style={styles.pillRow}>
                {(["rent", "sale"] as const).map((t) => (
                  <Pressable key={t} onPress={() => setListingType(t)} style={[styles.pill, listingType === t && styles.pillOn]}>
                    <Text style={[styles.pillTxt, listingType === t && styles.pillTxtOn]}>{t === "rent" ? "Rent" : "Sale"}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {EQUIPMENT_CATEGORIES.map((c) => (
                  <Pressable key={c} onPress={() => setCategory(c)} style={[styles.pill, category === c && styles.pillOn]}>
                    <Text style={[styles.pillTxt, category === c && styles.pillTxtOn]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {listingKind === "lesson" && (
            <>
              <Text style={styles.label}>Subject</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
                {LESSON_SUBJECTS.map((c) => (
                  <Pressable key={c} onPress={() => setCategory(c)} style={[styles.pill, category === c && styles.pillOn]}>
                    <Text style={[styles.pillTxt, category === c && styles.pillTxtOn]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.label}>Format</Text>
              <View style={styles.pillRow}>
                {(["online", "in-person", "both"] as const).map((f) => (
                  <Pressable key={f} onPress={() => setFormat(f)} style={[styles.pill, format === f && styles.pillOn]}>
                    <Text style={[styles.pillTxt, format === f && styles.pillTxtOn]}>{f}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {listingKind !== "band" && (
            <>
              <Text style={styles.label}>
                {listingKind === "equipment"
                  ? `Price (INR)${listingType === "rent" ? " / day" : ""}`
                  : listingKind === "studio"
                    ? "Hourly rate (INR)"
                    : "Price / hour (INR)"}
              </Text>
              <TextInput
                testID="edit-price"
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="number-pad"
                placeholderTextColor={theme.textDim}
              />
            </>
          )}

          {listingKind === "studio" && (
            <>
              <Text style={styles.label}>Maps link</Text>
              <TextInput
                testID="edit-maps"
                style={styles.input}
                value={mapsUrl}
                onChangeText={setMapsUrl}
                placeholder="https://maps.google.com/…"
                placeholderTextColor={theme.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </>
          )}

          <Text style={styles.label}>City</Text>
          <View style={[styles.input, { justifyContent: "center" }]}>
            <Text style={{ ...type.bodySm, color: theme.text }}>{DEFAULT_CITY}</Text>
          </View>

          <Text style={styles.label}>Description</Text>
          <TextInput
            testID="edit-desc"
            style={[styles.input, { height: 100, textAlignVertical: "top", paddingTop: 12 }]}
            value={desc}
            onChangeText={setDesc}
            multiline
            placeholderTextColor={theme.textDim}
          />

          {err && <Text style={styles.err} testID="edit-listing-error">{err}</Text>}

          <Pressable testID="edit-listing-save" onPress={save} disabled={saving} style={styles.cta}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Save changes</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <MediaPickerSheet
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onPicked={onPicked}
        allowVideo={false}
        allowImage
        allowsMultiple
        selectionLimit={Math.max(1, photoSlotsLeft)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { ...type.titleLg, color: theme.text, flex: 1, textAlign: "center", fontWeight: "800" },
  label: { ...type.caption, color: theme.textMid, fontWeight: "600", marginBottom: 6, marginTop: 14 },
  input: {
    ...type.bodySm, backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, color: theme.text,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill,
    backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border,
  },
  pillOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  pillTxt: { ...type.caption, color: theme.textDim, fontWeight: "600" },
  pillTxtOn: { color: theme.brand, fontWeight: "700" },
  eqGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  eqThumbWrap: { width: 96, height: 96, borderRadius: theme.radius.md, overflow: "hidden", position: "relative", backgroundColor: theme.bg3 },
  eqThumb: { width: "100%", height: "100%" },
  eqCoverBadge: {
    position: "absolute", left: 6, bottom: 6, backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  eqCoverTxt: { ...type.tiny, color: "#fff", fontWeight: "700" },
  eqThumbX: {
    position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center",
  },
  eqAddTile: {
    width: 96, height: 96, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border,
    borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: theme.bg2,
  },
  eqAddTxt: { ...type.tiny, color: theme.brand, fontWeight: "700" },
  err: { ...type.caption, color: theme.error, marginTop: 12 },
  cta: {
    marginTop: 24, backgroundColor: theme.brand, borderRadius: theme.radius.pill,
    paddingVertical: 16, alignItems: "center",
  },
  ctaTxt: { ...type.titleMd, color: "#fff", fontWeight: "700" },
});
