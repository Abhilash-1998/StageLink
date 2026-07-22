import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

type Tab = "followers" | "following";

/**
 * User connections list — reused for both Followers and Following.
 * Route: /user/{id}/connections?tab=followers|following
 * Every entry is a Pressable that navigates to /user/{id} (or /(tabs)/profile
 * if it's the current user).
 */
export default function Connections() {
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { user, fetchApi } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab === "following" ? "following" : "followers");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setItems([]);
    try {
      const data: any[] = await fetchApi(`/users/${id}/${tab}`);
      setItems(Array.isArray(data) ? data.filter(x => x?.id) : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [fetchApi, id, tab]);

  useEffect(() => { load(); }, [load]);

  const openUser = (uid: string) => {
    if (uid === user?.id) router.replace("/(tabs)/profile");
    else router.push(`/user/${uid}`);
  };

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="conn-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Connections</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.tabRow}>
        <Pressable testID="conn-tab-followers" onPress={() => setTab("followers")} style={[styles.tabBtn, tab === "followers" && styles.tabOn]}>
          <Text style={[styles.tabTxt, tab === "followers" && styles.tabTxtOn]}>Followers</Text>
        </Pressable>
        <Pressable testID="conn-tab-following" onPress={() => setTab("following")} style={[styles.tabBtn, tab === "following" && styles.tabOn]}>
          <Text style={[styles.tabTxt, tab === "following" && styles.tabTxtOn]}>Following</Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListEmptyComponent={<View style={styles.center}><Text style={{ color: theme.textDim }}>No {tab} yet.</Text></View>}
          renderItem={({ item }) => (
            <Pressable testID={`conn-user-${item.id}`} onPress={() => openUser(item.id)} style={styles.row}>
              <View style={styles.avatar}>
                {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={{ width: "100%", height: "100%" }} /> :
                  <Text style={styles.avatarTxt}>{(item.full_name || "?").charAt(0)}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text style={styles.name}>{item.full_name || "—"}</Text>
                  {item.verified && <Ionicons name="checkmark-circle" size={13} color={theme.brand} />}
                </View>
                {(item.tagline || item.city) && (
                  <Text style={styles.meta} numberOfLines={1}>{item.tagline || item.city}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
            </Pressable>
          )}
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
  tabRow: { flexDirection: "row", marginHorizontal: 16, backgroundColor: theme.bg2, borderRadius: theme.radius.pill, padding: 4, borderWidth: 1, borderColor: theme.border },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: theme.radius.pill },
  tabOn: { backgroundColor: theme.brand },
  tabTxt: { ...type.caption, color: theme.textDim, fontWeight: "700" },
  tabTxtOn: { color: "#fff" },
  center: { padding: 60, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, borderRadius: theme.radius.md, padding: 12, borderWidth: 1, borderColor: theme.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.bg3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarTxt: { ...type.titleMd, color: theme.text, fontWeight: "700" },
  name: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  meta: { ...type.caption, color: theme.textDim, marginTop: 2 },
});
