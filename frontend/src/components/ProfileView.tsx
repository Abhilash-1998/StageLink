import { View, Text, StyleSheet, ScrollView, Image, Pressable, ImageBackground, Linking, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { MediaViewer } from "@/src/components/MediaViewer";
import { SafeMediaImage } from "@/src/components/SafeMediaImage";
import { confirmDelete } from "@/src/utils/confirm";
import { formatDate } from "@/src/utils/date";
import { formatBaseRate, pricingUnitLabel } from "@/src/utils/pricing";
import { openPhoneCall } from "@/src/utils/phone";
import { DEFAULT_COVERS } from "@/src/utils/covers";


function portfolioHostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("drive.google")) return "Google Drive";
    if (host.includes("dropbox")) return "Dropbox";
    if (host.includes("youtube") || host.includes("youtu.be")) return "YouTube";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("soundcloud")) return "SoundCloud";
    return host || "Link";
  } catch {
    return "Link";
  }
}

/**
 * ProfileView — the ONE reusable professional profile.
 *
 * The same component renders your own profile and any other user's profile.
 * Layout, spacing, sections, cards, and typography are IDENTICAL for both.
 * The only differences are the action buttons (rendered from `permissions`)
 * and Edit/Delete affordances on owned content.
 *
 * Data contract: pass the unified payload from GET /api/profile/{userId}
 * (fields: user, profile, stats, entities, reviews, upcoming_events,
 *  achievements, community_activity, permissions, viewer_relationship).
 */
export type ProfilePayload = {
  user: any;
  profile: any;
  stats: { followers: number; following: number; completed_gigs: number; reviews_count: number; rating: number; reliability: number };
  entities: { posts: any[]; posts_total?: number; gigs: any[]; bands: any[]; equipment: any[]; studios: any[]; lessons: any[] };
  reviews: any[];
  upcoming_events: any[];
  achievements: { key: string; label: string; icon: any }[];
  community_activity: {
    posts_count: number;
    likes_received?: number;
    comments_received?: number;
    likes_given: number;
    comments_given: number;
  };
  permissions: Record<string, boolean>;
  viewer_relationship: { is_self: boolean; is_following: boolean; viewer_id: string | null };
};

type Props = {
  data: ProfilePayload;
  onDelete?: (path: string) => Promise<void> | void;
  onFollowToggle?: (newState: boolean) => Promise<void> | void;
};

