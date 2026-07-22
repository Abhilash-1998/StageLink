import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList, RefreshControl, ActivityIndicator, ImageBackground, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

const GENRES = ["All", "Jazz", "Pop", "Rock", "Indie", "EDM", "Classical", "Fusion", "R&B", "Soul"];
const CITIES = ["All", "Mumbai", "Bengaluru", "Delhi"];

type Gig = {
  id: string; title: string; city: string; date: string; event_type: string;
  genre: string; instrument_needed: string; budget: number; description: string;
  cover_url?: string; featured?: boolean;
};

export default function Discover() {
  const { user, fetchApi } = useAuth();
  const isOrg = user?.role === "organizer";
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [recos, setRecos] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [genre, setGenre] = useState("All");
  const [city, setCity] = useState("All");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (genre !== "All") params.set("genre", genre);
    if (city !== "All") params.set("city", city);
    if (q.trim()) params.set("q", q.trim());
    const data: Gig[] = await fetchApi(`/gigs?${params.toString()}`);
    setGigs(data);
    if (!isOrg) {
      try {
        const r: Gig[] = await fetchApi("/ai/recommendations", { method: "POST", body: JSON.stringify({ limit: 3 }) });
        setRecos(r);
      } catch {}
    }
  }, [fetchApi, genre, city, q, isOrg]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  if (loading) return (
    <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>
  );

  const featured = gigs.find(g => g.featured) || gigs[0];

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <FlatList
        data={gigs}
        keyExtractor={g => g.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.hi}>Hello, {user?.full_name?.split(" ")[0]}</Text>
                <Text style={styles.h1}>{isOrg ? "Book brilliant talent" : "Find your next stage"}</Text>
              </View>
              {isOrg && (
                <Pressable testID="create-gig-fab" onPress={() => router.push("/gig/new")} style={styles.fab}>
                  <Ionicons name="add" size={22} color="#fff" />
                </Pressable>
              )}
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={theme.textDim} />
              <TextInput testID="search-input" style={styles.search} value={q} onChangeText={setQ} onSubmitEditing={load} placeholder="Search gigs, genres…" placeholderTextColor={theme.textDim} />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {CITIES.map(c => (
                <Pressable key={c} testID={`city-chip-${c}`} onPress={() => setCity(c)} style={[styles.chip, city === c && styles.chipOn]}>
                  <Text style={[styles.chipTxt, city === c && styles.chipTxtOn]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {GENRES.map(g => (
                <Pressable key={g} testID={`genre-chip-${g}`} onPress={() => setGenre(g)} style={[styles.chip, genre === g && styles.chipOn]}>
                  <Text style={[styles.chipTxt, genre === g && styles.chipTxtOn]}>{g}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {featured && !isOrg && (
              <Pressable testID="featured-gig" onPress={() => router.push(`/gig/${featured.id}`)} style={styles.heroCard}>
                <ImageBackground source={{ uri: featured.cover_url }} style={StyleSheet.absoluteFill} imageStyle={{ borderRadius: theme.radius.lg }} />
                <LinearGradient colors={["rgba(9,9,11,0.1)", "rgba(9,9,11,0.95)"]} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.lg }]} />
                <View style={styles.heroBadge}>
                  <Ionicons name="star" size={11} color={theme.brand} />
                  <Text style={styles.heroBadgeTxt}>Featured</Text>
                </View>
                <View style={styles.heroInner}>
                  <Text style={styles.heroTitle}>{featured.title}</Text>
                  <Text style={styles.heroMeta}>{featured.city} · ₹{featured.budget.toLocaleString("en-IN")} · {featured.event_type}</Text>
                </View>
              </Pressable>
            )}

            {recos.length > 0 && !isOrg && (
              <View style={{ marginTop: 24 }}>
                <View style={styles.sectionRow}>
                  <Ionicons name="sparkles" size={14} color={theme.brand} />
                  <Text style={styles.sectionTitle}>Picked for you</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
                  {recos.map(r => (
                    <Pressable key={r.id} testID={`reco-${r.id}`} onPress={() => router.push(`/gig/${r.id}`)} style={styles.recoCard}>
                      <ImageBackground source={{ uri: r.cover_url }} style={StyleSheet.absoluteFill} imageStyle={{ borderRadius: theme.radius.md }} />
                      <LinearGradient colors={["transparent", "rgba(9,9,11,0.95)"]} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.md }]} />
                      <View style={styles.recoInner}>
                        <Text style={styles.recoTitle} numberOfLines={2}>{r.title}</Text>
                        <Text style={styles.recoMeta}>₹{r.budget.toLocaleString("en-IN")}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{isOrg ? "All open gigs" : "Available gigs"}</Text>
              <Text style={styles.count}>{gigs.length}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable testID={`gig-card-${item.id}`} onPress={() => router.push(`/gig/${item.id}`)} style={styles.gigCard}>
            <ImageBackground source={{ uri: item.cover_url }} style={{ height: 130 }} imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}>
              <LinearGradient colors={["transparent", "rgba(9,9,11,0.85)"]} style={StyleSheet.absoluteFill} />
              <View style={styles.gigTag}><Text style={styles.gigTagTxt}>{item.event_type.toUpperCase()}</Text></View>
            </ImageBackground>
            <View style={styles.gigBody}>
              <Text style={styles.gigTitle} numberOfLines={1}>{item.title}</Text>
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={13} color={theme.textDim} /><Text style={styles.meta}>{item.city}</Text>
                <View style={styles.dot} />
                <Ionicons name="calendar-outline" size={13} color={theme.textDim} /><Text style={styles.meta}>{item.date}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="musical-notes-outline" size={13} color={theme.textDim} /><Text style={styles.meta}>{item.genre} · {item.instrument_needed}</Text>
              </View>
              <Text style={styles.price}>₹{item.budget.toLocaleString("en-IN")}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<View style={{ padding: 40, alignItems: "center" }}><Text style={{ color: theme.textDim }}>No gigs found. Try different filters.</Text></View>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  hi: { color: theme.textDim, fontSize: 13, marginBottom: 4 },
  h1: { color: theme.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  fab: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: theme.bg2, marginHorizontal: 20, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.border, gap: 8 },
  search: { flex: 1, color: theme.text, paddingVertical: 12, fontSize: 14 },
  chipRow: { paddingHorizontal: 20, gap: 8, paddingVertical: 10 },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: 14, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  chipTxt: { color: theme.textDim, fontSize: 13, fontWeight: "500" },
  chipTxtOn: { color: theme.text, fontWeight: "600" },
  heroCard: { height: 190, marginHorizontal: 20, marginTop: 10, borderRadius: theme.radius.lg, overflow: "hidden" },
  heroBadge: { position: "absolute", top: 14, left: 14, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(9,9,11,0.7)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.brand },
  heroBadgeTxt: { color: theme.brand, fontSize: 11, fontWeight: "700" },
  heroInner: { position: "absolute", bottom: 16, left: 16, right: 16 },
  heroTitle: { color: theme.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  heroMeta: { color: theme.textMid, fontSize: 13, marginTop: 4 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, marginTop: 20, marginBottom: 12, justifyContent: "space-between" },
  sectionTitle: { color: theme.text, fontSize: 17, fontWeight: "700", flex: 1, marginLeft: 4 },
  count: { color: theme.textDim, fontSize: 13 },
  recoCard: { width: 170, height: 200, borderRadius: theme.radius.md, overflow: "hidden" },
  recoInner: { position: "absolute", bottom: 12, left: 12, right: 12 },
  recoTitle: { color: theme.text, fontSize: 14, fontWeight: "700" },
  recoMeta: { color: theme.brand, fontSize: 13, fontWeight: "700", marginTop: 4 },
  gigCard: { marginHorizontal: 20, marginBottom: 14, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: theme.border },
  gigTag: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(9,9,11,0.7)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill },
  gigTagTxt: { color: theme.text, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  gigBody: { padding: 14 },
  gigTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  meta: { color: theme.textDim, fontSize: 12 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: theme.textDim, marginHorizontal: 5 },
  price: { color: theme.brand, fontSize: 18, fontWeight: "800", marginTop: 8 },
});
