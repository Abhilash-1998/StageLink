import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, FlatList, Image, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatDate } from "@/src/utils/date";
import { formatBaseRate } from "@/src/utils/pricing";
import { ENTITY_TYPES, EntityType, DEFAULT_CITY } from "@/src/data/options";
import { EntityCover } from "@/src/components/EntityCover";
import { availabilityToday, availabilityTodayLabel } from "@/src/utils/availability";

const TYPES: readonly EntityType[] = ENTITY_TYPES;

const ENDPOINTS: Record<EntityType, string> = {
  Gigs: "/gigs", Musicians: "/musicians", Bands: "/bands",
  Studios: "/studios", Equipment: "/equipment", Lessons: "/lessons", Venues: "/venues",
};

/**
 * Discover — unified search across every marketplace entity.
 * Root-cause fix for the chip-filter crash: clearing `items` when `type`
 * changes is essential. Otherwise FlatList re-renders old objects
 * against the new switch case, and e.g. a Gig has no `.user` field →
 * `item.user.id` throws "Cannot read property 'id' of undefined".
 * We also defensively guard every nested access in renderCard.
 */
export default function Discover() {
  const { fetchApi } = useAuth();
  const [type, setType] = useState<EntityType>("Gigs");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const switchType = (t: EntityType) => {
    if (t === type) return;
    // Prevent stale-shape crash: drop old rows before the new fetch resolves.
    setItems([]);
    setType(t);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("city", DEFAULT_CITY);
      const data: any[] = await fetchApi(`${ENDPOINTS[type]}?${params.toString()}`);
      // Filter out malformed entries so the renderer only ever sees valid shapes
      const clean = Array.isArray(data) ? data.filter(x => x && (x.id || x.user?.id)) : [];
      setItems(clean);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [fetchApi, type, q]);

  useEffect(() => { load(); }, [load]);

  const renderCard = (item: any) => {
    if (!item) return null;
    switch (type) {
      case "Gigs": {
        if (!item.id) return null;
        return (
          <Pressable testID={`disc-gig-${item.id}`} onPress={() => router.push(`/gig/${item.id}`)} style={styles.card}>
            <EntityCover
              kind="gig"
              uri={item.cover_url}
              height={120}
              imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}
            >
              {item.event_type && <View style={styles.tag}><Text style={styles.tagTxt}>{String(item.event_type).toUpperCase()}</Text></View>}
            </EntityCover>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>{item.title || "Untitled gig"}</Text>
              <Text style={styles.meta}>{item.city || "—"} · {formatDate(item.date)}</Text>
              {!!item.instrument_needed && (
                <Text style={styles.need} numberOfLines={1}>Needs {item.instrument_needed}</Text>
              )}
              {typeof item.budget === "number" && <Text style={styles.price}>₹{item.budget.toLocaleString("en-IN")}</Text>}
            </View>
          </Pressable>
        );
      }
      case "Musicians": {
        const u = item.user;
        const p = item.profile || {};
        if (!u?.id) return null;
        const avail = availabilityToday(p.availability);
        const availLabel = availabilityTodayLabel(avail);
        const availColor = avail === "available" ? theme.success : theme.textDim;
        return (
          <Pressable testID={`disc-mus-${u.id}`} onPress={() => router.push(`/user/${u.id}`)} style={styles.card}>
            {p.cover_url ? (
              <EntityCover
                kind="gig"
                uri={p.cover_url}
                height={100}
                imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}
              />
            ) : null}
            <View style={styles.body}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {u.avatar_url ? <Image source={{ uri: u.avatar_url }} style={styles.avatar} /> :
                  <View style={styles.avatar}><Text style={{ color: theme.text, fontWeight: "700" }}>{(u.full_name || "?").charAt(0)}</Text></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{u.full_name || "Unnamed"} {u.verified && <Ionicons name="checkmark-circle" size={13} color={theme.brand} />}</Text>
                  <Text style={styles.meta}>{p.city || "—"} · {(p.genres || []).slice(0, 2).join(", ") || "No genres yet"}</Text>
                </View>
              </View>
              {!!availLabel && (
                <View
                  testID={`disc-mus-avail-${u.id}`}
                  style={[styles.availBadge, { borderColor: availColor, backgroundColor: `${availColor}18` }]}
                >
                  <View style={[styles.availDot, { backgroundColor: availColor }]} />
                  <Text style={[styles.availTxt, { color: availColor }]}>{availLabel}</Text>
                </View>
              )}
              {p.pricing_per_hour && !p.hide_pricing ? (
                <Text style={styles.price}>{formatBaseRate(p.pricing_per_hour, p.pricing_type || "per_hour")}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      }
      case "Bands": {
        if (!item.id) return null;
        return (
          <Pressable testID={`disc-band-${item.id}`} onPress={() => router.push(`/listing/band/${item.id}`)} style={styles.card}>
            <EntityCover
              kind="band"
              uri={item.cover_url}
              height={120}
              imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}
            />
            <View style={styles.body}>
              <Text style={styles.title}>{item.name || "Unnamed band"}</Text>
              <Text style={styles.meta}>{item.city || "—"}{(item.genres || []).length > 0 ? ` · ${(item.genres || []).join(", ")}` : ""}</Text>
              {(item.looking_for || []).length > 0 && (
                <View style={styles.pillRow}>
                  {item.looking_for.map((r: string) => <View key={r} style={styles.pill}><Text style={styles.pillTxt}>Needs {r}</Text></View>)}
                </View>
              )}
            </View>
          </Pressable>
        );
      }
      case "Studios":
      case "Venues": {
        if (!item.id) return null;
        const kind = type === "Studios" ? "studio" : "venue";
        return (
          <Pressable testID={`disc-${type.toLowerCase()}-${item.id}`} onPress={() => router.push(`/listing/${kind}/${item.id}`)} style={styles.card}>
            <EntityCover
              kind={kind}
              uri={item.cover_url}
              images={item.images}
              height={130}
              imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}
            />
            <View style={styles.body}>
              <Text style={styles.title}>{item.name || "Unnamed"}</Text>
              <Text style={styles.meta}>{item.city || "—"}{item.type ? ` · ${item.type}` : ""}{item.capacity ? ` · ${item.capacity} pax` : ""}</Text>
              {item.hourly_rate ? <Text style={styles.price}>₹{Number(item.hourly_rate).toLocaleString("en-IN")}/hr</Text>
                : item.rating ? <Text style={styles.price}>{item.rating} ★</Text> : null}
              {type === "Studios" && !!item.maps_url && (
                <Pressable
                  testID={`disc-studio-maps-${item.id}`}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    Linking.openURL(item.maps_url).catch(() => {});
                  }}
                  style={styles.mapsLink}
                >
                  <Ionicons name="navigate-outline" size={13} color={theme.brand} />
                  <Text style={styles.mapsLinkTxt}>Open in Maps</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        );
      }
      case "Equipment": {
        if (!item.id) return null;
        return (
          <Pressable testID={`disc-eq-${item.id}`} onPress={() => router.push(`/listing/equipment/${item.id}`)} style={styles.card}>
            <EntityCover
              kind="equipment"
              uri={item.cover_url}
              images={item.images}
              height={130}
              imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}
            >
              {item.listing_type && <View style={styles.tag}><Text style={styles.tagTxt}>{String(item.listing_type).toUpperCase()}</Text></View>}
            </EntityCover>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>{item.title || "Untitled"}</Text>
              <Text style={styles.meta}>{item.city || "—"}{item.category ? ` · ${item.category}` : ""}</Text>
              {typeof item.price === "number" && <Text style={styles.price}>₹{item.price.toLocaleString("en-IN")}{item.listing_type === "rent" ? " / day" : ""}</Text>}
            </View>
          </Pressable>
        );
      }
      case "Lessons": {
        if (!item.id) return null;
        return (
          <Pressable testID={`disc-lesson-${item.id}`} onPress={() => router.push(`/listing/lesson/${item.id}`)} style={styles.card}>
            <EntityCover
              kind="lesson"
              uri={item.cover_url}
              height={120}
              imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}
            />
            <View style={styles.body}>
              <Text style={styles.title}>{item.title || "Untitled lesson"}</Text>
              <Text style={styles.meta}>{[item.subject, item.format, item.city].filter(Boolean).join(" · ")}</Text>
              {typeof item.price_per_hour === "number" && <Text style={styles.price}>₹{item.price_per_hour.toLocaleString("en-IN")}/hr</Text>}
            </View>
          </Pressable>
        );
      }
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Discover</Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={theme.textDim} />
          <TextInput
            testID="search-input" style={styles.search}
            value={q} onChangeText={setQ} onSubmitEditing={load}
            placeholder={`Search ${type.toLowerCase()}…`} placeholderTextColor={theme.textDim}
            returnKeyType="search"
          />
          {q.length > 0 && (
            <Pressable onPress={() => { setQ(""); }}><Ionicons name="close-circle" size={16} color={theme.textDim} /></Pressable>
          )}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 56 }} contentContainerStyle={styles.chipRow}>
        {TYPES.map(t => (
          <Pressable key={t} testID={`type-${t}`} onPress={() => switchType(t)} style={[styles.chip, type === t && styles.chipOn]}>
            <Text style={[styles.chipTxt, type === t && styles.chipTxtOn]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, i) => String(it?.id || it?.user?.id || i)}
          contentContainerStyle={{ padding: 20, paddingBottom: 130, gap: 14 }}
          renderItem={({ item }) => renderCard(item)}
          ListEmptyComponent={<View style={styles.center}><Text style={{ color: theme.textDim }}>No {type.toLowerCase()} found.</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { padding: 60, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  h1: { ...type.h1, color: theme.text },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: theme.bg2, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.border, gap: 8, marginTop: 12 },
  search: { ...type.bodySm, flex: 1, color: theme.text, paddingVertical: 12 },
  chipRow: { paddingHorizontal: 20, gap: 8, paddingVertical: 8 },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: 14, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  chipTxt: { ...type.caption, color: theme.textDim, fontWeight: "500" },
  chipTxtOn: { ...type.caption, color: theme.text, fontWeight: "700" },
  card: { backgroundColor: theme.bg2, borderRadius: theme.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: theme.border },
  tag: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(9,9,11,0.7)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill },
  tagTxt: { ...type.tiny, color: theme.text, fontWeight: "700", letterSpacing: 0.4 },
  body: { padding: 14 },
  title: { ...type.titleMd, color: theme.text, fontWeight: "700" },
  meta: { ...type.caption, color: theme.textDim, marginTop: 4 },
  need: { ...type.caption, color: theme.textMid, fontWeight: "700", marginTop: 6 },
  price: { ...type.titleMd, color: theme.brand, fontWeight: "800", marginTop: 8 },
  mapsLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, alignSelf: "flex-start" },
  mapsLinkTxt: { ...type.tiny, color: theme.brand, fontWeight: "700" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.bg3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  availBadge: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: theme.radius.pill, borderWidth: 1,
  },
  availDot: { width: 7, height: 7, borderRadius: 4 },
  availTxt: { ...type.tiny, fontWeight: "700" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  pill: { backgroundColor: theme.brandTint, borderColor: theme.brand, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  pillTxt: { ...type.tiny, color: theme.brand, fontWeight: "700" },
});
