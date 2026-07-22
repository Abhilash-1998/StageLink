import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Image, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatRelative } from "@/src/utils/date";

type Thread = {
  user: { id: string; full_name: string; avatar_url?: string | null };
  last_message: { text: string; created_at: string; from_id: string };
  unread: number;
};

export default function Messages() {
  const { user, fetchApi } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setThreads(await fetchApi<Thread[]>("/threads")); } catch { setThreads([]); }
  }, [fetchApi]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } };

  if (loading) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Messages</Text>
        <Text style={styles.sub}>Bookings, chats, community</Text>
      </View>
      <FlatList
        data={threads}
        keyExtractor={t => t.user.id}
        contentContainerStyle={{ paddingBottom: 130 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
        renderItem={({ item }) => (
          <View style={styles.thread} testID={`thread-row-${item.user.id}`}>
            <Pressable testID={`thread-avatar-${item.user.id}`} onPress={() => router.push(`/user/${item.user.id}`)} style={styles.avatar}>
              {item.user.avatar_url ? <Image source={{ uri: item.user.avatar_url }} style={{ width: "100%", height: "100%" }} /> :
                <Text style={styles.avTxt}>{item.user.full_name[0]}</Text>}
            </Pressable>
            <Pressable testID={`thread-${item.user.id}`} onPress={() => router.push(`/chat/${item.user.id}`)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.name}>{item.user.full_name}</Text>
                  <Text style={styles.time}>{formatRelative(item.last_message.created_at)}</Text>
                </View>
                <Text style={[styles.preview, item.unread > 0 && { color: theme.text, fontWeight: "600" }]} numberOfLines={1}>
                  {item.last_message.from_id === user?.id ? "You: " : ""}{item.last_message.text}
                </Text>
              </View>
              {item.unread > 0 && (
                <View style={styles.badge}><Text style={styles.badgeTxt}>{item.unread}</Text></View>
              )}
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={44} color={theme.textDim} />
            <Text style={styles.emptyTxt}>No conversations yet</Text>
            <Text style={styles.emptySub}>Message a musician or organizer from their profile.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  h1: { ...type.h1, color: theme.text },
  sub: { ...type.caption, color: theme.textDim, marginTop: 4 },
  thread: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.bg2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avTxt: { ...type.titleLg, color: theme.text, fontWeight: "700" },
  name: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  time: { ...type.tiny, color: theme.textDim },
  preview: { ...type.caption, color: theme.textDim, marginTop: 3 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" },
  badgeTxt: { ...type.tiny, color: "#fff", fontWeight: "700" },
  empty: { padding: 48, alignItems: "center", gap: 8 },
  emptyTxt: { ...type.titleMd, color: theme.text, fontWeight: "700", marginTop: 8 },
  emptySub: { ...type.caption, color: theme.textDim, textAlign: "center" },
});