export function ProfileView({ data, onDelete, onFollowToggle }: Props) {
  const [viewer, setViewer] = useState<{ items: any[]; idx: number } | null>(null);
  const [following, setFollowing] = useState<boolean>(data.viewer_relationship.is_following);
  const [reportedOpen, setReportedOpen] = useState(false);

  const u = data.user || {};
  const p = data.profile || {};
  const perms = data.permissions || {};
  const canModifyContent = !!perms.can_delete_content;
  // Edit writes avatar to musician profile; some older rows only have it there.
  const avatarUri = (u.avatar_url || p.avatar_url || "").trim() || null;
  const coverUri = (p.cover_url || "").trim() || null;

  const initials = (u.full_name || "?").split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase();
  const portfolio: any[] = p.portfolio_items || [];
  const services: any[] = p.services || [];
  const { posts, bands, equipment, studios, lessons } = data.entities;
  const postsTotal = data.entities.posts_total ?? data.community_activity?.posts_count ?? posts.length;
  const stats = data.stats;
  const PROFILE_POST_PREVIEW = 9;
  const ca = {
    posts_count: data.community_activity?.posts_count ?? postsTotal,
    likes_received:
      data.community_activity?.likes_received ??
      data.community_activity?.likes_given ??
      0,
    comments_received:
      data.community_activity?.comments_received ??
      data.community_activity?.comments_given ??
      0,
  };

  const openLink = (url?: string) => url && Linking.openURL(url).catch(() => {});
  const openMediaViewer = (items: any[], idx: number) => setViewer({
    items: items.map(x => ({ uri: x?.media_url, type: x?.media_type, title: x?.title })).filter(x => x.uri),
    idx,
  });

  const shareProfile = async () => {
    const name = u.full_name || "Musician";
    const bits = [name, p.tagline, p.city].filter(Boolean).join(" · ");
    const lines = [`${bits || name} on gigZee`];
    if (portfolio.length > 0 && portfolio[0]?.media_url) {
      lines.push(`Portfolio: ${portfolio[0].media_url}`);
    }
    try {
      await Share.share({
        title: `${name} on gigZee`,
        message: lines.join("\n"),
      });
    } catch { /* user cancelled */ }
  };

  const sharePortfolioLink = async (it: any) => {
    const title = it?.title || "Portfolio link";
    const url = String(it?.media_url || "").trim();
    if (!url) return;
    try {
      await Share.share({
        title,
        message: `${title}\n${url}`,
        url,
      });
    } catch { /* user cancelled */ }
  };

  const del = async (path: string, label = "this item") => {
    if (!canModifyContent || !onDelete) return;
    if (!(await confirmDelete(`Delete ${label}?`, "This action cannot be undone."))) return;
    await onDelete(path);
  };

  const toggleFollow = async () => {
    const next = !following;
    setFollowing(next);
    try { await onFollowToggle?.(next); } catch { setFollowing(!next); }
  };

  const report = () => {
    setReportedOpen(true);
    setTimeout(() => setReportedOpen(false), 1800);
  };

  // Action buttons — order & count kept consistent (2 primary + chips)
  // Own: [Edit Profile] [Settings]      · chips: Create post / Share
  // Public: [Follow] [Message]          · chips: Hire / Share · Report at bottom
  const primaryActions = perms.can_edit
    ? [
      { key: "edit", label: "Edit profile", icon: "create-outline", accent: true, onPress: () => router.push("/profile/edit"), testID: "edit-profile-cta" },
      { key: "settings", label: "Settings", icon: "settings-outline", onPress: () => router.push("/settings"), testID: "settings-cta" },
    ]
    : [
      { key: "follow", label: following ? "Following" : "Follow", icon: following ? "checkmark" : "add", accent: !following, onPress: toggleFollow, testID: "user-follow" },
      { key: "message", label: "Message", icon: "paper-plane-outline", onPress: () => u.id && router.push(`/chat/${u.id}`), testID: "user-message" },
    ];

  const overflowActions: { key: string; label: string; icon: any; onPress: () => void; testID: string; danger?: boolean }[] = [];
  if (perms.can_create_post) overflowActions.push({ key: "create", label: "Create post", icon: "add-circle-outline", onPress: () => router.push("/(tabs)/create"), testID: "action-create-post" });
  if (perms.can_edit) overflowActions.push({ key: "availability", label: "Set availability", icon: "calendar-outline", onPress: () => router.push("/profile/availability"), testID: "action-availability" });
  if (perms.can_hire) overflowActions.push({ key: "hire", label: "Hire / Invite", icon: "briefcase-outline", onPress: () => router.push("/gig/new"), testID: "action-hire" });
  overflowActions.push({ key: "share", label: "Share profile", icon: "share-outline", onPress: shareProfile, testID: "action-share-profile" });

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        {/* ─── Header — cover + gradient + centered avatar + name + badges ─── */}
        <View style={styles.cover}>
          {coverUri
            ? <ImageBackground source={{ uri: coverUri }} style={StyleSheet.absoluteFill}>
                <LinearGradient colors={["rgba(9,9,11,0.15)", "rgba(9,9,11,0.85)", theme.bg]} locations={[0, 0.65, 1]} style={StyleSheet.absoluteFill} />
              </ImageBackground>
            : <LinearGradient colors={[theme.brand2, theme.brand, theme.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
          }
          {!perms.can_edit && (
            <SafeAreaView edges={["top"]} style={styles.coverNav}>
              <Pressable testID="user-back" onPress={() => router.back()} style={styles.circleBtn}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </Pressable>
            </SafeAreaView>
          )}
        </View>

        <View style={styles.headerBlock}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImg} /> :
                <Text style={styles.avatarTxt}>{initials}</Text>}
            </View>
          </View>
          <View style={styles.identity}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={styles.name}>{u.full_name || "—"}</Text>
              {u.verified && <Ionicons name="checkmark-circle" size={16} color={theme.brand} testID="verified-badge" />}
            </View>
            <Text style={styles.tagline} numberOfLines={2}>
              {[
                (p.professions || [])[0],
                p.tagline,
                p.city ? `${p.city}${p.country ? `, ${p.country}` : ""}` : null,
              ].filter(Boolean).join(" · ") || "Professional"}
            </Text>
          </View>
        </View>

        {/* ─── Action buttons ─── */}
        <View style={styles.actionRow}>
          {primaryActions.map((a) => (
            <Pressable key={a.key} testID={a.testID}
              onPress={a.onPress}
              style={[styles.actionBtn, a.accent && { backgroundColor: theme.brand, borderColor: theme.brand }]}>
              <Ionicons name={a.icon as any} size={14} color={a.accent ? "#fff" : theme.text} />
              <Text style={[styles.actionBtnTxt, a.accent && { color: "#fff" }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        {overflowActions.length > 0 && (
          <View style={styles.overflowRow}>
            {overflowActions.map(a => (
              <Pressable key={a.key} testID={a.testID} onPress={a.onPress} style={styles.overflowBtn}>
                <Ionicons name={a.icon} size={14} color={a.danger ? theme.error : theme.textMid} />
                <Text style={[styles.overflowTxt, a.danger && { color: theme.error }]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ─── Stats — compact inline ─── */}
        <View style={styles.statsRow}>
          <Pressable testID="stat-followers" onPress={() => u.id && router.push(`/user/${u.id}/connections?tab=followers`)} style={styles.statItem}>
            <Text style={styles.statNum}>{stats.followers}</Text>
            <Text style={styles.statLbl}>Followers</Text>
          </Pressable>
          <View style={styles.statDivider} />
          <Pressable testID="stat-following" onPress={() => u.id && router.push(`/user/${u.id}/connections?tab=following`)} style={styles.statItem}>
            <Text style={styles.statNum}>{stats.following}</Text>
            <Text style={styles.statLbl}>Following</Text>
          </Pressable>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{stats.completed_gigs}</Text>
            <Text style={styles.statLbl}>Gigs</Text>
          </View>
        </View>

        {/* ─── Bio ─── */}
        <Section title="About">
          {p.bio ? <Text style={styles.body}>{p.bio}</Text> : <Empty>No bio yet.</Empty>}
          {/* Own profile: show your number. Others: never show digits (Call stays on gig/listing if public). */}
          {perms.can_edit && p.phone ? (
            <Pressable
              testID="profile-phone"
              onPress={() => openPhoneCall(p.phone)}
              style={styles.phoneRow}
            >
              <Ionicons name="call-outline" size={16} color={theme.brand} />
              <Text style={styles.phoneTxt}>{p.phone}</Text>
            </Pressable>
          ) : null}
        </Section>

        {/* ─── Portfolio links ─── */}
        <Section title="Portfolio" count={portfolio.length}>
          {portfolio.length > 0 ? (
            <View style={{ gap: 8 }}>
              {portfolio.map((it, i) => (
                <Pressable
                  key={it.id || i}
                  testID={`media-${it.id}`}
                  onPress={() => openLink(it.media_url)}
                  style={styles.card}
                >
                  <View style={styles.listIcon}>
                    <Ionicons name="link-outline" size={18} color={theme.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{it.title || "Portfolio link"}</Text>
                    <Text style={styles.listMeta} numberOfLines={1}>{portfolioHostLabel(it.media_url || "")}</Text>
                  </View>
                  <Pressable
                    testID={`share-port-${it.id || i}`}
                    hitSlop={10}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      sharePortfolioLink(it);
                    }}
                    style={styles.delMini}
                  >
                    <Ionicons name="share-outline" size={16} color={theme.textMid} />
                  </Pressable>
                  <Ionicons name="open-outline" size={16} color={theme.textDim} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Empty>
              {perms.can_edit
                ? "No portfolio links yet. Add a Drive / YouTube link in Edit profile."
                : "No portfolio links yet."}
            </Empty>
          )}
        </Section>

        {/* ─── Experience ─── */}
        <Section title="Experience">
          {p.experience_years ? (
            <Text style={styles.body}>{p.experience_years} years performing professionally{p.equipment_experience ? ` · ${p.equipment_experience}` : ""}.</Text>
          ) : <Empty>No experience details yet.</Empty>}
        </Section>

        {/* ─── Genres ─── */}
        <Section title="Genres">
          {(p.genres || []).length > 0 ? (
            <View style={styles.chipRow}>
              {p.genres.map((g: string) => <View key={g} style={styles.tagBrand}><Text style={styles.tagBrandTxt}>{g}</Text></View>)}
            </View>
          ) : <Empty>No genres added yet.</Empty>}
        </Section>

        {/* ─── Skills ─── */}
        <Section title="Skills">
          {((p.skills || []).length > 0 || (p.instruments || []).length > 0) ? (
            <View style={styles.chipRow}>
              {(p.instruments || []).map((g: string) => <View key={`i-${g}`} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}
              {(p.skills || []).map((g: string) => <View key={`s-${g}`} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}
            </View>
          ) : <Empty>No skills added yet.</Empty>}
        </Section>

        {/* ─── Base rate / Services ─── */}
        {(p.pricing_per_hour > 0 && !p.hide_pricing) || services.length > 0 ? (
          <Section title="Services">
            {p.pricing_per_hour > 0 && !p.hide_pricing && (
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.priceLg}>{formatBaseRate(p.pricing_per_hour, p.pricing_type || "per_hour")}</Text>
                <Text style={styles.body}>Base rate · {pricingUnitLabel(p.pricing_type || "per_hour")}</Text>
              </View>
            )}
            {services.length > 0 ? (
              <View style={{ gap: 10 }}>
                {services.map((s: any) => (
                  <View key={s.id} style={styles.card} testID={`service-${s.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{s.title}</Text>
                      {s.description && <Text style={styles.cardDesc} numberOfLines={2}>{s.description}</Text>}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {typeof s.price === "number" && <Text style={styles.price}>₹{s.price.toLocaleString("en-IN")}</Text>}
                      {s.pricing_type && <Text style={styles.priceSub}>{pricingUnitLabel(s.pricing_type)}</Text>}
                      {canModifyContent && (
                        <Pressable testID={`svc-del-${s.id}`} onPress={() => del(`/profile/services/${s.id}`, "this service")} style={styles.delMini}>
                          <Ionicons name="trash-outline" size={13} color={theme.error} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : services.length === 0 && !(p.pricing_per_hour > 0) ? <Empty>No services listed yet.</Empty> : null}
          </Section>
        ) : (
          <Section title="Services"><Empty>No services listed yet.</Empty></Section>
        )}

        {/* ─── Availability ─── */}
        <Section
          title="Availability"
          action={perms.can_edit ? (
            <Pressable testID="edit-availability" onPress={() => router.push("/profile/availability")}>
              <Text style={styles.seeAll}>{p.availability?.weekly || p.availability?.vacation ? "Edit" : "Set"}</Text>
            </Pressable>
          ) : undefined}
        >
          {p.availability?.weekly || p.availability?.vacation ? (
            <>
              {p.availability.weekly && (
                <View style={styles.chipRow}>
                  {Object.entries(p.availability.weekly as Record<string, any[]>).map(([day, slots]) =>
                    Array.isArray(slots) && slots.length > 0 ? (
                      <View key={day} style={styles.tag}><Text style={styles.tagTxt}>{day.slice(0, 3).toUpperCase()}</Text></View>
                    ) : null
                  )}
                </View>
              )}
              {p.availability.vacation?.start && (
                <Text style={[styles.body, { marginTop: 8 }]}>Away: {formatDate(p.availability.vacation.start)} → {formatDate(p.availability.vacation.end)}</Text>
              )}
            </>
          ) : perms.can_edit ? (
            <Pressable testID="set-availability-empty" onPress={() => router.push("/profile/availability")} style={styles.availCta}>
              <Ionicons name="calendar-outline" size={18} color={theme.brand} />
              <Text style={styles.availCtaTxt}>Set your weekly availability</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textDim} />
            </Pressable>
          ) : (
            <Empty>No availability set yet.</Empty>
          )}
        </Section>

        {/* ─── Upcoming Events ─── */}
        <Section title="Upcoming events" count={data.upcoming_events.length}>
          {data.upcoming_events.length > 0 ? (
            <View style={{ gap: 8 }}>
              {data.upcoming_events.map((g: any) => {
                const filled = g.status === "filled";
                return (
                  <Pressable key={g.id} onPress={() => router.push(`/gig/${g.id}`)} style={styles.listRow} testID={`upcoming-${g.id}`}>
                    <View style={styles.listIcon}><Ionicons name="calendar" size={16} color={theme.brand} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{g.title}</Text>
                      <Text style={styles.listMeta}>{g.city} · {formatDate(g.date)}</Text>
                    </View>
                    <View style={[styles.upcomingBadge, filled && styles.upcomingBadgeFilled]}>
                      <Text style={[styles.upcomingBadgeTxt, filled && { color: theme.success }]}>
                        {filled ? "FILLED" : "OPEN"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : <Empty>No upcoming events yet.</Empty>}
        </Section>

        {/* ─── Posts — compact grid preview (scales to hundreds via See all) ─── */}
        <Section
          title="Posts"
          count={postsTotal}
          action={postsTotal > 0 ? (
            <Pressable testID="see-all-posts" onPress={() => u.id && router.push(`/user/${u.id}/posts`)}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          ) : undefined}
        >
          {posts.length > 0 ? (
            <>
              <View style={styles.postGrid}>
                {posts.slice(0, PROFILE_POST_PREVIEW).map((post: any, i: number) => (
                  <Pressable
                    key={post.id}
                    testID={`profile-post-${post.id}`}
                    onPress={() => {
                      if (post.media_url) {
                        const mediaPosts = posts.filter((p: any) => p.media_url);
                        const idx = mediaPosts.findIndex((p: any) => p.id === post.id);
                        if (idx >= 0) openMediaViewer(mediaPosts, idx);
                      } else if (u.id) {
                        router.push(`/user/${u.id}/posts`);
                      }
                    }}
                    style={styles.postTile}
                  >
                    {post.media_url ? (
                      <>
                        <Image source={{ uri: post.media_url }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                        {post.media_type === "video" && (
                          <View style={styles.playBadge}><Ionicons name="play" size={14} color="#fff" /></View>
                        )}
                      </>
                    ) : (
                      <View style={styles.postTextTile}>
                        <Text style={styles.postTextTileTxt} numberOfLines={4}>{post.text || "Post"}</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
              {postsTotal > PROFILE_POST_PREVIEW && (
                <Pressable
                  testID="see-all-posts-cta"
                  onPress={() => u.id && router.push(`/user/${u.id}/posts`)}
                  style={styles.seeAllBtn}
                >
                  <Text style={styles.seeAllBtnTxt}>See all {postsTotal} posts</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.brand} />
                </Pressable>
              )}
            </>
          ) : <Empty>No posts yet.</Empty>}
        </Section>

        {/* ─── Community Activity (sits with Posts) ─── */}
        <Section title="Community activity">
          <View style={styles.activityRow} testID="community-activity">
            <Pressable
              testID="activity-posts"
              style={styles.activityItem}
              onPress={() => u.id && postsTotal > 0 && router.push(`/user/${u.id}/posts`)}
            >
              <Text style={styles.activityNum}>{ca.posts_count}</Text>
              <Text style={styles.activityLbl}>Posts</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <View style={styles.activityItem} testID="activity-likes">
              <Text style={styles.activityNum}>{ca.likes_received}</Text>
              <Text style={styles.activityLbl}>Likes</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.activityItem} testID="activity-comments">
              <Text style={styles.activityNum}>{ca.comments_received}</Text>
              <Text style={styles.activityLbl}>Comments</Text>
            </View>
          </View>
        </Section>

        {/* ─── Reviews (hidden for now) ───
        <Section title="Reviews" count={stats.reviews_count}>
          {data.reviews.length > 0 ? (
            <View style={{ gap: 10 }}>
              {data.reviews.slice(0, 5).map((r: any) => (
                <View key={r.id || r.created_at} style={styles.reviewCard} testID={`review-${r.id || r.created_at}`}>
                  <View style={styles.reviewHead}>
                    <Pressable onPress={() => r.author_id && router.push(`/user/${r.author_id}`)} style={styles.reviewAvatar}>
                      {r.author_avatar ? <Image source={{ uri: r.author_avatar }} style={{ width: "100%", height: "100%" }} /> :
                        <Text style={styles.reviewAvatarTxt}>{(r.author_name || "?").charAt(0)}</Text>}
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{r.author_name || "Anonymous"}</Text>
                      <View style={{ flexDirection: "row", gap: 4, alignItems: "center", marginTop: 2 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <Ionicons key={n} name="star" size={12} color={n <= r.rating ? "#fbbf24" : theme.bg3} />
                        ))}
                        <Text style={styles.reviewDate}> · {formatRelative(r.created_at)}</Text>
                      </View>
                    </View>
                  </View>
                  {r.text && <Text style={styles.body}>{r.text}</Text>}
                </View>
              ))}
            </View>
          ) : <Empty>No reviews yet.</Empty>}
        </Section>
        */}

        {/* ─── Achievements ─── */}
        <Section title="Achievements">
          {data.achievements.length > 0 ? (
            <View style={styles.chipRow}>
              {data.achievements.map(a => (
                <View key={a.key} style={styles.achCard} testID={`achievement-${a.key}`}>
                  <Ionicons name={a.icon as any} size={14} color={theme.brand} />
                  <Text style={styles.achTxt}>{a.label}</Text>
                </View>
              ))}
            </View>
          ) : <Empty>No achievements yet.</Empty>}
        </Section>

        {/* ─── Equipment ─── */}
        <Section title="Equipment" count={equipment.length}>
          {equipment.length > 0 ? (
            <View style={{ gap: 8 }}>
              {equipment.map((e: any) => {
                const thumb = e.cover_url || (Array.isArray(e.images) && e.images[0]) || DEFAULT_COVERS.equipment;
                return (
                <Pressable key={e.id} style={styles.listRow} testID={`list-eq-${e.id}`} onPress={() => router.push(`/listing/equipment/${e.id}`)}>
                  <Image source={{ uri: thumb }} style={styles.eqThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{e.title}</Text>
                    <Text style={styles.listMeta}>
                      ₹{Number(e.price || 0).toLocaleString("en-IN")}{e.listing_type === "rent" ? "/day" : ""}
                      {Array.isArray(e.images) && e.images.length > 1 ? ` · ${e.images.length} photos` : ""}
                    </Text>
                  </View>
                  {canModifyContent && (
                    <View style={styles.rowActions}>
                      <Pressable testID={`eq-edit-${e.id}`} onPress={() => router.push(`/listing/equipment/${e.id}/edit`)} style={styles.editMini}>
                        <Ionicons name="create-outline" size={14} color={theme.brand} />
                      </Pressable>
                      <Pressable testID={`eq-del-${e.id}`} onPress={() => del(`/equipment/${e.id}`, "this listing")} style={styles.delMini}>
                        <Ionicons name="trash-outline" size={14} color={theme.error} />
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );})}
            </View>
          ) : <Empty>No equipment listed yet.</Empty>}
        </Section>

        {/* ─── Bands ─── */}
        <Section title="Bands" count={bands.length}>
          {bands.length > 0 ? (
            <View style={{ gap: 8 }}>
              {bands.map((b: any) => (
                <Pressable key={b.id} style={styles.listRow} testID={`list-band-${b.id}`} onPress={() => router.push(`/listing/band/${b.id}`)}>
                  <Image source={{ uri: b.cover_url || DEFAULT_COVERS.band }} style={styles.eqThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{b.name}</Text>
                    <Text style={styles.listMeta}>{b.city}</Text>
                  </View>
                  {canModifyContent && (
                    <View style={styles.rowActions}>
                      <Pressable testID={`band-edit-${b.id}`} onPress={() => router.push(`/listing/band/${b.id}/edit`)} style={styles.editMini}>
                        <Ionicons name="create-outline" size={14} color={theme.brand} />
                      </Pressable>
                      <Pressable testID={`band-del-${b.id}`} onPress={() => del(`/bands/${b.id}`, "this band")} style={styles.delMini}>
                        <Ionicons name="trash-outline" size={14} color={theme.error} />
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : <Empty>No bands yet.</Empty>}
        </Section>

        {/* ─── Studios ─── */}
        <Section title="Studios" count={studios.length}>
          {studios.length > 0 ? (
            <View style={{ gap: 8 }}>
              {studios.map((s: any) => {
                const thumb = s.cover_url || (Array.isArray(s.images) && s.images[0]) || DEFAULT_COVERS.studio;
                return (
                <Pressable key={s.id} style={styles.listRow} testID={`list-studio-${s.id}`} onPress={() => router.push(`/listing/studio/${s.id}`)}>
                  <Image source={{ uri: thumb }} style={styles.eqThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{s.name}</Text>
                    <Text style={styles.listMeta}>
                      {s.city} · ₹{Number(s.hourly_rate || 0).toLocaleString("en-IN")}/hr
                      {Array.isArray(s.images) && s.images.length > 1 ? ` · ${s.images.length} photos` : ""}
                    </Text>
                    {!!s.maps_url && (
                      <Pressable
                        testID={`studio-maps-${s.id}`}
                        onPress={() => openLink(s.maps_url)}
                        style={styles.mapsLink}
                      >
                        <Ionicons name="navigate-outline" size={13} color={theme.brand} />
                        <Text style={styles.mapsLinkTxt}>Open in Maps</Text>
                      </Pressable>
                    )}
                  </View>
                  {canModifyContent && (
                    <View style={styles.rowActions}>
                      <Pressable testID={`studio-edit-${s.id}`} onPress={() => router.push(`/listing/studio/${s.id}/edit`)} style={styles.editMini}>
                        <Ionicons name="create-outline" size={14} color={theme.brand} />
                      </Pressable>
                      <Pressable testID={`studio-del-${s.id}`} onPress={() => del(`/studios/${s.id}`, "this studio")} style={styles.delMini}>
                        <Ionicons name="trash-outline" size={14} color={theme.error} />
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );})}
            </View>
          ) : <Empty>No studios yet.</Empty>}
        </Section>

        {/* ─── Lessons ─── */}
        <Section title="Lessons" count={lessons.length}>
          {lessons.length > 0 ? (
            <View style={{ gap: 8 }}>
              {lessons.map((l: any) => (
                <Pressable key={l.id} style={styles.listRow} testID={`list-lesson-${l.id}`} onPress={() => router.push(`/listing/lesson/${l.id}`)}>
                  <Image source={{ uri: l.cover_url || DEFAULT_COVERS.lesson }} style={styles.eqThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{l.title}</Text>
                    <Text style={styles.listMeta}>{l.subject} · ₹{Number(l.price_per_hour || 0).toLocaleString("en-IN")}/hr</Text>
                  </View>
                  {canModifyContent && (
                    <View style={styles.rowActions}>
                      <Pressable testID={`lesson-edit-${l.id}`} onPress={() => router.push(`/listing/lesson/${l.id}/edit`)} style={styles.editMini}>
                        <Ionicons name="create-outline" size={14} color={theme.brand} />
                      </Pressable>
                      <Pressable testID={`lesson-del-${l.id}`} onPress={() => del(`/lessons/${l.id}`, "this lesson")} style={styles.delMini}>
                        <Ionicons name="trash-outline" size={14} color={theme.error} />
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : <Empty>No lessons yet.</Empty>}
        </Section>

        {/* ─── Find on ─── */}
        <Section title="Find on">
          {(p.instagram_url || p.youtube_url || p.spotify_url || p.website_url || p.linkedin_url || p.soundcloud_url) ? (
            <View style={styles.chipRow}>
              {p.instagram_url && <Pressable testID="social-ig" onPress={() => openLink(p.instagram_url)} style={styles.socialBtn}><Ionicons name="logo-instagram" size={18} color={theme.text} /></Pressable>}
              {p.youtube_url && <Pressable testID="social-yt" onPress={() => openLink(p.youtube_url)} style={styles.socialBtn}><Ionicons name="logo-youtube" size={18} color={theme.text} /></Pressable>}
              {p.spotify_url && <Pressable onPress={() => openLink(p.spotify_url)} style={styles.socialBtn}><Ionicons name="musical-notes" size={17} color={theme.text} /></Pressable>}
              {p.soundcloud_url && <Pressable onPress={() => openLink(p.soundcloud_url)} style={styles.socialBtn}><Ionicons name="cloud" size={17} color={theme.text} /></Pressable>}
              {p.linkedin_url && <Pressable onPress={() => openLink(p.linkedin_url)} style={styles.socialBtn}><Ionicons name="logo-linkedin" size={18} color={theme.text} /></Pressable>}
              {p.website_url && <Pressable onPress={() => openLink(p.website_url)} style={styles.socialBtn}><Ionicons name="globe-outline" size={18} color={theme.text} /></Pressable>}
            </View>
          ) : <Empty>No links added yet.</Empty>}
        </Section>

        {u.created_at && <Text style={styles.joined}>Joined {formatDate(u.created_at)}</Text>}

        {!!perms.can_report && (
          <Pressable testID="action-report" onPress={report} style={styles.reportBottom}>
            <Ionicons name="flag-outline" size={14} color={theme.textDim} />
            <Text style={styles.reportBottomTxt}>Report user</Text>
          </Pressable>
        )}
      </ScrollView>

      {viewer && <MediaViewer visible items={viewer.items} initialIndex={viewer.idx} onClose={() => setViewer(null)} />}

      {reportedOpen && (
        <View style={styles.toast} pointerEvents="none" testID="report-toast">
          <Text style={styles.toastTxt}>Reported. Thanks — our team will review.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Small reusable Section + Empty helpers keep spacing perfectly identical
function Section({ title, count, action, children }: { title: string; count?: number; action?: any; children: any }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sTitle}>{title}</Text>
        {count !== undefined && count > 0 && <Text style={styles.sCount}>{count}</Text>}
        <View style={{ flex: 1 }} />
        {action}
      </View>
      {children}
    </View>
  );
}
function Empty({ children }: { children: string }) {
  return <Text style={styles.empty}>{children}</Text>;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },

  // Header
  cover: { height: 140 },
  coverNav: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center",
  },
  circleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(9,9,11,0.7)", alignItems: "center", justifyContent: "center", marginLeft: 16, marginTop: 8 },
  headerBlock: { paddingHorizontal: 20, marginTop: -40, alignItems: "center" },
  avatarWrap: { padding: 2, backgroundColor: theme.bg, borderRadius: 48 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: theme.bg2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarTxt: { ...type.titleLg, color: theme.text, fontWeight: "800" },
  identity: { alignItems: "center", marginTop: 8, paddingHorizontal: 8 },
  name: { ...type.titleLg, color: theme.text, textAlign: "center", fontWeight: "800" },
  tagline: { ...type.caption, color: theme.textMid, marginTop: 4, textAlign: "center", lineHeight: 18 },
  location: { ...type.caption, color: theme.textDim, marginTop: 4 },
  chipStrip: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 8 },
  chipHero: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.bg2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: theme.border },
  chipHeroTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  chipHeroSub: { ...type.tiny, color: theme.textDim },
  roleChip: { backgroundColor: theme.brandTint, borderColor: theme.brand, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  roleChipTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },

  // Actions
  actionRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: theme.bg2, borderRadius: theme.radius.pill, paddingVertical: 10, borderWidth: 1, borderColor: theme.border, minHeight: 40 },
  actionBtnTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  overflowRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 20, marginTop: 8 },
  overflowBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.bg2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.border },
  overflowTxt: { ...type.tiny, color: theme.textMid, fontWeight: "600" },

  // Stats — compact inline (no cards)
  statsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 20, marginTop: 10, gap: 0,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, marginTop: 12 },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 4 },
  statCard: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: theme.bg2, borderRadius: theme.radius.md,
    paddingVertical: 8, paddingHorizontal: 8,
    borderWidth: 1, borderColor: theme.border,
  },
  statDivider: { width: 1, height: 22, backgroundColor: theme.border },
  statNum: { fontSize: 14, color: theme.text, fontWeight: "800", letterSpacing: -0.2 },
  statLbl: { fontSize: 10, color: theme.textDim, marginTop: 1, fontWeight: "500" },

  // Sections
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sTitle: { ...type.titleMd, color: theme.text, fontWeight: "700" },
  sCount: { ...type.tiny, color: theme.textDim, backgroundColor: theme.bg2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontWeight: "700" },
  empty: { ...type.caption, color: theme.textDim, fontStyle: "italic" },
  body: { ...type.bodySm, color: theme.textMid, lineHeight: 21 },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand },
  phoneTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },

  // Community activity mini-stats
  activityRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.bg2, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.border, paddingVertical: 14, paddingHorizontal: 8,
  },
  activityItem: { flex: 1, alignItems: "center", gap: 2 },
  activityNum: { ...type.titleMd, color: theme.text, fontWeight: "800" },
  activityLbl: { ...type.tiny, color: theme.textDim, fontWeight: "600" },

  // Chips
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: theme.bg2, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: theme.border },
  tagTxt: { ...type.caption, color: theme.textMid, fontWeight: "500" },
  tagBrand: { backgroundColor: theme.brandTint, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: theme.brand },
  tagBrandTxt: { ...type.caption, color: theme.brand, fontWeight: "600" },
  achCard: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.bg2, borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.border },
  achTxt: { ...type.caption, color: theme.textMid, fontWeight: "600" },

  // Media grid
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
  mediaTile: { width: "32.7%", aspectRatio: 1, backgroundColor: theme.bg2, overflow: "hidden", borderRadius: 4 },
  playBadge: { position: "absolute", top: "50%", left: "50%", marginLeft: -13, marginTop: -13 },

  // Cards / lists
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 14, borderWidth: 1, borderColor: theme.border },
  cardTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  cardDesc: { ...type.caption, color: theme.textDim, marginTop: 3 },
  price: { ...type.titleMd, color: theme.brand, fontWeight: "800" },
  priceLg: { ...type.h2, color: theme.brand, fontWeight: "800" },
  priceSub: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  delMini: { padding: 8, borderRadius: theme.radius.md, backgroundColor: theme.bg3, marginTop: 4 },
  editMini: { padding: 8, borderRadius: theme.radius.md, backgroundColor: theme.brandTint, marginTop: 4 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border },
  listIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center" },
  eqThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: theme.bg3 },
  upcomingBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    borderWidth: 1, borderColor: theme.brand, backgroundColor: theme.brandTint,
  },
  upcomingBadgeFilled: { borderColor: theme.success, backgroundColor: `${theme.success}22` },
  upcomingBadgeTxt: { ...type.tiny, color: theme.brand, fontWeight: "800", letterSpacing: 0.3 },
  listMeta: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  mapsLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start" },
  mapsLinkTxt: { ...type.tiny, color: theme.brand, fontWeight: "700" },

  // Posts grid preview
  seeAll: { ...type.caption, color: theme.brand, fontWeight: "700" },
  availCta: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: theme.radius.md,
    backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border,
  },
  availCtaTxt: { ...type.bodySm, color: theme.text, fontWeight: "600", flex: 1 },
  postGrid: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
  postTile: { width: "32.7%", aspectRatio: 1, backgroundColor: theme.bg2, overflow: "hidden", borderRadius: 4 },
  postTextTile: { flex: 1, padding: 8, justifyContent: "center", backgroundColor: theme.bg2 },
  postTextTileTxt: { ...type.tiny, color: theme.textMid, lineHeight: 14 },
  seeAllBtn: {
    marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    paddingVertical: 12, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border,
  },
  seeAllBtnTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },

  // Reviews
  reviewCard: { backgroundColor: theme.bg2, borderRadius: theme.radius.md, padding: 12, borderWidth: 1, borderColor: theme.border },
  reviewHead: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 8 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.bg3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  reviewAvatarTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  reviewDate: { ...type.tiny, color: theme.textDim },

  socialBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  joined: { ...type.tiny, color: theme.textDim, textAlign: "center", marginTop: 28, marginBottom: 8 },
  reportBottom: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 8, marginBottom: 16, paddingVertical: 12,
  },
  reportBottomTxt: { ...type.caption, color: theme.textDim, fontWeight: "600" },

  // Toast
  toast: { position: "absolute", left: 20, right: 20, bottom: 100, backgroundColor: theme.bg2, borderColor: theme.brand, borderWidth: 1, padding: 14, borderRadius: theme.radius.lg, alignItems: "center" },
  toastTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
});
