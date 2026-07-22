import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Pressable, ActivityIndicator, ImageBackground, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { MediaViewer } from "@/src/components/MediaViewer";
import { confirmDelete } from "@/src/utils/confirm";
import { formatDate, formatRelative } from "@/src/utils/date";

/**
 * Unified professional profile — StageLink v1.
 * A user is a professional, not a role. This screen aggregates every entity
 * they own (portfolio, services, equipment, studios, bands, lessons, gigs,
 * community posts) into a single cohesive experience.
 * No role switch, no PRO/premium UI (payment features hidden for v1).
 */
export default function ProfileTab() {
  const { user, fetchApi, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [completion, setCompletion] = useState<any>(null);
  const [entities, setEntities] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"grid" | "posts" | "listings">("grid");
  const [viewer, setViewer] = useState<{ items: any[]; idx: number } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [p, c, e] = await Promise.all([
        fetchApi(`/profile/musician/${user.id}`).catch(() => null),
        fetchApi("/profile/completion").catch(() => null),
        fetchApi("/entities/mine").catch(() => null),
      ]);
      setProfile(p); setCompletion(c); setEntities(e);
    } finally { setLoading(false); }
  }, [fetchApi, user]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const removeEntity = async (path: string) => {
    if (!(await confirmDelete())) return;
    try { await fetchApi(path, { method: "DELETE" }); await load(); }
    catch (e: any) { /* swallow; UI still refreshes */ await load(); }
  };

  if (loading) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  const p = profile?.profile || {};
  const initials = user?.full_name?.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const portfolio: any[] = p.portfolio_items || [];
  const services: any[] = p.services || [];
  const posts: any[] = entities?.posts || [];
  const gigs: any[] = entities?.gigs || [];
  const bands: any[] = entities?.bands || [];
  const equipment: any[] = entities?.equipment || [];
  const studios: any[] = entities?.studios || [];
  const lessons: any[] = entities?.lessons || [];

  const photos = portfolio.filter(x => x.media_type === "image");
  const videos = portfolio.filter(x => x.media_type === "video");
  const totalListings = gigs.length + bands.length + equipment.length + studios.length + lessons.length;
  const pct = completion?.completion ?? 0;

  const openLink = (u?: string) => u && Linking.openURL(u).catch(() => {});
  const openViewer = (items: any[], idx: number) => setViewer({
    items: items.map(x => ({ uri: x.media_url, type: x.media_type, title: x.title })),
    idx,
  });

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

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            {user?.avatar_url ? <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} /> :
              <Text style={styles.avatarTxt}>{initials}</Text>}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={styles.name}>{user?.full_name}</Text>
              {user?.verified && <Ionicons name="checkmark-circle" size={16} color={theme.brand} />}
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

        {/* Stats bar — Instagram-style Followers / Following / Reviews */}
        <View style={styles.statsBar}>
          <View style={styles.stat}><Text style={styles.statNum}>{profile?.rating ?? "0.0"}</Text><Text style={styles.statLbl}>★ Rating</Text></View>
          <View style={styles.statDiv} />
          <View style={styles.stat}><Text style={styles.statNum}>{profile?.review_count ?? 0}</Text><Text style={styles.statLbl}>Reviews</Text></View>
          <View style={styles.statDiv} />
          <View style={styles.stat}><Text style={styles.statNum}>{profile?.followers ?? 0}</Text><Text style={styles.statLbl}>Followers</Text></View>
          <View style={styles.statDiv} />
          <View style={styles.stat}><Text style={styles.statNum}>{profile?.following ?? 0}</Text><Text style={styles.statLbl}>Following</Text></View>
        </View>

        {/* Completion */}
        {pct < 100 && completion && (
          <Pressable testID="completion-card" onPress={() => router.push("/profile/edit")} style={styles.compCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.compTitle}>Profile {pct}% complete</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.brand} />
            </View>
            <View style={styles.compBar}><View style={[styles.compBarFill, { width: `${pct}%` }]} /></View>
            {completion.suggestions?.slice(0, 2).map((s: any) => (
              <View key={s.field} style={styles.suggRow}>
                <Ionicons name="add-circle-outline" size={14} color={theme.brand} />
                <Text style={styles.suggTxt}>{s.prompt}</Text>
              </View>
            ))}
          </Pressable>
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

        {/* Style */}
        {(p.genres?.length > 0 || p.instruments?.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Style</Text>
            <View style={styles.chipRow}>
              {p.genres?.map((g: string) => <View key={`g-${g}`} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}
              {p.instruments?.map((g: string) => <View key={`i-${g}`} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}
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

        {/* Base rate — informational only, not transactional */}
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
                    <Text style={styles.servicePrice}>₹{s.price?.toLocaleString("en-IN")}</Text>
                    <Text style={styles.servicePricing}>{s.pricing_type?.replace("_", " ")}</Text>
                    <Pressable testID={`svc-del-${s.id}`} onPress={() => removeEntity(`/profile/services/${s.id}`)} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={13} color={theme.error} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Media tabs — Grid / Videos / Posts */}
        {(photos.length > 0 || videos.length > 0 || posts.length > 0) && (
          <View style={styles.section}>
            <View style={styles.tabRow}>
              <Pressable testID="tab-grid" onPress={() => setTab("grid")} style={[styles.tabBtn, tab === "grid" && styles.tabBtnOn]}>
                <Ionicons name="grid-outline" size={16} color={tab === "grid" ? theme.text : theme.textDim} />
                <Text style={[styles.tabTxt, tab === "grid" && styles.tabTxtOn]}>Media ({portfolio.length})</Text>
              </Pressable>
              <Pressable testID="tab-posts" onPress={() => setTab("posts")} style={[styles.tabBtn, tab === "posts" && styles.tabBtnOn]}>
                <Ionicons name="chatbubbles-outline" size={16} color={tab === "posts" ? theme.text : theme.textDim} />
                <Text style={[styles.tabTxt, tab === "posts" && styles.tabTxtOn]}>Posts ({posts.length})</Text>
              </Pressable>
              <Pressable testID="tab-listings" onPress={() => setTab("listings")} style={[styles.tabBtn, tab === "listings" && styles.tabBtnOn]}>
                <Ionicons name="albums-outline" size={16} color={tab === "listings" ? theme.text : theme.textDim} />
                <Text style={[styles.tabTxt, tab === "listings" && styles.tabTxtOn]}>Listings ({totalListings})</Text>
              </Pressable>
            </View>

            {tab === "grid" && (
              <View style={styles.mediaGrid}>
                {portfolio.map((it, i) => (
                  <Pressable key={it.id} testID={`media-${it.id}`} onPress={() => openViewer(portfolio, i)} style={styles.mediaTile}>
                    <Image source={{ uri: it.thumbnail_url || it.media_url }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                    {it.media_type === "video" && (
                      <View style={styles.playBadge}><Ionicons name="play-circle" size={26} color="#fff" /></View>
                    )}
                  </Pressable>
                ))}
                {portfolio.length === 0 && <Text style={styles.emptyLine}>No media yet.</Text>}
              </View>
            )}

            {tab === "posts" && (
              <View style={{ gap: 10, marginTop: 8 }}>
                {posts.length === 0 && <Text style={styles.emptyLine}>No community posts yet.</Text>}
                {posts.map(post => (
                  <View key={post.id} style={styles.postCard} testID={`own-post-${post.id}`}>
                    <View style={styles.postHead}>
                      <Text style={styles.postDate}>{formatRelative(post.created_at)}</Text>
                      <Pressable testID={`post-del-${post.id}`} onPress={() => removeEntity(`/posts/${post.id}`)} style={styles.delMini}>
                        <Ionicons name="trash-outline" size={13} color={theme.error} />
                      </Pressable>
                    </View>
                    <Text style={styles.postTxt} numberOfLines={4}>{post.text}</Text>
                    {post.media_url && <Image source={{ uri: post.media_url }} style={styles.postThumb} />}
                    <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
                      <Text style={styles.postMeta}>❤ {post.like_count || 0}</Text>
                      <Text style={styles.postMeta}>💬 {post.comment_count || 0}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {tab === "listings" && (
              <View style={{ gap: 10, marginTop: 8 }}>
                {totalListings === 0 && <Text style={styles.emptyLine}>No listings yet — create one from the + tab.</Text>}
                {gigs.map((g: any) => (
                  <Pressable key={g.id} onPress={() => router.push(`/gig/${g.id}`)} style={styles.listRow} testID={`list-gig-${g.id}`}>
                    <View style={styles.listIcon}><Ionicons name="megaphone" size={16} color={theme.brand} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{g.title}</Text>
                      <Text style={styles.listMeta}>Gig · {g.city} · {formatDate(g.date)}</Text>
                    </View>
                    <Pressable testID={`gig-del-${g.id}`} onPress={() => removeEntity(`/gigs/${g.id}`)} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  </Pressable>
                ))}
                {bands.map((b: any) => (
                  <View key={b.id} style={styles.listRow} testID={`list-band-${b.id}`}>
                    <View style={styles.listIcon}><Ionicons name="people" size={16} color={theme.brand} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{b.name}</Text>
                      <Text style={styles.listMeta}>Band · {b.city}</Text>
                    </View>
                    <Pressable testID={`band-del-${b.id}`} onPress={() => removeEntity(`/bands/${b.id}`)} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  </View>
                ))}
                {equipment.map((e: any) => (
                  <View key={e.id} style={styles.listRow} testID={`list-eq-${e.id}`}>
                    <View style={styles.listIcon}><Ionicons name="cube" size={16} color={theme.brand} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{e.title}</Text>
                      <Text style={styles.listMeta}>Equipment · ₹{e.price?.toLocaleString("en-IN")}{e.listing_type === "rent" ? "/day" : ""}</Text>
                    </View>
                    <Pressable testID={`eq-del-${e.id}`} onPress={() => removeEntity(`/equipment/${e.id}`)} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  </View>
                ))}
                {studios.map((s: any) => (
                  <View key={s.id} style={styles.listRow} testID={`list-studio-${s.id}`}>
                    <View style={styles.listIcon}><Ionicons name="mic" size={16} color={theme.brand} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{s.name}</Text>
                      <Text style={styles.listMeta}>Studio · {s.city} · ₹{s.hourly_rate?.toLocaleString("en-IN")}/hr</Text>
                    </View>
                    <Pressable testID={`studio-del-${s.id}`} onPress={() => removeEntity(`/studios/${s.id}`)} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  </View>
                ))}
                {lessons.map((l: any) => (
                  <View key={l.id} style={styles.listRow} testID={`list-lesson-${l.id}`}>
                    <View style={styles.listIcon}><Ionicons name="school" size={16} color={theme.brand} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{l.title}</Text>
                      <Text style={styles.listMeta}>Lesson · {l.subject} · ₹{l.price_per_hour?.toLocaleString("en-IN")}/hr</Text>
                    </View>
                    <Pressable testID={`lesson-del-${l.id}`} onPress={() => removeEntity(`/lessons/${l.id}`)} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
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
            <Text style={styles.rowBtnTxt}>Applications & gigs</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          <Pressable testID="go-dashboard" onPress={() => router.push("/(tabs)/dashboard")} style={styles.rowBtn}>
            <Ionicons name="stats-chart-outline" size={18} color={theme.text} />
            <Text style={styles.rowBtnTxt}>Insights</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          <Pressable testID="logout-btn" onPress={async () => { await logout(); }} style={[styles.rowBtn, { borderColor: theme.error }]}>
            <Ionicons name="log-out-outline" size={18} color={theme.error} />
            <Text style={[styles.rowBtnTxt, { color: theme.error }]}>Sign out</Text>
            <View style={{ width: 18 }} />
          </Pressable>
        </View>
      </ScrollView>

      {viewer && (
        <MediaViewer visible items={viewer.items} initialIndex={viewer.idx} onClose={() => setViewer(null)} />
      )}
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
  actionRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 16 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.bg2, borderRadius: theme.radius.pill, paddingVertical: 11, borderWidth: 1, borderColor: theme.border },
  actionBtnTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  statsBar: { flexDirection: "row", marginHorizontal: 20, marginTop: 20, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.border, paddingVertical: 14 },
  stat: { flex: 1, alignItems: "center" },
  statNum: { ...type.titleLg, color: theme.text, fontWeight: "800" },
  statLbl: { ...type.tiny, color: theme.textDim, marginTop: 3 },
  statDiv: { width: 1, backgroundColor: theme.border },
  compCard: { marginHorizontal: 20, marginTop: 20, padding: 16, backgroundColor: theme.brandTint, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.brand },
  compTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  compBar: { height: 6, backgroundColor: theme.bg3, borderRadius: 3, marginTop: 10, overflow: "hidden" },
  compBarFill: { height: 6, backgroundColor: theme.brand, borderRadius: 3 },
  suggRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  suggTxt: { ...type.caption, color: theme.textMid },
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
  serviceDur: { ...type.tiny, color: theme.textDim, marginTop: 4 },
  servicePrice: { ...type.titleMd, color: theme.brand, fontWeight: "800" },
  servicePricing: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  tabRow: { flexDirection: "row", backgroundColor: theme.bg2, borderRadius: theme.radius.pill, padding: 4, borderWidth: 1, borderColor: theme.border, marginBottom: 12 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: theme.radius.pill },
  tabBtnOn: { backgroundColor: theme.brand },
  tabTxt: { ...type.tiny, color: theme.textDim, fontWeight: "700" },
  tabTxtOn: { color: "#fff" },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
  mediaTile: { width: "32.7%", aspectRatio: 1, backgroundColor: theme.bg2, overflow: "hidden" },
  playBadge: { position: "absolute", top: "50%", left: "50%", marginLeft: -13, marginTop: -13 },
  emptyLine: { ...type.caption, color: theme.textDim, textAlign: "center", paddingVertical: 20 },
  postCard: { backgroundColor: theme.bg2, borderRadius: theme.radius.md, padding: 12, borderWidth: 1, borderColor: theme.border },
  postHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  postDate: { ...type.tiny, color: theme.textDim },
  postTxt: { ...type.bodySm, color: theme.text, lineHeight: 20 },
  postThumb: { width: "100%", height: 160, borderRadius: theme.radius.md, marginTop: 8 },
  postMeta: { ...type.tiny, color: theme.textDim },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border },
  listIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center" },
  listTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  listMeta: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  delMini: { padding: 8, borderRadius: theme.radius.md, backgroundColor: theme.bg3 },
  socialRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  socialBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  rowBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.border },
  rowBtnTxt: { ...type.bodySm, color: theme.text, fontWeight: "600", flex: 1 },
});
