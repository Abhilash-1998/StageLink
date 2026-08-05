import { useCallback, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  RefreshControl, Image, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { formatRelative } from "@/src/utils/date";
import { syncAppBadge } from "@/src/notifications/push";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  deep_link?: string | null;
  image_url?: string | null;
  is_read: boolean;
  created_at: string;
  updated_at?: string | null;
  sender_id?: string | null;
  unread_count?: number | null;
  meta?: {
    conversation_id?: string;
    sender_name?: string;
    latest_message?: string;
    latest_timestamp?: string;
  } | null;
};

const ICON_FOR: Record<string, keyof typeof Ionicons.glyphMap> = {
  "messages.new": "chatbubble",
  "social.follow": "person-add",
  "social.post_liked": "heart",
  "social.comment": "chatbox",
  "social.reply": "return-down-forward",
  "social.mention": "at",
  "community.post": "newspaper",
  "gigs.application": "briefcase",
  "gigs.application_accepted": "checkmark-circle",
  "gigs.application_rejected": "close-circle",
  "gigs.cancelled": "close-circle",
  "bands.invitation": "people",
  "equipment.rental_request": "construct",
  "studios.booking_request": "business",
  "lessons.upcoming": "school",
  "system.verification_approved": "shield-checkmark",
  "system.verification_rejected": "shield",
  "system.admin_announcement": "megaphone",
  "system.test": "flash",
  "system.generic": "notifications",
};

function isChat(n: Notif) {
  return n.type === "messages.new";
}

function cardUnreadWeight(n: Notif): number {
  if (n.is_read) return 0;
  if (isChat(n)) return Math.max(1, Number(n.unread_count || 1));
  return 1;
}

function activityAt(n: Notif): string {
  return n.updated_at || n.meta?.latest_timestamp || n.created_at;
}

function relativeLabel(iso: string): string {
  const raw = formatRelative(iso);
  if (raw === "just now") return "Just now";
  if (raw === "Yesterday" || raw.toLowerCase() === "yesterday") return "Yesterday";
  return raw;
}

function groupLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startY = new Date(startToday); startY.setDate(startY.getDate() - 1);
    if (d >= startToday) return "Today";
    if (d >= startY) return "Yesterday";
    return "Earlier";
  } catch {
    return "Earlier";
  }
}

