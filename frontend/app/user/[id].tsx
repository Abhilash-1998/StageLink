import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Pressable, ActivityIndicator, ImageBackground, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { MediaViewer } from "@/src/components/MediaViewer";
import { formatDate } from "@/src/utils/date";

/**
 * Public professional profile viewer.
 * Any user reference in the app (post author, comment author, discover card,
 * gig organizer, etc.) navigates here via /user/{id}.
 */
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, fetchApi } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ items: any[]; idx: number } | null>(null);
  const [following, setFollowing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      // If it's the current user, redirect to their own profile tab
      if (id === user?.id) { router.replace("/(tabs)/profile"); return; }
      const d: any = await fetchApi(`/profile/musician/${id}`);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [fetchApi, id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const toggleFollow = async () => {
    setFollowing(!following);
    try { await fetchApi(`/follow/${id}`, { method: "POST" }); } catch { setFollowing(following); }
  };

  const openViewer = (items: any[], idx: number) => setViewer({
    items: items.map(x => ({ uri: x.media_url, type: x.media_type, title: x.title })),
    idx,
  });
  const openLink = (u?: string) => u && Linking.openURL(u).catch(() => {});

  if (loading) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;
  if (!data) return (
    <SafeAreaView style={styles.bg}><View style={styles.center}>
      <Text style={{ ...type.bodySm, color: theme.textDim }}>Profile not found</Text>
      <Pressable onPress={() => router.back()} style={styles.backBtn2}><Text style={{ ...type.label, color: theme.brand }}>Go back</Text></Pressable>
    </View></SafeAreaView>
  );

  const u = data.user || {};
  const p = data.profile || {};
  const portfolio: any[] = p.portfolio_items || [];
  const services: any[] = p.services || [];
  const initials = u.full_name?.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase();

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.cover}>
          {p.cover_url
            ? <ImageBackground source={{ uri: p.cover_url }} style={StyleSheet.absoluteFill}>
                <LinearGradient colors={["transparent", "rgba(9,9,11,0.9)"]} style={StyleSheet.absoluteFill} />
              </ImageBackground>
            : <LinearGradient colors={[theme.brand2, theme.bg]} style={StyleSheet.absoluteFill} />
          }
          <SafeAreaView edges={["top"]} style={styles.coverNav}>
            <Pressable testID="user-back" onPress={() => router.back()} style={styles.circleBtn}>
              <Ionicons name="chevron-back" size={22} color={theme.text} />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            {u.avatar_url ? <Image source={{ uri: u.avatar_url }} style={styles.avatarImg} /> :
              <Text style={styles.avatarTxt}>{initials}</Text>}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.name}>{u.full_name}</Text>
              {u.verified && <Ionicons name="checkmark-circle" size={16} color={theme.brand} />}
            </View>
            {p.tagline ? <Text style={styles.tagline}>{p.tagline}</Text> :
              <Text style={styles.role}>{p.city || ""}{p.experience_years ? ` · ${p.experience_years}y` : ""}</Text>}
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable testID="user-follow" onPress={toggleFollow} style={[styles.actionBtn, { backgroundColor: following ? theme.bg2 : theme.brand }]}>
            <Ionicons name={following ? "checkmark" : "add"} size={15} color={following ? theme.text : "#fff"} />
            <Text style={[styles.actionBtnTxt, { color: following ? theme.text : "#fff" }]}>{following ? "Following" : "Follow"}</Text>
          </Pressable>
          <Pressable testID="user-message" onPress={() => router.push(`/chat/${id}`)} style={styles.actionBtn}>
            <Ionicons name="paper-plane-outline" size={15} color={theme.text} />
            <Text style={styles.actionBtnTxt}>Message</Text>
          </Pressable>
        </View>

        <View style={styles.statsBar}>
          <View style={styles.stat}><Text style={styles.statNum}>{data?.rating ?? "0.0"}</Text><Text style={styles.statLbl}>★ Rating</Text></View>
          <View style={styles.statDiv} />
          <View style={styles.stat}><Text style={styles.statNum}>{data?.review_count ?? 0}</Text><Text style={styles.statLbl}>Reviews</Text></View>
          <View style={styles.statDiv} />
          <View style={styles.stat}><Text style={styles.statNum}>{data?.followers ?? 0}</Text><Text style={styles.statLbl}>Followers</Text></View>
          <View style={styles.statDiv} />
          <View style={styles.stat}><Text style={styles.statNum}>{data?.following ?? 0}</Text><Text style={styles.statLbl}>Following</Text></View>
        </View>

        {p.bio && (<View style={styles.section}><Text style={styles.sTitle}>About</Text><Text style={styles.bio}>{p.bio}</Text></View>)}

        {p.professions?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Professions</Text>
            <View style={styles.chipRow}>{p.professions.map((g: string) => <View key={g} style={styles.tagBrand}><Text style={styles.tagBrandTxt}>{g}</Text></View>)}</View>
          </View>
        )}

        {(p.genres?.length > 0 || p.instruments?.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Style</Text>
            <View style={styles.chipRow}>
              {p.genres?.map((g: string) => <View key={`g-${g}`} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}
              {p.instruments?.map((g: string) => <View key={`i-${g}`} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}
            </View>
          </View>
        )}

        {p.pricing_per_hour > 0 && !p.hide_pricing && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Base rate</Text>
            <Text style={styles.price}>₹{p.pricing_per_hour.toLocaleString("en-IN")} / hour</Text>
          </View>
        )}

        {services.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Services</Text>
            <View style={{ gap: 10, marginTop: 4 }}>
              {services.map((s: any) => (
                <View key={s.id} style={styles.serviceCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceTitle}>{s.title}</Text>
                    <Text style={styles.serviceDesc} numberOfLines={2}>{s.description}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.servicePrice}>₹{s.price?.toLocaleString("en-IN")}</Text>
                    <Text style={styles.servicePricing}>{s.pricing_type?.replace("_", " ")}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {portfolio.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Portfolio</Text>
            <View style={styles.mediaGrid}>
              {portfolio.map((it, i) => (
                <Pressable key={it.id} testID={`u-media-${it.id}`} onPress={() => openViewer(portfolio, i)} style={styles.mediaTile}>
                  <Image source={{ uri: it.thumbnail_url || it.media_url }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                  {it.media_type === "video" && (
                    <View style={styles.playBadge}><Ionicons name="play-circle" size={26} color="#fff" /></View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {(p.instagram_url || p.youtube_url || p.spotify_url || p.website_url || p.linkedin_url || p.soundcloud_url) && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Find on</Text>
            <View style={styles.socialRow}>
              {p.instagram_url && <Pressable onPress={() => openLink(p.instagram_url)} style={styles.socialBtn}><Ionicons name="logo-instagram" size={18} color={theme.text} /></Pressable>}
              {p.youtube_url && <Pressable onPress={() => openLink(p.youtube_url)} style={styles.socialBtn}><Ionicons name="logo-youtube" size={18} color={theme.text} /></Pressable>}
              {p.spotify_url && <Pressable onPress={() => openLink(p.spotify_url)} style={styles.socialBtn}><Ionicons name="musical-notes" size={17} color={theme.text} /></Pressable>}
              {p.linkedin_url && <Pressable onPress={() => openLink(p.linkedin_url)} style={styles.socialBtn}><Ionicons name="logo-linkedin" size={18} color={theme.text} /></Pressable>}
              {p.website_url && <Pressable onPress={() => openLink(p.website_url)} style={styles.socialBtn}><Ionicons name="globe-outline" size={18} color={theme.text} /></Pressable>}
            </View>
          </View>
        )}

        {u.created_at && (
          <Text style={styles.joined}>Joined {formatDate(u.created_at)}</Text>
        )}
      </ScrollView>

      {viewer && (
        <MediaViewer visible items={viewer.items} initialIndex={viewer.idx} onClose={() => setViewer(null)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtn2: { paddingHorizontal: 20, paddingVertical: 10 },
  cover: { height: 160 },
  coverNav: { position: "absolute", top: 0, left: 0 },
  circleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(9,9,11,0.7)", alignItems: "center", justifyContent: "center", marginLeft: 16, marginTop: 8 },
  headerRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 20, marginTop: -36 },
  avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: theme.bg2, borderWidth: 3, borderColor: theme.bg, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarTxt: { ...type.displayMd, color: theme.text },
  name: { ...type.h2, color: theme.text },
  tagline: { ...type.caption, color: theme.brand, marginTop: 4, fontWeight: "600" },
  role: { ...type.caption, color: theme.textDim, marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 16 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.bg2, borderRadius: theme.radius.pill, paddingVertical: 11, borderWidth: 1, borderColor: theme.border },
  actionBtnTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  statsBar: { flexDirection: "row", marginHorizontal: 20, marginTop: 20, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.border, paddingVertical: 14 },
  stat: { flex: 1, alignItems: "center" },
  statNum: { ...type.titleLg, color: theme.text, fontWeight: "800" },
  statLbl: { ...type.tiny, color: theme.textDim, marginTop: 3 },
  statDiv: { width: 1, backgroundColor: theme.border },
  section: { paddingHorizontal: 20, marginTop: 22 },
  sTitle: { ...type.titleMd, color: theme.text, fontWeight: "700", marginBottom: 8 },
  bio: { ...type.bodySm, color: theme.textMid, lineHeight: 21 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: theme.bg2, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: theme.border },
  tagTxt: { ...type.caption, color: theme.textMid, fontWeight: "500" },
  tagBrand: { backgroundColor: theme.brandTint, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: theme.brand },
  tagBrandTxt: { ...type.caption, color: theme.brand, fontWeight: "600" },
  price: { ...type.h3, color: theme.brand },
  serviceCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 14, borderWidth: 1, borderColor: theme.border },
  serviceTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  serviceDesc: { ...type.caption, color: theme.textDim, marginTop: 3 },
  servicePrice: { ...type.titleMd, color: theme.brand, fontWeight: "800" },
  servicePricing: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 3, marginTop: 4 },
  mediaTile: { width: "32.7%", aspectRatio: 1, backgroundColor: theme.bg2, overflow: "hidden" },
  playBadge: { position: "absolute", top: "50%", left: "50%", marginLeft: -13, marginTop: -13 },
  socialRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  socialBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  joined: { ...type.tiny, color: theme.textDim, textAlign: "center", marginTop: 24, marginBottom: 8 },
});
