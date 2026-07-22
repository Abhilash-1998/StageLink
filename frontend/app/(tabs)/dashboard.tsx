import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Dashboard() {
  const { user, fetchApi } = useAuth();
  const isOrg = user?.active_role === "organizer";
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi("/dashboard").then(setStats).finally(() => setLoading(false));
  }, [fetchApi]);

  if (loading) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  const Card = ({ label, value, icon }: { label: string; value: string | number; icon: any }) => (
    <View style={styles.metric}>
      <View style={styles.mIcon}><Ionicons name={icon} size={16} color={theme.brand} /></View>
      <Text style={styles.mVal}>{value}</Text>
      <Text style={styles.mLbl}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.header}>
          <Text style={styles.h1}>Insights</Text>
          <Text style={styles.sub}>Your performance at a glance</Text>
        </View>

        <View style={styles.grid}>
          {isOrg ? (
            <>
              <Card label="Active gigs" value={stats?.active_gigs || 0} icon="megaphone-outline" />
              <Card label="Total gigs" value={stats?.total_gigs || 0} icon="calendar-outline" />
              <Card label="Applications" value={stats?.total_applications || 0} icon="people-outline" />
              <Card label="Budget (INR)" value={`₹${(stats?.total_budget || 0).toLocaleString("en-IN")}`} icon="cash-outline" />
            </>
          ) : (
            <>
              <Card label="Applications" value={stats?.total_applications || 0} icon="briefcase-outline" />
              <Card label="Pending" value={stats?.pending || 0} icon="time-outline" />
              <Card label="Accepted" value={stats?.accepted || 0} icon="checkmark-circle-outline" />
              <Card label="Rating" value={`${stats?.rating || 0} ★`} icon="star-outline" />
            </>
          )}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {isOrg ? (
              <Pressable testID="quick-create-gig" onPress={() => router.push("/gig/new")} style={styles.action}>
                <View style={styles.actionIcon}><Ionicons name="add-circle" size={22} color={theme.brand} /></View>
                <View style={{ flex: 1 }}><Text style={styles.actionTitle}>Post a new gig</Text><Text style={styles.actionSub}>Publish and receive applications instantly</Text></View>
                <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
              </Pressable>
            ) : (
              <Pressable testID="quick-subscription" onPress={() => router.push("/subscription")} style={styles.action}>
                <View style={styles.actionIcon}><Ionicons name="diamond" size={20} color={theme.brand} /></View>
                <View style={{ flex: 1 }}><Text style={styles.actionTitle}>Go Premium</Text><Text style={styles.actionSub}>Featured profile, unlimited applications, AI contracts</Text></View>
                <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  h1: { ...type.h1, color: theme.text, fontSize: 28 },
  sub: { ...type.caption, color: theme.textDim, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12 },
  metric: { flexBasis: "47%", flexGrow: 1, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.border },
  mIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  mVal: { ...type.stat, color: theme.text, fontSize: 24 },
  mLbl: { ...type.caption, color: theme.textDim, marginTop: 2 },
  sectionTitle: { ...type.titleLg, color: theme.text, fontWeight: "700", fontSize: 16 },
  action: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, padding: 14, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.border },
  actionIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center" },
  actionTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  actionSub: { ...type.caption, color: theme.textDim, marginTop: 2 },
});
