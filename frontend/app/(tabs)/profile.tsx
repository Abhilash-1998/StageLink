import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Pressable, ActivityIndicator, ImageBackground, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileTab() {
  const { user, fetchApi, logout, refreshUser } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [completion, setCompletion] = useState<any>(null);
  const [entities, setEntities] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const isMusician = user?.active_role === "musician";
  const hasBoth = (user?.roles?.length || 0) >= 2;

  const load = useCallback(async () => {
    if (!user) return;
    const url = user.active_role === "organizer"
      ? `/profile/organizer/${user.id}` : `/profile/musician/${user.id}`;
    try {
      const [p, c, e] = await Promise.all([
        fetchApi(url).catch(() => null),
        fetchApi("/profile/completion").catch(() => null),
        fetchApi("/entities/mine").catch(() => null),
      ]);
      setProfile(p); setCompletion(c); setEntities(e);
    } finally { setLoading(false); }
  }, [fetchApi, user]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const switchRole = async (r: "musician" | "organizer") => {
    if (user?.active_role === r) return;
    setSwitching(true);
    try {
      await fetchApi("/auth/active-role", { method: "POST", body: JSON.stringify({ active_role: r }) });
      await refreshUser();
    } finally { setSwitching(false); }
  };

  if (loading) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  const p = profile?.profile || {};
  const initials = user?.full_name?.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const portfolioItems: any[] = p.portfolio_items || [];
  const services: any[] = p.services || [];
  const totalListings = (entities?.gigs?.length || 0) + (entities?.bands?.length || 0)
                      + (entities?.equipment?.length || 0) + (entities?.studios?.length || 0)
                      + (entities?.lessons?.length || 0);
  const pct = completion?.completion ?? 0;

  const openLink = (u?: string) => u && Linking.openURL(u).catch(() => {});

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        {/* Cover */}
        <View style={styles.cover}>
          {p.cover_url
            ? <ImageBackground source={{ uri: p.cover_url }} style={StyleSheet.absoluteFill}>
                <LinearGradient colors={["transparent", "rgba(9,9,11,0.9)"]} style={StyleSheet.absoluteFill} />
              </ImageBackground>
            : <LinearGradient colors={[theme.brand2, theme.bg]} style={StyleSheet.absoluteFill} />
          }
        </View>

        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            {user?.avatar_url ? <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} /> :
              <Text style={styles.avatarTxt}>{initials}</Text>}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={styles.name}>{user?.full_name}</Text>
              {user?.verified && <Ionicons name="checkmark-circle" size={16} color={theme.brand} />}
              {user?.premium && <View style={styles.proTag}><Text style={styles.proTagTxt}>PRO</Text></View>}
            </View>
            {p.tagline ? <Text style={styles.tagline}>{p.tagline}</Text> :
              <Text style={styles.role}>{p.city || "—"}{p.experience_years ? ` · ${p.experience_years}y` : ""}</Text>}
          </View>
        </View>

        {/* Edit / Share */}
        <View style={styles.actionRow}>
          <Pressable testID="edit-profile-cta" onPress={() => router.push("/profile/edit")} style={[styles.actionBtn, { backgroundColor: theme.brand }]}>
            <Ionicons name="create-outline" size={15} color="#fff" />
            <Text style={[styles.actionBtnTxt, { color: "#fff" }]}>Edit profile</Text>
          </Pressable>
          <Pressable testID="share-profile" style={styles.actionBtn}>
            <Ionicons name="share-outline" size={15} color={theme.text} />
            <Text style={styles.actionBtnTxt}>Share</Text>
          </Pressable>
        </View>

        {/* Role switcher */}
        {hasBoth && (
          <View style={styles.switcher}>
            <Pressable testID="role-musician-btn" disabled={switching} onPress={() => switchRole("musician")} style={[styles.switchBtn, isMusician && styles.switchOn]}>
              <Ionicons name="musical-notes" size={14} color={isMusician ? "#fff" : theme.textDim} />
              <Text style={[styles.switchTxt, isMusician && styles.switchTxtOn]}>Musician</Text>
            </Pressable>
            <Pressable testID="role-organizer-btn" disabled={switching} onPress={() => switchRole("organizer")} style={[styles.switchBtn, !isMusician && styles.switchOn]}>
              <Ionicons name="megaphone" size={14} color={!isMusician ? "#fff" : theme.textDim} />
              <Text style={[styles.switchTxt, !isMusician && styles.switchTxtOn]}>Organizer</Text>
            </Pressable>
          </View>
        )}

        {/* Completion */}
        {isMusician && pct < 100 && completion && (
          <Pressable testID="completion-card" onPress={() => router.push("/profile/edit")} style={styles.compCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.compTitle}>Profile {pct}% complete</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.brand} />
            </View>
            <View style={styles.compBar}>
              <View style={[styles.compBarFill, { width: `${pct}%` }]} />
            </View>
            {completion.suggestions?.slice(0, 2).map((s: any) => (
              <View key={s.field} style={styles.suggRow}>
                <Ionicons name="add-circle-outline" size={14} color={theme.brand} />
                <Text style={styles.suggTxt}>{s.prompt}</Text>
              </View>
            ))}
          </Pressable>
        )}

        {/* Stats */}
        {isMusician && (
          <View style={styles.statsBar}>
            <View style={styles.stat}><Text style={styles.statNum}>{profile?.rating || "0.0"}</Text><Text style={styles.statLbl}>★ Rating</Text></View>
            <View style={styles.statDiv} />
            <View style={styles.stat}><Text style={styles.statNum}>{profile?.review_count || 0}</Text><Text style={styles.statLbl}>Reviews</Text></View>
            <View style={styles.statDiv} />
            <View style={styles.stat}><Text style={styles.statNum}>{profile?.reliability || 0}%</Text><Text style={styles.statLbl}>Reliable</Text></View>
            <View style={styles.statDiv} />
            <View style={styles.stat}><Text style={styles.statNum}>{profile?.followers || 0}</Text><Text style={styles.statLbl}>Followers</Text></View>
          </View>
        )}

        {/* About */}
        {p.bio && (<View style={styles.section}><Text style={styles.sTitle}>About</Text><Text style={styles.bio}>{p.bio}</Text></View>)}

        {/* Professions */}
        {p.professions?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Professions</Text>
            <View style={styles.chipRow}>{p.professions.map((g: string) => <View key={g} style={styles.tagBrand}><Text style={styles.tagBrandTxt}>{g}</Text></View>)}</View>
          </View>
        )}

        {/* Genres + Instruments */}
        {isMusician && (p.genres?.length > 0 || p.instruments?.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Style</Text>
            <View style={styles.chipRow}>
              {p.genres?.map((g: string) => <View key={g} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}
              {p.instruments?.map((g: string) => <View key={g} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}
            </View>
          </View>
        )}

        {/* Skills */}
        {p.skills?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Skills</Text>
            <View style={styles.chipRow}>{p.skills.map((g: string) => <View key={g} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}</View>
          </View>
        )}

        {/* Pricing */}
        {p.pricing_per_hour > 0 && !p.hide_pricing && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Base rate</Text>
            <Text style={styles.price}>₹{p.pricing_per_hour.toLocaleString("en-IN")} / hour</Text>
          </View>
        )}

        {/* Services */}
        {services.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Services</Text>
            <View style={{ gap: 10, marginTop: 4 }}>
              {services.map(s => (
                <View key={s.id} style={styles.serviceCard} testID={`service-${s.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceTitle}>{s.title}</Text>
                    <Text style={styles.serviceDesc} numberOfLines={2}>{s.description}</Text>
                    {s.duration && <Text style={styles.serviceDur}>{s.duration}</Text>}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.servicePrice}>₹{s.price.toLocaleString("en-IN")}</Text>
                    <Text style={styles.servicePricing}>{s.pricing_type.replace("_", " ")}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Portfolio */}
        {portfolioItems.length > 0 && (
          <View style={styles.section}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={styles.sTitle}>Portfolio</Text>
              <Text style={styles.count}>{portfolioItems.length} item{portfolioItems.length === 1 ? "" : "s"}</Text>
            </View>
            <View style={styles.portGrid}>
              {portfolioItems.slice(0, 6).map(it => (
                <View key={it.id} style={styles.portItem} testID={`portfolio-${it.id}`}>
                  <ImageBackground source={{ uri: it.thumbnail_url || it.media_url }} style={StyleSheet.absoluteFill} imageStyle={{ borderRadius: theme.radius.md }} />
                  <LinearGradient colors={["transparent", "rgba(9,9,11,0.9)"]} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.md }]} />
                  <View style={styles.portOverlay}>
                    {it.media_type === "video" && <Ionicons name="play-circle" size={22} color="#fff" style={{ marginBottom: 4 }} />}
                    <Text style={styles.portTitle} numberOfLines={2}>{it.title}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Social */}
        {(p.instagram_url || p.youtube_url || p.spotify_url || p.website_url || p.linkedin_url || p.soundcloud_url) && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Find me on</Text>
            <View style={styles.socialRow}>
              {p.instagram_url && <Pressable testID="social-ig" onPress={() => openLink(p.instagram_url)} style={styles.socialBtn}><Ionicons name="logo-instagram" size={18} color={theme.text} /></Pressable>}
              {p.youtube_url && <Pressable testID="social-yt" onPress={() => openLink(p.youtube_url)} style={styles.socialBtn}><Ionicons name="logo-youtube" size={18} color={theme.text} /></Pressable>}
              {p.spotify_url && <Pressable onPress={() => openLink(p.spotify_url)} style={styles.socialBtn}><Ionicons name="musical-notes" size={17} color={theme.text} /></Pressable>}
              {p.soundcloud_url && <Pressable onPress={() => openLink(p.soundcloud_url)} style={styles.socialBtn}><Ionicons name="cloud" size={17} color={theme.text} /></Pressable>}
              {p.linkedin_url && <Pressable onPress={() => openLink(p.linkedin_url)} style={styles.socialBtn}><Ionicons name="logo-linkedin" size={18} color={theme.text} /></Pressable>}
              {p.website_url && <Pressable onPress={() => openLink(p.website_url)} style={styles.socialBtn}><Ionicons name="globe-outline" size={18} color={theme.text} /></Pressable>}
            </View>
          </View>
        )}

        {/* Quick links */}
        <View style={{ padding: 20, gap: 10, marginTop: 4 }}>
          <Pressable testID="go-applications" onPress={() => router.push("/(tabs)/applications")} style={styles.rowBtn}>
            <Ionicons name="briefcase-outline" size={18} color={theme.text} />
            <Text style={styles.rowBtnTxt}>My applications & gigs</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          <Pressable testID="go-dashboard" onPress={() => router.push("/(tabs)/dashboard")} style={styles.rowBtn}>
            <Ionicons name="stats-chart-outline" size={18} color={theme.text} />
            <Text style={styles.rowBtnTxt}>Insights & analytics</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          {totalListings > 0 && (
            <Pressable testID="my-listings" onPress={() => router.push("/(tabs)/discover")} style={styles.rowBtn}>
              <Ionicons name="grid-outline" size={18} color={theme.text} />
              <Text style={styles.rowBtnTxt}>My listings</Text>
              <View style={styles.countBadge}><Text style={styles.countBadgeTxt}>{totalListings}</Text></View>
              <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
            </Pressable>
          )}
          <Pressable testID="go-subscription" onPress={() => router.push("/subscription")} style={styles.rowBtn}>
            <Ionicons name="diamond-outline" size={18} color={theme.brand} />
            <Text style={styles.rowBtnTxt}>Upgrade to Pro</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          <Pressable testID="logout-btn" onPress={async () => { await logout(); }} style={[styles.rowBtn, { borderColor: theme.error }]}>
            <Ionicons name="log-out-outline" size={18} color={theme.error} />
            <Text style={[styles.rowBtnTxt, { color: theme.error }]}>Sign out</Text>
            <View style={{ width: 18 }} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { height: 130 },
  headerRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 20, marginTop: -36 },
  avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: theme.bg2, borderWidth: 3, borderColor: theme.bg, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarTxt: { ...type.displayMd, color: theme.text },
  name: { ...type.h2, color: theme.text },
  tagline: { ...type.caption, color: theme.brand, marginTop: 4, fontWeight: "600" },
  role: { ...type.caption, color: theme.textDim, marginTop: 4 },
  proTag: { backgroundColor: theme.brand, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  proTagTxt: { ...type.badge, color: "#fff" },
  actionRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 16 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.bg2, borderRadius: theme.radius.pill, paddingVertical: 11, borderWidth: 1, borderColor: theme.border },
  actionBtnTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  switcher: { flexDirection: "row", marginHorizontal: 20, marginTop: 16, backgroundColor: theme.bg2, borderRadius: theme.radius.pill, padding: 4, borderWidth: 1, borderColor: theme.border },
  switchBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: theme.radius.pill },
  switchOn: { backgroundColor: theme.brand },
  switchTxt: { ...type.caption, color: theme.textDim, fontWeight: "600" },
  switchTxtOn: { ...type.caption, color: "#fff", fontWeight: "700" },
  compCard: { marginHorizontal: 20, marginTop: 20, padding: 16, backgroundColor: theme.brandTint, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.brand },
  compTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  compBar: { height: 6, backgroundColor: theme.bg3, borderRadius: 3, marginTop: 10, overflow: "hidden" },
  compBarFill: { height: 6, backgroundColor: theme.brand, borderRadius: 3 },
  suggRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  suggTxt: { ...type.caption, color: theme.textMid },
  statsBar: { flexDirection: "row", marginHorizontal: 20, marginTop: 20, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.border, paddingVertical: 14 },
  stat: { flex: 1, alignItems: "center" },
  statNum: { ...type.titleLg, color: theme.text, fontWeight: "800" },
  statLbl: { ...type.tiny, color: theme.textDim, marginTop: 3 },
  statDiv: { width: 1, backgroundColor: theme.border },
  section: { paddingHorizontal: 20, marginTop: 22 },
  sTitle: { ...type.titleMd, color: theme.text, fontWeight: "700", marginBottom: 8 },
  bio: { ...type.bodySm, color: theme.textMid, lineHeight: 21 },
  count: { ...type.caption, color: theme.textDim },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: theme.bg2, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: theme.border },
  tagTxt: { ...type.caption, color: theme.textMid, fontWeight: "500" },
  tagBrand: { backgroundColor: theme.brandTint, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: theme.brand },
  tagBrandTxt: { ...type.caption, color: theme.brand, fontWeight: "600" },
  price: { ...type.h3, color: theme.brand },
  serviceCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 14, borderWidth: 1, borderColor: theme.border },
  serviceTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  serviceDesc: { ...type.caption, color: theme.textDim, marginTop: 3 },
  serviceDur: { ...type.tiny, color: theme.textDim, marginTop: 4 },
  servicePrice: { ...type.titleMd, color: theme.brand, fontWeight: "800" },
  servicePricing: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  portGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  portItem: { width: "31.5%", aspectRatio: 1, borderRadius: theme.radius.md, overflow: "hidden" },
  portOverlay: { position: "absolute", bottom: 6, left: 6, right: 6, alignItems: "flex-start" },
  portTitle: { ...type.tiny, color: theme.text, fontWeight: "700" },
  socialRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  socialBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  rowBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.border },
  rowBtnTxt: { ...type.bodySm, color: theme.text, fontWeight: "600", flex: 1 },
  countBadge: { backgroundColor: theme.brandTint, borderColor: theme.brand, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.pill },
  countBadgeTxt: { ...type.tiny, color: theme.brand, fontWeight: "700" },
});
