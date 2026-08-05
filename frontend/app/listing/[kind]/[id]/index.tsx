import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Pressable, ActivityIndicator, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { EntityCover } from "@/src/components/EntityCover";
import { CoverKind } from "@/src/utils/covers";
import { openPhoneCall } from "@/src/utils/phone";

type ListingKind = "band" | "equipment" | "studio" | "lesson" | "venue";

const CONFIG: Record<ListingKind, {
  endpoint: string;
  cover: CoverKind;
  ownerLabel: string;
  tag?: (item: any) => string | null;
  title: (item: any) => string;
  price?: (item: any) => { value: string; label: string } | null;
  metas: (item: any) => { icon: any; label: string; value: string }[];
}> = {
  band: {
    endpoint: "/bands",
    cover: "band",
    ownerLabel: "Owner",
    title: (i) => i.name || "Band",
    metas: (i) => [
      { icon: "location-outline", label: "City", value: i.city || "—" },
      { icon: "musical-notes-outline", label: "Genres", value: (i.genres || []).join(", ") || "—" },
      { icon: "people-outline", label: "Looking for", value: (i.looking_for || []).join(", ") || "Open" },
      { icon: "person-outline", label: "Members", value: String((i.members || []).length || 1) },
    ],
  },
  equipment: {
    endpoint: "/equipment",
    cover: "equipment",
    ownerLabel: "Listed by",
    tag: (i) => i.listing_type ? String(i.listing_type).toUpperCase() : null,
    title: (i) => i.title || "Equipment",
    price: (i) => typeof i.price === "number"
      ? { value: `₹${Number(i.price).toLocaleString("en-IN")}`, label: i.listing_type === "rent" ? "Per day" : "Sale price" }
      : null,
    metas: (i) => [
      { icon: "location-outline", label: "City", value: i.city || "—" },
      { icon: "cube-outline", label: "Category", value: i.category || "—" },
      { icon: "pricetag-outline", label: "Type", value: i.listing_type === "rent" ? "Rent" : "Sale" },
    ],
  },
  studio: {
    endpoint: "/studios",
    cover: "studio",
    ownerLabel: "Hosted by",
    title: (i) => i.name || "Studio",
    price: (i) => typeof i.hourly_rate === "number"
      ? { value: `₹${Number(i.hourly_rate).toLocaleString("en-IN")}`, label: "Per hour" }
      : null,
    metas: (i) => [
      { icon: "location-outline", label: "City", value: i.city || "—" },
    ],
  },
  lesson: {
    endpoint: "/lessons",
    cover: "lesson",
    ownerLabel: "Teacher",
    title: (i) => i.title || "Lesson",
    price: (i) => typeof i.price_per_hour === "number"
      ? { value: `₹${Number(i.price_per_hour).toLocaleString("en-IN")}`, label: "Per hour" }
      : null,
    metas: (i) => [
      { icon: "location-outline", label: "City", value: i.city || "—" },
      { icon: "school-outline", label: "Subject", value: i.subject || "—" },
      { icon: "laptop-outline", label: "Format", value: i.format || "—" },
    ],
  },
  venue: {
    endpoint: "/venues",
    cover: "venue",
    ownerLabel: "Managed by",
    title: (i) => i.name || "Venue",
    metas: (i) => [
      { icon: "location-outline", label: "City", value: i.city || "—" },
      { icon: "business-outline", label: "Type", value: i.type || "—" },
      { icon: "people-outline", label: "Capacity", value: i.capacity ? `${i.capacity} pax` : "—" },
      { icon: "star-outline", label: "Rating", value: i.rating ? String(i.rating) : "—" },
    ],
  },
};

