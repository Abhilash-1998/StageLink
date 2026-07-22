import { View, Text, StyleSheet, ScrollView, Image, Pressable, ImageBackground, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { MediaViewer } from "@/src/components/MediaViewer";
import { confirmDelete } from "@/src/utils/confirm";
import { formatDate, formatRelative } from "@/src/utils/date";

export type ProfileTab = "grid" | "posts" | "listings";

/**
 * Shared professional-profile layout. Used by both /(tabs)/profile (own) and
 * /user/[id] (public). The ONLY differences are:
 *   • mode="own"   → Edit / Share buttons, Delete controls on owned items,
 *                    Settings row (logout).
 *   • mode="public" → Follow / Message buttons; no delete controls.
 * Everything else — header, stats bar, sections, tabs, cards — is identical.
 */
type Props = {
  mode: "own" | "public";
  targetUser: any;              // { id, full_name, avatar_url, verified, created_at? }
  profile: any | null;          // { profile: {...}, rating, review_count, followers, following }
  entities?: any | null;        // { gigs, bands, equipment, studios, lessons, posts } — only for "own"
  completion?: any | null;      // { completion, suggestions } — only for "own"
  following?: boolean;          // for "public"
  onFollow?: () => void;        // for "public"
  onEdit?: () => void;          // for "own"
  onLogout?: () => void;        // for "own"
  onDelete?: (path: string) => Promise<void> | void;  // for "own"
};

export function ProfileView({
  mode, targetUser, profile, entities, completion,
  following = false, onFollow, onEdit, onLogout, onDelete,
}: Props) {
  const [tab, setTab] = useState<ProfileTab>("grid");
  const [viewer, setViewer] = useState<{ items: any[]; idx: number } | null>(null);

  const isOwn = mode === "own";
  const u = targetUser || {};
  const p = profile?.profile || {};
  const initials = (u.full_name || "?").split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase();
  const portfolio: any[] = p.portfolio_items || [];
  const services: any[] = p.services || [];
  const posts: any[] = entities?.posts || [];
  const gigs: any[] = entities?.gigs || [];
  const bands: any[] = entities?.bands || [];
  const equipment: any[] = entities?.equipment || [];
  const studios: any[] = entities?.studios || [];
  const lessons: any[] = entities?.lessons || [];
  const totalListings = gigs.length + bands.length + equipment.length + studios.length + lessons.length;
  const pct = completion?.completion ?? 0;

  const openLink = (u2?: string) => u2 && Linking.openURL(u2).catch(() => {});
  const openViewer = (items: any[], idx: number) => setViewer({
    items: items.map(x => ({ uri: x?.media_url, type: x?.media_type, title: x?.title })).filter(x => x.uri),
    idx,
  });

  const del = async (path: string, label = "this item") => {
    if (!isOwn || !onDelete) return;
    if (!(await confirmDelete(`Delete ${label}?`, "This action cannot be undone."))) return;
    await onDelete(path);
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: isOwn ? 130 : 60 }}>
        {/* Cover */}
        <View style={styles.cover}>
          {p.cover_url
            ? <ImageBackground source={{ uri: p.cover_url }} style={StyleSheet.absoluteFill}>
                <LinearGradient colors={["transparent", "rgba(9,9,11,0.9)"]} style={StyleSheet.absoluteFill} />
              </ImageBackground>
            : <LinearGradient colors={[theme.brand2, theme.bg]} style={StyleSheet.absoluteFill} />
          }
          {!isOwn && (
            <SafeAreaView edges={["top"]} style={styles.coverNav}>
              <Pressable testID="user-back" onPress={() => router.back()} style={styles.circleBtn}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </Pressable>
            </SafeAreaView>
          )}
        </View>

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            {u.avatar_url ? <Image source={{ uri: u.avatar_url }} style={styles.avatarImg} /> :
              <Text style={styles.avatarTxt}>{initials}</Text>}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={styles.name}>{u.full_name || "—"}</Text>
              {u.verified && <Ionicons name="checkmark-circle" size={16} color={theme.brand} />}
            </View>
            {p.tagline ? <Text style={styles.tagline}>{p.tagline}</Text> :
              <Text style={styles.role}>{p.city || "—"}{p.experience_years ? ` · ${p.experience_years}y` : ""}</Text>}
          </View>
        </View>

        {/* Actions — Edit + Settings for own; Follow + Message for public */}
        <View style={styles.actionRow}>
          {isOwn ? (
            <>
              <Pressable testID="edit-profile-cta" onPress={onEdit} style={[styles.actionBtn, { backgroundColor: theme.brand }]}>
                <Ionicons name="create-outline" size={15} color="#fff" />
                <Text style={[styles.actionBtnTxt, { color: "#fff" }]}>Edit profile</Text>
              </Pressable>
              <Pressable testID="settings-cta" onPress={() => router.push("/settings")} style={styles.actionBtn}>
                <Ionicons name="settings-outline" size={15} color={theme.text} />
                <Text style={styles.actionBtnTxt}>Settings</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable testID="user-follow" onPress={onFollow} style={[styles.actionBtn, { backgroundColor: following ? theme.bg2 : theme.brand }]}>
                <Ionicons name={following ? "checkmark" : "add"} size={15} color={following ? theme.text : "#fff"} />
                <Text style={[styles.actionBtnTxt, { color: following ? theme.text : "#fff" }]}>{following ? "Following" : "Follow"}</Text>
              </Pressable>
              <Pressable testID="user-message" onPress={() => u.id && router.push(`/chat/${u.id}`)} style={styles.actionBtn}>
                <Ionicons name="paper-plane-outline" size={15} color={theme.text} />
                <Text style={styles.actionBtnTxt}>Message</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Stats bar — Rating and Reviews are informational; Followers/Following
            open the shared /user/[id]/connections screen. */}
        <View style={styles.statsBar}>
          <View style={styles.stat}><Text style={styles.statNum}>{profile?.rating ?? "0.0"}</Text><Text style={styles.statLbl}>★ Rating</Text></View>
          <View style={styles.statDiv} />
          <View style={styles.stat}><Text style={styles.statNum}>{profile?.review_count ?? 0}</Text><Text style={styles.statLbl}>Reviews</Text></View>
          <View style={styles.statDiv} />
          <Pressable testID="stat-followers" onPress={() => u.id && router.push(`/user/${u.id}/connections?tab=followers`)} style={styles.stat}>
            <Text style={styles.statNum}>{profile?.followers ?? 0}</Text><Text style={styles.statLbl}>Followers</Text>
          </Pressable>
          <View style={styles.statDiv} />
          <Pressable testID="stat-following" onPress={() => u.id && router.push(`/user/${u.id}/connections?tab=following`)} style={styles.stat}>
            <Text style={styles.statNum}>{profile?.following ?? 0}</Text><Text style={styles.statLbl}>Following</Text>
          </Pressable>
        </View>

        {/* Completion — own only */}
        {isOwn && pct < 100 && completion && (
          <Pressable testID="completion-card" onPress={onEdit} style={styles.compCard}>
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

        {p.bio && (<View style={styles.section}><Text style={styles.sTitle}>About</Text><Text style={styles.bio}>{p.bio}</Text></View>)}

        {(p.professions || []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Professions</Text>
            <View style={styles.chipRow}>{p.professions.map((g: string) => <View key={g} style={styles.tagBrand}><Text style={styles.tagBrandTxt}>{g}</Text></View>)}</View>
          </View>
        )}

        {((p.genres || []).length > 0 || (p.instruments || []).length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Style</Text>
            <View style={styles.chipRow}>
              {(p.genres || []).map((g: string) => <View key={`g-${g}`} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}
              {(p.instruments || []).map((g: string) => <View key={`i-${g}`} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}
            </View>
          </View>
        )}

        {(p.skills || []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Skills</Text>
            <View style={styles.chipRow}>{p.skills.map((g: string) => <View key={g} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}</View>
          </View>
        )}

        {p.pricing_per_hour > 0 && !p.hide_pricing && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Base rate</Text>
            <Text style={styles.price}>₹{Number(p.pricing_per_hour).toLocaleString("en-IN")} / hour</Text>
          </View>
        )}

        {services.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Services</Text>
            <View style={{ gap: 10, marginTop: 4 }}>
              {services.map((s: any) => (
                <View key={s.id} style={styles.serviceCard} testID={`service-${s.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceTitle}>{s.title}</Text>
                    <Text style={styles.serviceDesc} numberOfLines={2}>{s.description}</Text>
                    {s.duration && <Text style={styles.serviceDur}>{s.duration}</Text>}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    {typeof s.price === "number" && <Text style={styles.servicePrice}>₹{s.price.toLocaleString("en-IN")}</Text>}
                    {s.pricing_type && <Text style={styles.servicePricing}>{String(s.pricing_type).replace("_", " ")}</Text>}
                    {isOwn && (
                      <Pressable testID={`svc-del-${s.id}`} onPress={() => del(`/profile/services/${s.id}`, "this service")} style={styles.delMini}>
                        <Ionicons name="trash-outline" size={13} color={theme.error} />
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Media / Posts / Listings tabs — IDENTICAL layout for own & public.
            Delete controls only render when isOwn — the layout itself is the same. */}
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
                <Pressable key={it.id || i} testID={`media-${it.id}`} onPress={() => openViewer(portfolio, i)} style={styles.mediaTile}>
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
              {posts.map((post: any) => (
                <View key={post.id} style={styles.postCard} testID={`own-post-${post.id}`}>
                  <View style={styles.postHead}>
                    <Text style={styles.postDate}>{formatRelative(post.created_at)}</Text>
                    {isOwn && (
                      <Pressable testID={`post-del-${post.id}`} onPress={() => del(`/posts/${post.id}`, "this post")} style={styles.delMini}>
                        <Ionicons name="trash-outline" size={13} color={theme.error} />
                      </Pressable>
                    )}
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
              {totalListings === 0 && <Text style={styles.emptyLine}>{isOwn ? "No listings yet — create one from the + tab." : "No listings yet."}</Text>}
              {gigs.map((g: any) => (
                <Pressable key={g.id} onPress={() => router.push(`/gig/${g.id}`)} style={styles.listRow} testID={`list-gig-${g.id}`}>
                  <View style={styles.listIcon}><Ionicons name="megaphone" size={16} color={theme.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{g.title}</Text>
                    <Text style={styles.listMeta}>Gig · {g.city} · {formatDate(g.date)}</Text>
                  </View>
                  {isOwn && (
                    <Pressable testID={`gig-del-${g.id}`} onPress={() => del(`/gigs/${g.id}`, "this gig")} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  )}
                </Pressable>
              ))}
              {bands.map((b: any) => (
                <View key={b.id} style={styles.listRow} testID={`list-band-${b.id}`}>
                  <View style={styles.listIcon}><Ionicons name="people" size={16} color={theme.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{b.name}</Text>
                    <Text style={styles.listMeta}>Band · {b.city}</Text>
                  </View>
                  {isOwn && (
                    <Pressable testID={`band-del-${b.id}`} onPress={() => del(`/bands/${b.id}`, "this band")} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  )}
                </View>
              ))}
              {equipment.map((e: any) => (
                <View key={e.id} style={styles.listRow} testID={`list-eq-${e.id}`}>
                  <View style={styles.listIcon}><Ionicons name="cube" size={16} color={theme.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{e.title}</Text>
                    <Text style={styles.listMeta}>Equipment · ₹{Number(e.price || 0).toLocaleString("en-IN")}{e.listing_type === "rent" ? "/day" : ""}</Text>
                  </View>
                  {isOwn && (
                    <Pressable testID={`eq-del-${e.id}`} onPress={() => del(`/equipment/${e.id}`, "this listing")} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  )}
                </View>
              ))}
              {studios.map((s: any) => (
                <View key={s.id} style={styles.listRow} testID={`list-studio-${s.id}`}>
                  <View style={styles.listIcon}><Ionicons name="mic" size={16} color={theme.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{s.name}</Text>
                    <Text style={styles.listMeta}>Studio · {s.city} · ₹{Number(s.hourly_rate || 0).toLocaleString("en-IN")}/hr</Text>
                  </View>
                  {isOwn && (
                    <Pressable testID={`studio-del-${s.id}`} onPress={() => del(`/studios/${s.id}`, "this studio")} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  )}
                </View>
              ))}
              {lessons.map((l: any) => (
                <View key={l.id} style={styles.listRow} testID={`list-lesson-${l.id}`}>
                  <View style={styles.listIcon}><Ionicons name="school" size={16} color={theme.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{l.title}</Text>
                    <Text style={styles.listMeta}>Lesson · {l.subject} · ₹{Number(l.price_per_hour || 0).toLocaleString("en-IN")}/hr</Text>
                  </View>
                  {isOwn && (
                    <Pressable testID={`lesson-del-${l.id}`} onPress={() => del(`/lessons/${l.id}`, "this lesson")} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Social */}
        {(p.instagram_url || p.youtube_url || p.spotify_url || p.website_url || p.linkedin_url || p.soundcloud_url) && (
          <View style={styles.section}>
            <Text style={styles.sTitle}>Find on</Text>
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

        {/* Joined date — shown identically on both own & public views */}
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
  cover: { height: 130 },
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
  joined: { ...type.tiny, color: theme.textDim, textAlign: "center", marginTop: 24, marginBottom: 8 },
});