export default function NotificationsScreen() {
  const { fetchApi } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const LIMIT = 30;

  const load = useCallback(async (reset = false) => {
    if (!reset && loadingMoreRef.current) return;
    if (!reset) loadingMoreRef.current = true;
    const off = reset ? 0 : offsetRef.current;
    try {
      const res: {
        items?: Notif[];
        unread?: number;
        total?: number;
      } = await fetchApi(`/notifications?limit=${LIMIT}&offset=${off}`);
      const next: Notif[] = res.items || [];
      setItems((prev) => (reset ? next : [...prev, ...next]));
      const nextUnread = res.unread || 0;
      setUnread(nextUnread);
      syncAppBadge(nextUnread);
      offsetRef.current = off + next.length;
      setHasMore(off + next.length < (res.total || 0));
    } catch {
      if (reset) setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingMoreRef.current = false;
    }
  }, [fetchApi]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    offsetRef.current = 0;
    load(true);
  }, [load]));

  const onRefresh = () => {
    setRefreshing(true);
    offsetRef.current = 0;
    load(true);
  };

  const openNotif = async (n: Notif) => {
    const weight = cardUnreadWeight(n);
    if (!n.is_read) {
      try {
        await fetchApi(`/notifications/${n.id}/read`, { method: "POST" });
        setItems((prev) => prev.map((x) => (
          x.id === n.id ? { ...x, is_read: true, unread_count: 0 } : x
        )));
        setUnread((u) => {
          const next = Math.max(0, u - weight);
          syncAppBadge(next);
          return next;
        });
      } catch {}
    }
    if (n.deep_link) {
      try { router.push(n.deep_link as never); } catch {}
    }
  };

  const markAll = async () => {
    try {
      await fetchApi("/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true, unread_count: 0 })));
      setUnread(0);
      syncAppBadge(0);
    } catch {}
  };

  const remove = async (id: string) => {
    try {
      await fetchApi(`/notifications/${id}`, { method: "DELETE" });
      setItems((prev) => {
        const gone = prev.find((x) => x.id === id);
        if (gone) {
          const weight = cardUnreadWeight(gone);
          if (weight > 0) {
            setUnread((u) => {
              const next = Math.max(0, u - weight);
              syncAppBadge(next);
              return next;
            });
          }
        }
        return prev.filter((x) => x.id !== id);
      });
    } catch {}
  };

  const confirmRemove = (id: string) => {
    Alert.alert("Delete notification?", "This removes it from your inbox.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove(id) },
    ]);
  };

  const sections: { title: string; data: Notif[] }[] = [];
  let last = "";
  for (const n of items) {
    const g = groupLabel(activityAt(n));
    if (g !== last) {
      sections.push({ title: g, data: [] });
      last = g;
    }
    sections[sections.length - 1].data.push(n);
  }
  const flat: ({ kind: "header"; title: string } | { kind: "row"; item: Notif })[] = [];
  for (const s of sections) {
    flat.push({ kind: "header", title: s.title });
    for (const item of s.data) flat.push({ kind: "row", item });
  }

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="notif-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <Pressable testID="notif-mark-all" onPress={markAll} disabled={unread === 0} style={styles.markAll}>
          <Text style={[styles.markAllTxt, unread === 0 && { opacity: 0.4 }]}>Mark all</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <FlatList
          data={flat}
          keyExtractor={(row, i) => (row.kind === "header" ? `h-${row.title}-${i}` : row.item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
          contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
          onEndReached={() => { if (hasMore && !loading && !loadingMoreRef.current) load(false); }}
          onEndReachedThreshold={0.4}
          renderItem={({ item: row }) => {
            if (row.kind === "header") {
              return <Text style={styles.group}>{row.title}</Text>;
            }
            const n = row.item;
            const chat = isChat(n);
            const count = chat ? Math.max(0, Number(n.unread_count || (n.is_read ? 0 : 1))) : 0;
            const showBadge = chat ? count > 0 : !n.is_read;
            const badgeLabel = chat ? String(count > 99 ? "99+" : count) : "";
            const icon = ICON_FOR[n.type] || "notifications-outline";
            const preview = chat
              ? (n.meta?.latest_message || n.body)
              : n.body;

            return (
              <Pressable
                testID={`notif-${n.id}`}
                onPress={() => openNotif(n)}
                onLongPress={() => confirmRemove(n.id)}
                style={[styles.row, !n.is_read && styles.rowUnread]}
              >
                {n.image_url ? (
                  <Image source={{ uri: n.image_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.iconWrap}>
                    <Ionicons name={icon as never} size={16} color={theme.brand} />
                  </View>
                )}
                <View style={styles.content}>
                  <View style={styles.titleRow}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{n.title}</Text>
                    <Text style={styles.rowTime}>{relativeLabel(activityAt(n))}</Text>
                  </View>
                  <View style={styles.bodyRow}>
                    <Text style={styles.rowBody} numberOfLines={1}>{preview}</Text>
                    {showBadge && (
                      chat ? (
                        <View style={styles.countBadge}>
                          <Text style={styles.countBadgeTxt}>{badgeLabel}</Text>
                        </View>
                      ) : (
                        <View style={styles.dot} />
                      )
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { ...type.titleLg, color: theme.text, flex: 1, textAlign: "center", fontWeight: "800" },
  markAll: { paddingHorizontal: 8, paddingVertical: 8 },
  markAllTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { ...type.bodySm, color: theme.textDim, textAlign: "center", marginTop: 48 },
  group: {
    ...type.tiny, color: theme.textDim, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 0.5, marginTop: 12, marginBottom: 6,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.bg2, borderRadius: theme.radius.md, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: theme.border, marginBottom: 6,
  },
  rowUnread: { borderColor: theme.brand, backgroundColor: theme.brandTint },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.bg3 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: theme.brandTint,
    borderWidth: 1, borderColor: theme.brand, alignItems: "center", justifyContent: "center",
  },
  content: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { ...type.bodySm, color: theme.text, fontWeight: "700", flex: 1 },
  rowTime: { ...type.tiny, color: theme.textDim },
  bodyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  rowBody: { ...type.caption, color: theme.textMid, flex: 1, lineHeight: 16 },
  countBadge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: theme.brand, alignItems: "center", justifyContent: "center",
  },
  countBadgeTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.brand },
});