export default function ListingDetail() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { user, fetchApi } = useAuth();
  const listingKind = (kind || "band") as ListingKind;
  const cfg = CONFIG[listingKind] || CONFIG.band;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !CONFIG[listingKind]) {
      setErr("Listing not found");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const res: any = await fetchApi(`${cfg.endpoint}/${id}`);
        // Support both shapes: { item, owner } (new) and raw document (older API)
        const normalized = res?.item
          ? res
          : res?.id
            ? { item: res, owner: null }
            : null;
        if (!normalized?.item) throw new Error("Not found");
        if (!cancelled) setData(normalized);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Could not load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, listingKind, cfg.endpoint, fetchApi]);

  const item = data?.item;
  const owner = data?.owner;
  const phone = data?.contact?.phone || null;
  const phoneHidden = !!data?.contact?.hide_contact;
  const ownerId = owner?.id || item?.owner_id || item?.teacher_id;
  const isOwn = !!user?.id && user.id === ownerId;

  const callOrganizer = () => {
    openPhoneCall(phone, { hidden: phoneHidden && !phone, label: "organizer" });
  };

  const gallery = useMemo(() => {
    const imgs = Array.isArray(item?.images) ? item.images.filter(Boolean) : [];
    if (imgs.length) return imgs;
    return item?.cover_url ? [item.cover_url] : [];
  }, [item]);

  if (loading) {
    return (
      <SafeAreaView style={styles.bg}>
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      </SafeAreaView>
    );
  }

  if (err || !item) {
    return (
      <SafeAreaView style={styles.bg} edges={["top"]}>
        <View style={styles.header}>
          <Pressable testID="listing-back" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
        </View>
        <View style={styles.center}><Text style={styles.err}>{err || "Not found"}</Text></View>
      </SafeAreaView>
    );
  }

  const tag = cfg.tag?.(item);
  const price = cfg.price?.(item);
  const metas = cfg.metas(item);

  return (
    <View style={styles.bg}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.heroWrap}>
          <EntityCover
            kind={cfg.cover}
            uri={item.cover_url}
            images={item.images}
            height={300}
            imageStyle={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
          >
            {tag ? <View style={styles.tag}><Text style={styles.tagTxt}>{tag}</Text></View> : null}
          </EntityCover>
          <SafeAreaView edges={["top"]} style={styles.heroNav}>
            <Pressable testID="listing-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={theme.text} />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{cfg.title(item)}</Text>
          {price && (
            <>
              <Text style={styles.price}>{price.value}</Text>
              <Text style={styles.priceLbl}>{price.label}</Text>
            </>
          )}

          <View style={styles.metaGrid}>
            {metas.map((m) => (
              <View key={m.label} style={styles.metaCard}>
                <Ionicons name={m.icon} size={18} color={theme.brand} />
                <Text style={styles.metaLbl}>{m.label}</Text>
                <Text style={styles.metaVal} numberOfLines={2}>{m.value}</Text>
              </View>
            ))}
          </View>

          {!!item.description && (
            <>
              <Text style={styles.sTitle}>About</Text>
              <Text style={styles.desc}>{item.description}</Text>
            </>
          )}

          {gallery.length > 1 && (
            <>
              <Text style={styles.sTitle}>Photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {gallery.map((uri: string, idx: number) => (
                  <Image key={`${idx}-${uri.slice(0, 20)}`} source={{ uri }} style={styles.galleryImg} />
                ))}
              </ScrollView>
            </>
          )}

          {listingKind === "studio" && !!item.maps_url && (
            <Pressable
              testID="listing-maps"
              onPress={() => Linking.openURL(item.maps_url).catch(() => {})}
              style={styles.mapsBtn}
            >
              <Ionicons name="navigate-outline" size={16} color={theme.brand} />
              <Text style={styles.mapsTxt}>Open in Maps</Text>
            </Pressable>
          )}

          {(owner || ownerId) && (
            <>
              <Text style={styles.sTitle}>{cfg.ownerLabel}</Text>
              <Pressable
                testID="listing-owner"
                onPress={() => ownerId && router.push(`/user/${ownerId}`)}
                style={styles.orgCard}
              >
                <View style={styles.orgAvatar}>
                  {owner?.avatar_url
                    ? <Image source={{ uri: owner.avatar_url }} style={styles.orgAvatarImg} />
                    : <Ionicons name="person" size={20} color={theme.brand} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orgName}>{owner?.full_name || "Organizer"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
              </Pressable>

              {!isOwn && (
                <View style={styles.contactRow}>
                  <Pressable
                    testID="listing-call"
                    onPress={callOrganizer}
                    style={styles.contactBtn}
                  >
                    <Ionicons name="call" size={16} color={theme.brand} />
                    <Text style={styles.contactBtnTxt}>Call organizer</Text>
                  </Pressable>
                  <Pressable
                    testID="listing-message"
                    onPress={() => ownerId && router.push(`/chat/${ownerId}`)}
                    style={[styles.contactBtn, styles.contactBtnPrimary]}
                  >
                    <Ionicons name="chatbubble" size={16} color="#fff" />
                    <Text style={styles.contactBtnTxtPrimary}>Message organizer</Text>
                  </Pressable>
                </View>
              )}

              {isOwn && listingKind !== "venue" && (
                <Pressable
                  testID="listing-edit"
                  onPress={() => router.push(`/listing/${listingKind}/${id}/edit`)}
                  style={[styles.contactBtn, styles.contactBtnPrimary, { marginTop: 12 }]}
                >
                  <Ionicons name="create-outline" size={16} color="#fff" />
                  <Text style={styles.contactBtnTxtPrimary}>Edit listing</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { paddingHorizontal: 12, paddingVertical: 8 },
  heroWrap: { position: "relative" },
  heroNav: { position: "absolute", top: 0, left: 0 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(9,9,11,0.7)",
    alignItems: "center", justifyContent: "center", marginLeft: 16, marginTop: 8,
  },
  tag: {
    position: "absolute", top: 16, right: 16,
    backgroundColor: "rgba(225,29,72,0.25)", borderColor: theme.brand, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill,
  },
  tagTxt: { ...type.tiny, color: theme.brand, fontWeight: "700", letterSpacing: 0.5 },
  body: { padding: 20 },
  title: { ...type.h1, color: theme.text },
  price: { ...type.priceLg, color: theme.text, marginTop: 10 },
  priceLbl: { ...type.caption, color: theme.textDim, marginTop: 2, marginBottom: 12 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  metaCard: {
    flexBasis: "47%", flexGrow: 1, backgroundColor: theme.bg2, borderRadius: theme.radius.md,
    padding: 14, borderWidth: 1, borderColor: theme.border,
  },
  metaLbl: { ...type.tiny, color: theme.textDim, marginTop: 8 },
  metaVal: { ...type.bodySm, color: theme.text, fontWeight: "700", marginTop: 2 },
  sTitle: { ...type.titleMd, color: theme.text, fontWeight: "700", marginTop: 24, marginBottom: 10 },
  desc: { ...type.bodySm, color: theme.textMid, lineHeight: 22 },
  galleryImg: { width: 120, height: 120, borderRadius: theme.radius.md, backgroundColor: theme.bg3 },
  mapsBtn: {
    marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: theme.radius.pill, backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand,
  },
  mapsTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },
  orgCard: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2,
    padding: 14, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border,
  },
  orgAvatar: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: theme.brandTint,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  orgAvatarImg: { width: "100%", height: "100%" },
  orgName: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  orgMeta: { ...type.caption, color: theme.textDim, marginTop: 2 },
  contactRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  contactBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: theme.radius.pill,
    backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand,
  },
  contactBtnPrimary: { backgroundColor: theme.brand, borderColor: theme.brand },
  contactBtnDisabled: { borderColor: theme.border, backgroundColor: theme.bg2 },
  contactBtnTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },
  contactBtnTxtPrimary: { ...type.caption, color: "#fff", fontWeight: "700" },
  err: { ...type.bodySm, color: theme.error, textAlign: "center" },
});
