import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatDate } from "@/src/utils/date";

export default function Applications() {
  const { user, fetchApi } = useAuth();
  const isOrg = user?.active_role === "organizer";
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = isOrg ? await fetchApi("/gigs/mine/list") : await fetchApi("/applications/mine");
    setItems(data as any[]);
  }, [fetchApi, isOrg]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  const onRefresh = async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } };

  if (loading) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>{isOrg ? "Your gigs" : "Your applications"}</Text>
        <Text style={styles.sub}>{isOrg ? "Manage postings and applicants" : "Track your gig applications"}</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(it, i) => (isOrg ? it.id : it.application.id) || String(i)}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => {
          if (isOrg) {
            const filled = item.status === "filled";
            const statusColor = filled ? theme.success : theme.brand;
            return (
              <Pressable testID={`org-gig-${item.id}`} onPress={() => router.push(`/gig/${item.id}`)} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.meta}>{item.city} · {formatDate(item.date)}</Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: `${statusColor}22`, borderColor: statusColor }]}>
                      <Text style={[styles.badgeTxt, { color: statusColor }]}>{filled ? "FILLED" : "OPEN"}</Text>
                    </View>
                    <View style={styles.badge}>
                      <Ionicons name="people" size={11} color={theme.text} />
                      <Text style={styles.badgeTxt}>{item.applications_count} applicants</Text>
                    </View>
                    <Text style={styles.price}>₹{item.budget.toLocaleString("en-IN")}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textDim} />
              </Pressable>
            );
          }
          const g = item.gig; const a = item.application;
          const color = a.status === "pending" ? theme.warning : a.status === "accepted" ? theme.success : theme.error;
          const label =
            a.status === "accepted" ? "ACCEPTED" :
            a.status === "withdrawn" ? "WITHDRAWN" :
            a.status === "rejected" ? (g.status === "filled" ? "NOT SELECTED" : "DECLINED") :
            "PENDING";
          return (
            <Pressable testID={`app-${a.id}`} onPress={() => router.push(`/gig/${g.id}`)} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{g.title}</Text>
                <Text style={styles.meta}>{g.city} · {formatDate(g.date)}</Text>
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: color }]}>
                    <Text style={[styles.badgeTxt, { color }]}>{label}</Text>
                  </View>
                  {g.status === "filled" && a.status !== "accepted" && (
                    <View style={[styles.badge, { backgroundColor: `${theme.textDim}22`, borderColor: theme.textDim }]}>
                      <Text style={[styles.badgeTxt, { color: theme.textDim }]}>FILLED</Text>
                    </View>
                  )}
                  <Text style={styles.price}>₹{g.budget.toLocaleString("en-IN")}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textDim} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={44} color={theme.textDim} />
            <Text style={styles.emptyTxt}>{isOrg ? "No gigs yet. Create your first." : "Apply to gigs to see them here."}</Text>
            {isOrg && <Pressable onPress={() => router.push("/gig/new")} style={styles.cta}><Text style={styles.ctaTxt}>Create Gig</Text></Pressable>}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  h1: { ...type.h1, color: theme.text },
  sub: { ...type.caption, color: theme.textDim, marginTop: 4 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: theme.bg2, padding: 16, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.border },
  title: { ...type.bodyMd, color: theme.text, fontWeight: "700" },
  meta: { ...type.caption, color: theme.textDim, marginTop: 4 },
  badgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, flexWrap: "wrap", gap: 6 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.bg3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.border },
  badgeTxt: { ...type.tiny, color: theme.text, fontWeight: "700", letterSpacing: 0.3 },
  price: { ...type.titleMd, color: theme.brand, fontWeight: "800" },
  empty: { padding: 40, alignItems: "center", gap: 10 },
  emptyTxt: { ...type.bodySm, color: theme.textDim, textAlign: "center" },
  cta: { marginTop: 12, backgroundColor: theme.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: theme.radius.pill },
  ctaTxt: { ...type.label, color: "#fff", fontWeight: "700" },
});
