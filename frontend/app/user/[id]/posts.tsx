import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Image, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatRelative } from "@/src/utils/date";
import { MediaViewer } from "@/src/components/MediaViewer";
import { confirmDelete } from "@/src/utils/confirm";

const PAGE = 20;

/**
 * Paginated posts for a user — opened from profile "See all".
 * Route: /user/{id}/posts
 */
export default function UserPosts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, fetchApi } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

  const isSelf = !!user?.id && user.id === id;

  const loadPage = useCallback(async (skip: number, replace: boolean) => {
    if (!id) return;
    try {
      const r: any = await fetchApi(`/users/${id}/posts?skip=${skip}&limit=${PAGE}`);
      const next = Array.isArray(r?.items) ? r.items : [];
      setTotal(r?.total || 0);
      setHasMore(!!r?.has_more);
      setItems(prev => replace ? next : [...prev, ...next]);
    } catch {
      if (replace) setItems([]);
    }
  }, [fetchApi, id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadPage(0, true);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadPage]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPage(0, true);
    setRefreshing(false);
  };

  const onEnd = async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    await loadPage(items.length, false);
    setLoadingMore(false);
  };

  const remove = async (postId: string) => {
    if (!isSelf) return;
    if (!(await confirmDelete("Delete this post?"))) return;
    try {
      await fetchApi(`/posts/${postId}`, { method: "DELETE" });
      setItems(prev => prev.filter(p => p.id !== postId));
      setTotal(t => Math.max(0, t - 1));
    } catch {}
  };

  const mediaItems = items
    .filter(p => p.media_url)
    .map(p => ({ uri: p.media_url, type: p.media_type, title: p.text?.slice(0, 40) }));

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="posts-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Posts{total > 0 ? ` · ${total}` : ""}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
          onEndReached={onEnd}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<Text style={styles.empty}>No posts yet.</Text>}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.brand} style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`user-post-${item.id}`}>
              <View style={styles.cardHead}>
                <Text style={styles.date}>{formatRelative(item.created_at)}</Text>
                {isSelf && (
                  <Pressable testID={`user-post-del-${item.id}`} onPress={() => remove(item.id)} style={styles.delBtn}>
                    <Ionicons name="trash-outline" size={14} color={theme.error} />
                  </Pressable>
                )}
              </View>
              {!!item.text && <Text style={styles.body}>{item.text}</Text>}
              {!!item.media_url && (
                <Pressable
                  onPress={() => {
                    const idx = mediaItems.findIndex(m => m.uri === item.media_url);
                    if (idx >= 0) setViewerIdx(idx);
                  }}
                >
                  <Image source={{ uri: item.media_url }} style={styles.media} resizeMode="cover" />
                  {item.media_type === "video" && (
                    <View style={styles.play}><Ionicons name="play-circle" size={36} color="#fff" /></View>
                  )}
                </Pressable>
              )}
              <View style={styles.metaRow}>
                <Text style={styles.meta}>❤ {item.like_count || 0}</Text>
                <Text style={styles.meta}>💬 {item.comment_count || 0}</Text>
              </View>
            </View>
          )}
        />
      )}

      <MediaViewer
        visible={viewerIdx !== null}
        items={mediaItems}
        initialIndex={viewerIdx ?? 0}
        onClose={() => setViewerIdx(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { ...type.titleLg, color: theme.text, fontWeight: "700" },
  empty: { ...type.bodySm, color: theme.textDim, textAlign: "center", marginTop: 40 },
  card: { backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 14, borderWidth: 1, borderColor: theme.border },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  date: { ...type.tiny, color: theme.textDim },
  delBtn: { padding: 8, borderRadius: theme.radius.md, backgroundColor: theme.bg3 },
  body: { ...type.bodySm, color: theme.text, lineHeight: 20 },
  media: { width: "100%", height: 220, borderRadius: theme.radius.md, marginTop: 10, backgroundColor: theme.bg3 },
  play: { position: "absolute", top: "50%", left: "50%", marginLeft: -18, marginTop: -8 },
  metaRow: { flexDirection: "row", gap: 14, marginTop: 10 },
  meta: { ...type.tiny, color: theme.textDim },
});
