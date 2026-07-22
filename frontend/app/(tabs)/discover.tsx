import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, ImageBackground, FlatList, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

type EntityType = "Gigs" | "Musicians" | "Bands" | "Studios" | "Equipment" | "Lessons" | "Venues";
const TYPES: EntityType[] = ["Gigs", "Musicians", "Bands", "Studios", "Equipment", "Lessons", "Venues"];

const ENDPOINTS: Record<EntityType, string> = {
  Gigs: "/gigs", Musicians: "/musicians", Bands: "/bands",
  Studios: "/studios", Equipment: "/equipment", Lessons: "/lessons", Venues: "/venues",
};

export default function Discover() {
  const { fetchApi } = useAuth();
  const [type, setType] = useState<EntityType>("Gigs");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const data: any[] = await fetchApi(`${ENDPOINTS[type]}?${params.toString()}`);
      setItems(data);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [fetchApi, type, q]);

  useEffect(() => { load(); }, [load]);

  const renderCard = (item: any) => {
    switch (type) {
      case "Gigs":
        return (
          <Pressable testID={`disc-gig-${item.id}`} onPress={() => router.push(`/gig/${item.id}`)} style={styles.card}>
            <ImageBackground source={{ uri: item.cover_url }} style={{ height: 120 }} imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}>
              <LinearGradient colors={["transparent", "rgba(9,9,11,0.85)"]} style={StyleSheet.absoluteFill} />
              <View style={styles.tag}><Text style={styles.tagTxt}>{item.event_type?.toUpperCase()}</Text></View>
            </ImageBackground>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.meta}>{item.city} · {item.date}</Text>
              <Text style={styles.price}>₹{item.budget?.toLocaleString("en-IN")}</Text>
            </View>
          </Pressable>
        );
      case "Musicians":
        return (
          <Pressable testID={`disc-mus-${item.user.id}`} onPress={() => router.push(`/musician/${item.user.id}`)} style={styles.card}>
            {item.profile.cover_url && (
              <ImageBackground source={{ uri: item.profile.cover_url }} style={{ height: 100 }} imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}>
                <LinearGradient colors={["transparent", "rgba(9,9,11,0.9)"]} style={StyleSheet.absoluteFill} />
              </ImageBackground>
            )}
            <View style={styles.body}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {item.user.avatar_url ? <Image source={{ uri: item.user.avatar_url }} style={styles.avatar} /> :
                  <View style={styles.avatar}><Text style={{ color: theme.text, fontWeight: "700" }}>{item.user.full_name[0]}</Text></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{item.user.full_name} {item.user.verified && <Ionicons name="checkmark-circle" size={13} color={theme.brand} />}</Text>
                  <Text style={styles.meta}>{item.profile.city} · {(item.profile.genres || []).slice(0,2).join(", ")}</Text>
                </View>
              </View>
              <Text style={styles.price}>₹{item.profile.pricing_per_hour?.toLocaleString("en-IN")}/hr</Text>
            </View>
          </Pressable>
        );
      case "Bands":
        return (
          <View testID={`disc-band-${item.id}`} style={styles.card}>
            <ImageBackground source={{ uri: item.cover_url }} style={{ height: 120 }} imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}>
              <LinearGradient colors={["transparent", "rgba(9,9,11,0.9)"]} style={StyleSheet.absoluteFill} />
            </ImageBackground>
            <View style={styles.body}>
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.meta}>{item.city} · {(item.genres || []).join(", ")}</Text>
              {item.looking_for?.length > 0 && (
                <View style={styles.pillRow}>
                  {item.looking_for.map((r: string) => <View key={r} style={styles.pill}><Text style={styles.pillTxt}>Needs {r}</Text></View>)}
                </View>
              )}
            </View>
          </View>
        );
      case "Studios":
      case "Venues":
        return (
          <View testID={`disc-${type.toLowerCase()}-${item.id}`} style={styles.card}>
            <ImageBackground source={{ uri: item.cover_url }} style={{ height: 130 }} imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}>
              <LinearGradient colors={["transparent", "rgba(9,9,11,0.85)"]} style={StyleSheet.absoluteFill} />
            </ImageBackground>
            <View style={styles.body}>
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.meta}>{item.city} {item.type ? `· ${item.type}` : ""}{item.capacity ? ` · ${item.capacity} pax` : ""}</Text>
              {item.hourly_rate ? <Text style={styles.price}>₹{item.hourly_rate.toLocaleString("en-IN")}/hr</Text>
                : item.rating ? <Text style={styles.price}>{item.rating} ★</Text> : null}
            </View>
          </View>
        );
      case "Equipment":
        return (
          <View testID={`disc-eq-${item.id}`} style={styles.card}>
            <ImageBackground source={{ uri: item.cover_url }} style={{ height: 130 }} imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}>
              <LinearGradient colors={["transparent", "rgba(9,9,11,0.85)"]} style={StyleSheet.absoluteFill} />
              <View style={styles.tag}><Text style={styles.tagTxt}>{item.listing_type?.toUpperCase()}</Text></View>
            </ImageBackground>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.meta}>{item.city} · {item.category}</Text>
              <Text style={styles.price}>₹{item.price?.toLocaleString("en-IN")}{item.listing_type === "rent" ? " / day" : ""}</Text>
            </View>
          </View>
        );
      case "Lessons":
        return (
          <View testID={`disc-lesson-${item.id}`} style={styles.card}>
            <ImageBackground source={{ uri: item.cover_url }} style={{ height: 120 }} imageStyle={{ borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg }}>
              <LinearGradient colors={["transparent", "rgba(9,9,11,0.85)"]} style={StyleSheet.absoluteFill} />
            </ImageBackground>
            <View style={styles.body}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>{item.subject} · {item.format} · {item.city}</Text>
              <Text style={styles.price}>₹{item.price_per_hour?.toLocaleString("en-IN")}/hr</Text>
            </View>
          </View>
        );
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
          <Pressable key={t} testID={`type-${t}`} onPress={() => setType(t)} style={[styles.chip, type === t && styles.chipOn]}>
            <Text style={[styles.chipTxt, type === t && styles.chipTxtOn]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, i) => (it.id || it.user?.id || String(i))}
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
  price: { ...type.titleMd, color: theme.brand, fontWeight: "800", marginTop: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.bg3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  pill: { backgroundColor: theme.brandTint, borderColor: theme.brand, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  pillTxt: { ...type.tiny, color: theme.brand, fontWeight: "700" },
});
