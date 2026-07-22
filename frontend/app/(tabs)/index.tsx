import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, Image, ImageBackground, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatDate, formatRelative } from "@/src/utils/date";
import { confirmDelete } from "@/src/utils/confirm";

type Post = {
  id: string; author_id: string; author_name: string; author_avatar?: string | null;
  text: string; media_url?: string | null; media_type?: string | null;
  like_count: number; comment_count: number; liked: boolean; created_at: string;
};

export default function Home() {
  const { user, fetchApi } = useAuth();
  const [recs, setRecs] = useState<any[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [homeData, setHomeData] = useState<any>(null);

  const load = useCallback(async () => {
    const [rc, feed, home] = await Promise.all([
      fetchApi<any[]>("/ai/recommendations", { method: "POST", body: JSON.stringify({}) }).catch(() => []),
      fetchApi<Post[]>("/posts/feed").catch(() => []),
      fetchApi<any>("/home").catch(() => null),
    ]);
    setRecs(rc); setPosts(feed); setHomeData(home);
  }, [fetchApi]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } };

  const toggleLike = async (pid: string) => {
    setPosts(prev => prev.map(p => p.id === pid ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) } : p));
    try { await fetchApi(`/posts/${pid}/like`, { method: "POST" }); } catch {}
  };

  // Post editing (owner-only) — reuses one modal for all posts
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (p: Post) => { setEditingPost(p); setEditText(p.text); };
  const saveEdit = async () => {
    if (!editingPost) return;
    setSavingEdit(true);
    try {
      await fetchApi(`/posts/${editingPost.id}`, { method: "PATCH", body: JSON.stringify({ text: editText }) });
      setEditingPost(null);
      await load();
    } catch {}
    finally { setSavingEdit(false); }
  };
  const deletePost = async (p: Post) => {
    if (!(await confirmDelete("Delete post?", "This action cannot be undone."))) return;
    setPosts(prev => prev.filter(x => x.id !== p.id));
    try { await fetchApi(`/posts/${p.id}`, { method: "DELETE" }); } catch { await load(); }
  };

  const goAuthor = (authorId: string) => {
    if (!authorId) return;
    if (authorId === user?.id) router.push("/(tabs)/profile");
    else router.push(`/user/${authorId}`);
  };

  if (loading) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  const initials = user?.full_name?.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const upcoming = homeData?.upcoming || [];
  const metrics = homeData?.metrics || {};

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 130 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.hi}>Welcome back</Text>
            <Text style={styles.name}>{user?.full_name?.split(" ")[0]}</Text>
          </View>
          <Pressable testID="home-avatar" onPress={() => router.push("/(tabs)/profile")} style={styles.avatar}>
            {user?.avatar_url ? <Image source={{ uri: user.avatar_url }} style={{ width: "100%", height: "100%" }} /> :
              <Text style={styles.avatarTxt}>{initials}</Text>}
          </Pressable>
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <Pressable testID="qa-apps" onPress={() => router.push("/(tabs)/applications")} style={styles.qCard}>
            <Ionicons name="briefcase" size={16} color={theme.brand} />
            <Text style={styles.qLbl}>Applications</Text>
            <Text style={styles.qVal}>{metrics.applications ?? 0}</Text>
          </Pressable>
          <Pressable testID="qa-rating" onPress={() => router.push("/(tabs)/profile")} style={styles.qCard}>
            <Ionicons name="star" size={16} color={theme.brand} />
            <Text style={styles.qLbl}>Rating</Text>
            <Text style={styles.qVal}>{metrics.rating ?? "0.0"}</Text>
          </Pressable>
          <Pressable testID="qa-followers" onPress={() => router.push("/(tabs)/profile")} style={styles.qCard}>
            <Ionicons name="people" size={16} color={theme.brand} />
            <Text style={styles.qLbl}>Followers</Text>
            <Text style={styles.qVal}>{metrics.followers ?? 0}</Text>
          </Pressable>
        </View>

        {/* Upcoming bookings */}
        {upcoming.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <View style={styles.sectionRow}>
              <Ionicons name="calendar" size={14} color={theme.brand} />
              <Text style={styles.sectionTitle}>Upcoming</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {upcoming.map((g: any) => (
                <Pressable key={g.id} testID={`up-${g.id}`} onPress={() => router.push(`/gig/${g.id}`)} style={styles.upCard}>
                  <ImageBackground source={{ uri: g.cover_url }} style={StyleSheet.absoluteFill} imageStyle={{ borderRadius: theme.radius.md }} />
                  <LinearGradient colors={["transparent", "rgba(9,9,11,0.95)"]} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.md }]} />
                  <View style={styles.upInner}>
                    <Text style={styles.upDate}>{formatDate(g.date)}</Text>
                    <Text style={styles.upTitle} numberOfLines={1}>{g.title}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recommended gigs */}
        {recs.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <View style={styles.sectionRow}>
              <Ionicons name="sparkles" size={14} color={theme.brand} />
              <Text style={styles.sectionTitle}>Picked for you</Text>
              <Pressable onPress={() => router.push("/(tabs)/discover")}><Text style={styles.link}>See all</Text></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {recs.map((r: any) => (
                <Pressable key={r.id} testID={`reco-${r.id}`} onPress={() => router.push(`/gig/${r.id}`)} style={styles.recoCard}>
                  <ImageBackground source={{ uri: r.cover_url }} style={StyleSheet.absoluteFill} imageStyle={{ borderRadius: theme.radius.md }} />
                  <LinearGradient colors={["transparent", "rgba(9,9,11,0.95)"]} style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.md }]} />
                  <View style={styles.recoInner}>
                    <Text style={styles.recoTitle} numberOfLines={2}>{r.title}</Text>
                    <Text style={styles.recoMeta}>{r.city} · ₹{r.budget.toLocaleString("en-IN")}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Community feed */}
        <View style={{ marginTop: 22 }}>
          <View style={styles.sectionRow}>
            <Ionicons name="flame" size={14} color={theme.brand} />
            <Text style={styles.sectionTitle}>Community</Text>
            <Pressable testID="new-post-btn" onPress={() => router.push("/(tabs)/create")}><Text style={styles.link}>Share</Text></Pressable>
          </View>
          {posts.length === 0 && <Text style={styles.empty}>No posts yet — be the first to share.</Text>}
          {posts.map(p => (
            <View key={p.id} style={styles.postCard} testID={`post-${p.id}`}>
              <View style={styles.postHead}>
                <Pressable testID={`post-author-${p.id}`} onPress={() => goAuthor(p.author_id)} style={styles.postAvatar}>
                  {p.author_avatar ? <Image source={{ uri: p.author_avatar }} style={{ width: "100%", height: "100%" }} /> :
                    <Text style={{ color: theme.text, fontWeight: "700" }}>{p.author_name[0]}</Text>}
                </Pressable>
                <Pressable onPress={() => goAuthor(p.author_id)} style={{ flex: 1 }}>
                  <Text style={styles.postAuthor}>{p.author_name}</Text>
                  <Text style={styles.postTime}>{formatRelative(p.created_at)}</Text>
                </Pressable>
                {p.author_id === user?.id && (
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <Pressable testID={`post-edit-${p.id}`} onPress={() => openEdit(p)} style={styles.postMenuBtn}>
                      <Ionicons name="create-outline" size={16} color={theme.textDim} />
                    </Pressable>
                    <Pressable testID={`post-delete-${p.id}`} onPress={() => deletePost(p)} style={styles.postMenuBtn}>
                      <Ionicons name="trash-outline" size={16} color={theme.error} />
                    </Pressable>
                  </View>
                )}
              </View>
              <Text style={styles.postText}>{p.text}</Text>
              {p.media_url && (
                <Image source={{ uri: p.media_url }} style={styles.postMedia} />
              )}
              <View style={styles.postActions}>
                <Pressable testID={`like-${p.id}`} onPress={() => toggleLike(p.id)} style={styles.postAction}>
                  <Ionicons name={p.liked ? "heart" : "heart-outline"} size={19} color={p.liked ? theme.brand : theme.textDim} />
                  <Text style={[styles.postActionTxt, p.liked && { color: theme.brand }]}>{p.like_count}</Text>
                </Pressable>
                <View style={styles.postAction}>
                  <Ionicons name="chatbubble-outline" size={17} color={theme.textDim} />
                  <Text style={styles.postActionTxt}>{p.comment_count}</Text>
                </View>
                <View style={styles.postAction}>
                  <Ionicons name="share-outline" size={19} color={theme.textDim} />
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Edit-post modal */}
      <Modal transparent visible={!!editingPost} animationType="fade" onRequestClose={() => setEditingPost(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit post</Text>
            <TextInput
              testID="edit-post-input"
              style={styles.modalInput} value={editText} onChangeText={setEditText}
              multiline placeholder="Update your post…" placeholderTextColor={theme.textDim}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => setEditingPost(null)} style={[styles.modalBtn, { backgroundColor: theme.bg3 }]}>
                <Text style={styles.modalBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable testID="edit-post-save" onPress={saveEdit} disabled={savingEdit} style={[styles.modalBtn, { backgroundColor: theme.brand }]}>
                {savingEdit ? <ActivityIndicator color="#fff" size="small" /> :
                  <Text style={[styles.modalBtnTxt, { color: "#fff" }]}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  hi: { ...type.caption, color: theme.textDim },
  name: { ...type.h1, color: theme.text, marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarTxt: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  quickRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginTop: 8 },
  qCard: { flex: 1, backgroundColor: theme.bg2, borderRadius: theme.radius.md, padding: 14, borderWidth: 1, borderColor: theme.border },
  qLbl: { ...type.tiny, color: theme.textDim, marginTop: 8 },
  qVal: { ...type.stat, color: theme.text, marginTop: 2 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { ...type.titleMd, color: theme.text, fontWeight: "700", flex: 1 },
  link: { ...type.caption, color: theme.brand, fontWeight: "600" },
  upCard: { width: 200, height: 100, borderRadius: theme.radius.md, overflow: "hidden" },
  upInner: { position: "absolute", bottom: 10, left: 12, right: 12 },
  upDate: { ...type.tiny, color: theme.brand, fontWeight: "700" },
  upTitle: { ...type.bodySm, color: theme.text, fontWeight: "700", marginTop: 2 },
  recoCard: { width: 170, height: 200, borderRadius: theme.radius.md, overflow: "hidden" },
  recoInner: { position: "absolute", bottom: 12, left: 12, right: 12 },
  recoTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  recoMeta: { ...type.caption, color: theme.brand, fontWeight: "600", marginTop: 4 },
  empty: { ...type.caption, color: theme.textDim, textAlign: "center", paddingVertical: 20, paddingHorizontal: 20 },
  postCard: { marginHorizontal: 20, marginBottom: 14, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 14, borderWidth: 1, borderColor: theme.border },
  postHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.bg3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  postAuthor: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  postTime: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  postText: { ...type.bodySm, color: theme.textMid, lineHeight: 21 },
  postMedia: { width: "100%", height: 220, borderRadius: theme.radius.md, marginTop: 10 },
  postActions: { flexDirection: "row", gap: 20, marginTop: 12 },
  postAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  postActionTxt: { ...type.caption, color: theme.textDim, fontWeight: "600" },
  postMenuBtn: { padding: 6, borderRadius: 999, backgroundColor: theme.bg3 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 20, borderWidth: 1, borderColor: theme.border },
  modalTitle: { ...type.titleLg, color: theme.text, fontWeight: "800", marginBottom: 12 },
  modalInput: { ...type.bodySm, backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, padding: 12, color: theme.text, minHeight: 100, textAlignVertical: "top" },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.pill, alignItems: "center" },
  modalBtnTxt: { ...type.label, color: theme.text, fontWeight: "700" },
});
