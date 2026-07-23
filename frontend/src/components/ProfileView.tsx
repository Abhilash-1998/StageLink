import { View, Text, StyleSheet, ScrollView, Image, Pressable, ImageBackground, Linking, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { MediaViewer } from "@/src/components/MediaViewer";
import { confirmDelete } from "@/src/utils/confirm";
import { formatDate, formatRelative } from "@/src/utils/date";

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
  entities: { posts: any[]; gigs: any[]; bands: any[]; equipment: any[]; studios: any[]; lessons: any[] };
  reviews: any[];
  upcoming_events: any[];
  achievements: { key: string; label: string; icon: any }[];
  community_activity: { posts_count: number; likes_given: number; comments_given: number };
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

  const initials = (u.full_name || "?").split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase();
  const portfolio: any[] = p.portfolio_items || [];
  const services: any[] = p.services || [];
  const { posts, bands, equipment, studios, lessons } = data.entities;
  const stats = data.stats;

  const openLink = (url?: string) => url && Linking.openURL(url).catch(() => {});
  const openMediaViewer = (items: any[], idx: number) => setViewer({
    items: items.map(x => ({ uri: x?.media_url, type: x?.media_type, title: x?.title })).filter(x => x.uri),
    idx,
  });

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

  const share = async () => {
    try {
      await Share.share({
        title: `${u.full_name} on StageLink`,
        message: `${u.full_name} — ${p.tagline || p.city || "on StageLink"}`,
      });
    } catch {}
  };

  const report = () => { setReportedOpen(true); setTimeout(() => setReportedOpen(false), 1800); };

  // Action buttons — order & count kept consistent (2 primary + kebab-in-header)
  // Own: [Edit Profile] [Settings]      · header actions: Switch role · Create post · Analytics · Share
  // Public: [Follow] [Message]          · header actions: Hire · Share · Report
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
  if (perms.can_switch_role) overflowActions.push({ key: "switch", label: "Switch role", icon: "swap-horizontal", onPress: () => router.push("/auth/role"), testID: "action-switch-role" });
  if (perms.can_create_post) overflowActions.push({ key: "create", label: "Create post", icon: "add-circle-outline", onPress: () => router.push("/(tabs)/create"), testID: "action-create-post" });
  if (perms.can_view_analytics) overflowActions.push({ key: "analytics", label: "Analytics", icon: "stats-chart-outline", onPress: () => router.push("/(tabs)/dashboard"), testID: "action-analytics" });
  if (perms.can_hire) overflowActions.push({ key: "hire", label: "Hire / Invite", icon: "briefcase-outline", onPress: () => router.push("/gig/new"), testID: "action-hire" });
  if (perms.can_share) overflowActions.push({ key: "share", label: "Share profile", icon: "share-outline", onPress: share, testID: "action-share" });
  if (perms.can_report) overflowActions.push({ key: "report", label: "Report user", icon: "flag-outline", danger: true, onPress: report, testID: "action-report" });

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        {/* ─── Header — cover + gradient + centered avatar + name + badges ─── */}
        <View style={styles.cover}>
          {p.cover_url
            ? <ImageBackground source={{ uri: p.cover_url }} style={StyleSheet.absoluteFill}>
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
              {u.avatar_url ? <Image source={{ uri: u.avatar_url }} style={styles.avatarImg} /> :
                <Text style={styles.avatarTxt}>{initials}</Text>}
            </View>
          </View>
          <View style={{ alignItems: "center", marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.name}>{u.full_name || "—"}</Text>
              {u.verified && <Ionicons name="checkmark-circle" size={18} color={theme.brand} testID="verified-badge" />}
            </View>
            <Text style={styles.tagline}>{p.tagline || (p.professions?.slice(0, 2).join(" · ")) || "Professional"}</Text>
            {p.city && <Text style={styles.location}><Ionicons name="location" size={12} color={theme.textDim} /> {p.city}{p.country ? `, ${p.country}` : ""}</Text>}
            {/* Rating + Reliability chips */}
            <View style={styles.chipStrip}>
              <View style={styles.chipHero} testID="rating-chip">
                <Ionicons name="star" size={12} color="#fbbf24" />
                <Text style={styles.chipHeroTxt}>{stats.rating.toFixed(1)}</Text>
                <Text style={styles.chipHeroSub}>({stats.reviews_count})</Text>
              </View>
              <View style={styles.chipHero} testID="reliability-chip">
                <Ionicons name="shield-checkmark" size={12} color={theme.brand} />
                <Text style={styles.chipHeroTxt}>{stats.reliability}%</Text>
                <Text style={styles.chipHeroSub}>reliable</Text>
              </View>
              {(p.professions || []).slice(0, 1).map((r: string) => (
                <View key={r} style={styles.roleChip} testID="role-badge">
                  <Text style={styles.roleChipTxt}>{r}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ─── Action buttons — always same size, permissions decide content ─── */}
        <View style={styles.actionRow}>
          {primaryActions.map((a, i) => (
            <Pressable key={a.key} testID={a.testID}
              onPress={a.onPress}
              style={[styles.actionBtn, a.accent && { backgroundColor: theme.brand, borderColor: theme.brand }]}>
              <Ionicons name={a.icon as any} size={15} color={a.accent ? "#fff" : theme.text} />
              <Text style={[styles.actionBtnTxt, a.accent && { color: "#fff" }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        {overflowActions.length > 0 && (
          <View style={styles.overflowRow}>
            {overflowActions.map(a => (
              <Pressable key={a.key} testID={a.testID} onPress={a.onPress} style={styles.overflowBtn}>
                <Ionicons name={a.icon} size={16} color={a.danger ? theme.error : theme.textMid} />
                <Text style={[styles.overflowTxt, a.danger && { color: theme.error }]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ─── Stats — 6 compact cards, tap Followers/Following to open list ─── */}
        <View style={styles.statsGrid}>
          <Pressable testID="stat-followers" onPress={() => u.id && router.push(`/user/${u.id}/connections?tab=followers`)} style={styles.statCard}>
            <Text style={styles.statNum}>{stats.followers}</Text><Text style={styles.statLbl}>Followers</Text>
          </Pressable>
          <Pressable testID="stat-following" onPress={() => u.id && router.push(`/user/${u.id}/connections?tab=following`)} style={styles.statCard}>
            <Text style={styles.statNum}>{stats.following}</Text><Text style={styles.statLbl}>Following</Text>
          </Pressable>
          <View style={styles.statCard}><Text style={styles.statNum}>{stats.completed_gigs}</Text><Text style={styles.statLbl}>Gigs done</Text></View>
          <View style={styles.statCard}><Text style={styles.statNum}>{stats.reviews_count}</Text><Text style={styles.statLbl}>Reviews</Text></View>
          <View style={styles.statCard}><Text style={styles.statNum}>{stats.rating.toFixed(1)}</Text><Text style={styles.statLbl}>Rating</Text></View>
          <View style={styles.statCard}><Text style={styles.statNum}>{stats.reliability}%</Text><Text style={styles.statLbl}>Reliability</Text></View>
        </View>

        {/* ─── Bio ─── */}
        <Section title="About">
          {p.bio ? <Text style={styles.body}>{p.bio}</Text> : <Empty>No bio yet.</Empty>}
        </Section>

        {/* ─── Portfolio (photos + videos grid) ─── */}
        <Section title="Portfolio" count={portfolio.length}>
          {portfolio.length > 0 ? (
            <View style={styles.mediaGrid}>
              {portfolio.map((it, i) => (
                <Pressable key={it.id || i} testID={`media-${it.id}`} onPress={() => openMediaViewer(portfolio, i)} style={styles.mediaTile}>
                  <Image source={{ uri: it.thumbnail_url || it.media_url }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                  {it.media_type === "video" && (
                    <View style={styles.playBadge}><Ionicons name="play-circle" size={26} color="#fff" /></View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : <Empty>No portfolio uploaded yet.</Empty>}
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
                <Text style={styles.priceLg}>₹{Number(p.pricing_per_hour).toLocaleString("en-IN")} / hour</Text>
                <Text style={styles.body}>Base performance rate</Text>
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
                      {s.pricing_type && <Text style={styles.priceSub}>{String(s.pricing_type).replace("_", " ")}</Text>}
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
        <Section title="Availability">
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
          ) : <Empty>No availability set yet.</Empty>}
        </Section>

        {/* ─── Upcoming Events ─── */}
        <Section title="Upcoming events" count={data.upcoming_events.length}>
          {data.upcoming_events.length > 0 ? (
            <View style={{ gap: 8 }}>
              {data.upcoming_events.map((g: any) => (
                <Pressable key={g.id} onPress={() => router.push(`/gig/${g.id}`)} style={styles.listRow} testID={`upcoming-${g.id}`}>
                  <View style={styles.listIcon}><Ionicons name="calendar" size={16} color={theme.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{g.title}</Text>
                    <Text style={styles.listMeta}>{g.city} · {formatDate(g.date)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : <Empty>No upcoming events yet.</Empty>}
        </Section>

        {/* ─── Posts ─── */}
        <Section title="Posts" count={posts.length}>
          {posts.length > 0 ? (
            <View style={{ gap: 10 }}>
              {posts.slice(0, 6).map((post: any) => (
                <View key={post.id} style={styles.postCard} testID={`profile-post-${post.id}`}>
                  <View style={styles.postHead}>
                    <Text style={styles.postDate}>{formatRelative(post.created_at)}</Text>
                    {canModifyContent && (
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
          ) : <Empty>No posts yet.</Empty>}
        </Section>

        {/* ─── Reviews ─── */}
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
              {equipment.map((e: any) => (
                <View key={e.id} style={styles.listRow} testID={`list-eq-${e.id}`}>
                  <View style={styles.listIcon}><Ionicons name="cube" size={16} color={theme.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{e.title}</Text>
                    <Text style={styles.listMeta}>₹{Number(e.price || 0).toLocaleString("en-IN")}{e.listing_type === "rent" ? "/day" : ""}</Text>
                  </View>
                  {canModifyContent && (
                    <Pressable testID={`eq-del-${e.id}`} onPress={() => del(`/equipment/${e.id}`, "this listing")} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ) : <Empty>No equipment listed yet.</Empty>}
        </Section>

        {/* ─── Bands ─── */}
        <Section title="Bands" count={bands.length}>
          {bands.length > 0 ? (
            <View style={{ gap: 8 }}>
              {bands.map((b: any) => (
                <View key={b.id} style={styles.listRow} testID={`list-band-${b.id}`}>
                  <View style={styles.listIcon}><Ionicons name="people" size={16} color={theme.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{b.name}</Text>
                    <Text style={styles.listMeta}>{b.city}</Text>
                  </View>
                  {canModifyContent && (
                    <Pressable testID={`band-del-${b.id}`} onPress={() => del(`/bands/${b.id}`, "this band")} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ) : <Empty>No bands yet.</Empty>}
        </Section>

        {/* ─── Studios ─── */}
        <Section title="Studios" count={studios.length}>
          {studios.length > 0 ? (
            <View style={{ gap: 8 }}>
              {studios.map((s: any) => (
                <View key={s.id} style={styles.listRow} testID={`list-studio-${s.id}`}>
                  <View style={styles.listIcon}><Ionicons name="mic" size={16} color={theme.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{s.name}</Text>
                    <Text style={styles.listMeta}>{s.city} · ₹{Number(s.hourly_rate || 0).toLocaleString("en-IN")}/hr</Text>
                  </View>
                  {canModifyContent && (
                    <Pressable testID={`studio-del-${s.id}`} onPress={() => del(`/studios/${s.id}`, "this studio")} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ) : <Empty>No studios yet.</Empty>}
        </Section>

        {/* ─── Lessons ─── */}
        <Section title="Lessons" count={lessons.length}>
          {lessons.length > 0 ? (
            <View style={{ gap: 8 }}>
              {lessons.map((l: any) => (
                <View key={l.id} style={styles.listRow} testID={`list-lesson-${l.id}`}>
                  <View style={styles.listIcon}><Ionicons name="school" size={16} color={theme.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{l.title}</Text>
                    <Text style={styles.listMeta}>{l.subject} · ₹{Number(l.price_per_hour || 0).toLocaleString("en-IN")}/hr</Text>
                  </View>
                  {canModifyContent && (
                    <Pressable testID={`lesson-del-${l.id}`} onPress={() => del(`/lessons/${l.id}`, "this lesson")} style={styles.delMini}>
                      <Ionicons name="trash-outline" size={14} color={theme.error} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ) : <Empty>No lessons yet.</Empty>}
        </Section>

        {/* ─── Community Activity ─── */}
        <Section title="Community activity">
          <View style={styles.chipRow}>
            <View style={styles.achCard}><Ionicons name="chatbubble-ellipses" size={14} color={theme.brand} /><Text style={styles.achTxt}>{data.community_activity.posts_count} posts</Text></View>
            <View style={styles.achCard}><Ionicons name="heart" size={14} color={theme.brand} /><Text style={styles.achTxt}>{data.community_activity.likes_given} likes given</Text></View>
            <View style={styles.achCard}><Ionicons name="chatbox" size={14} color={theme.brand} /><Text style={styles.achTxt}>{data.community_activity.comments_given} comments</Text></View>
          </View>
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
function Section({ title, count, children }: { title: string; count?: number; children: any }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sTitle}>{title}</Text>
        {count !== undefined && count > 0 && <Text style={styles.sCount}>{count}</Text>}
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
  cover: { height: 180 },
  coverNav: { position: "absolute", top: 0, left: 0 },
  circleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(9,9,11,0.7)", alignItems: "center", justifyContent: "center", marginLeft: 16, marginTop: 8 },
  headerBlock: { paddingHorizontal: 20, marginTop: -50, alignItems: "center" },
  avatarWrap: { padding: 3, backgroundColor: theme.bg, borderRadius: 60 },
  avatar: { width: 108, height: 108, borderRadius: 54, backgroundColor: theme.bg2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarTxt: { ...type.displayMd, color: theme.text },
  name: { ...type.h1, color: theme.text, textAlign: "center" },
  tagline: { ...type.bodySm, color: theme.textMid, marginTop: 4, textAlign: "center" },
  location: { ...type.caption, color: theme.textDim, marginTop: 4 },
  chipStrip: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 12 },
  chipHero: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.bg2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: theme.border },
  chipHeroTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  chipHeroSub: { ...type.tiny, color: theme.textDim },
  roleChip: { backgroundColor: theme.brandTint, borderColor: theme.brand, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  roleChipTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },

  // Actions
  actionRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 18 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.bg2, borderRadius: theme.radius.pill, paddingVertical: 12, borderWidth: 1, borderColor: theme.border, minHeight: 44 },
  actionBtnTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  overflowRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, marginTop: 10 },
  overflowBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: theme.bg2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: theme.border },
  overflowTxt: { ...type.tiny, color: theme.textMid, fontWeight: "600" },

  // Stats
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, marginTop: 20 },
  statCard: { flexBasis: "31.5%", flexGrow: 1, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 14, borderWidth: 1, borderColor: theme.border, alignItems: "center" },
  statNum: { ...type.titleLg, color: theme.text, fontWeight: "800" },
  statLbl: { ...type.tiny, color: theme.textDim, marginTop: 3, textAlign: "center" },

  // Sections
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sTitle: { ...type.titleMd, color: theme.text, fontWeight: "700" },
  sCount: { ...type.tiny, color: theme.textDim, backgroundColor: theme.bg2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontWeight: "700" },
  empty: { ...type.caption, color: theme.textDim, fontStyle: "italic" },
  body: { ...type.bodySm, color: theme.textMid, lineHeight: 21 },

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
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border },
  listIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center" },
  listMeta: { ...type.tiny, color: theme.textDim, marginTop: 2 },

  // Posts
  postCard: { backgroundColor: theme.bg2, borderRadius: theme.radius.md, padding: 12, borderWidth: 1, borderColor: theme.border },
  postHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  postDate: { ...type.tiny, color: theme.textDim },
  postTxt: { ...type.bodySm, color: theme.text, lineHeight: 20 },
  postThumb: { width: "100%", height: 160, borderRadius: theme.radius.md, marginTop: 8 },
  postMeta: { ...type.tiny, color: theme.textDim },

  // Reviews
  reviewCard: { backgroundColor: theme.bg2, borderRadius: theme.radius.md, padding: 12, borderWidth: 1, borderColor: theme.border },
  reviewHead: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 8 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.bg3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  reviewAvatarTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  reviewDate: { ...type.tiny, color: theme.textDim },

  socialBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  joined: { ...type.tiny, color: theme.textDim, textAlign: "center", marginTop: 28, marginBottom: 8 },

  // Toast
  toast: { position: "absolute", left: 20, right: 20, bottom: 100, backgroundColor: theme.bg2, borderColor: theme.brand, borderWidth: 1, padding: 14, borderRadius: theme.radius.lg, alignItems: "center" },
  toastTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
});
