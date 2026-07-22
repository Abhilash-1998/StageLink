import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileTab() {
  const { user, fetchApi, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const url = user.role === "musician" ? `/profile/musician/${user.id}` : `/profile/organizer/${user.id}`;
    fetchApi(url).then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, [fetchApi, user]);

  if (loading) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  const p = profile?.profile || {};
  const isMusician = user?.role === "musician";
  const initials = user?.full_name?.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.cover}>
          <LinearGradient colors={[theme.brand2, theme.bg]} style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            {user?.avatar_url ? <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} /> : <Text style={styles.avatarTxt}>{initials}</Text>}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.name}>{user?.full_name}</Text>
            <Text style={styles.role}>{isMusician ? `${p.city || "—"} · ${p.experience_years || 0}y experience` : (p.org_name || "Organizer")}</Text>
          </View>
        </View>

        {isMusician && profile?.rating > 0 && (
          <View style={styles.statsBar}>
            <View style={styles.stat}><Text style={styles.statNum}>{profile.rating}</Text><Text style={styles.statLbl}>★ Rating</Text></View>
            <View style={styles.statDiv} />
            <View style={styles.stat}><Text style={styles.statNum}>{profile.review_count}</Text><Text style={styles.statLbl}>Reviews</Text></View>
            <View style={styles.statDiv} />
            <View style={styles.stat}><Text style={styles.statNum}>{profile.reliability}%</Text><Text style={styles.statLbl}>Reliable</Text></View>
          </View>
        )}

        {p.bio && (<View style={styles.section}><Text style={styles.sTitle}>About</Text><Text style={styles.bio}>{p.bio}</Text></View>)}

        {isMusician && (
          <>
            {p.genres?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sTitle}>Genres</Text>
                <View style={styles.chipRow}>{p.genres.map((g: string) => <View key={g} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}</View>
              </View>
            )}
            {p.instruments?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sTitle}>Instruments</Text>
                <View style={styles.chipRow}>{p.instruments.map((g: string) => <View key={g} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>)}</View>
              </View>
            )}
            {p.pricing_per_hour > 0 && (
              <View style={styles.section}>
                <Text style={styles.sTitle}>Pricing</Text>
                <Text style={styles.price}>₹{p.pricing_per_hour.toLocaleString("en-IN")} / hour</Text>
              </View>
            )}
          </>
        )}

        <View style={{ padding: 20, gap: 10, marginTop: 8 }}>
          <Pressable testID="go-subscription" onPress={() => router.push("/subscription")} style={styles.rowBtn}>
            <Ionicons name="diamond-outline" size={18} color={theme.brand} />
            <Text style={styles.rowBtnTxt}>Upgrade to Premium</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          <Pressable testID="edit-profile" onPress={() => router.push("/auth/onboarding")} style={styles.rowBtn}>
            <Ionicons name="create-outline" size={18} color={theme.text} />
            <Text style={styles.rowBtnTxt}>Edit profile</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          <Pressable testID="logout-btn" onPress={async () => { await logout(); router.replace("/auth/login"); }} style={[styles.rowBtn, { borderColor: theme.error }]}>
            <Ionicons name="log-out-outline" size={18} color={theme.error} />
            <Text style={[styles.rowBtnTxt, { color: theme.error }]}>Sign out</Text>
            <View style={{ width: 18 }} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { height: 100 },
  headerRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 20, marginTop: -34 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.bg2, borderWidth: 3, borderColor: theme.bg, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarTxt: { color: theme.text, fontSize: 30, fontWeight: "800" },
  name: { color: theme.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  role: { color: theme.textDim, fontSize: 13, marginTop: 4 },
  statsBar: { flexDirection: "row", marginHorizontal: 20, marginTop: 20, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.border, paddingVertical: 14 },
  stat: { flex: 1, alignItems: "center" },
  statNum: { color: theme.text, fontSize: 18, fontWeight: "800" },
  statLbl: { color: theme.textDim, fontSize: 11, marginTop: 3 },
  statDiv: { width: 1, backgroundColor: theme.border },
  section: { paddingHorizontal: 20, marginTop: 22 },
  sTitle: { color: theme.text, fontSize: 15, fontWeight: "700", marginBottom: 8 },
  bio: { color: theme.textMid, fontSize: 14, lineHeight: 21 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: theme.bg2, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: theme.border },
  tagTxt: { color: theme.textMid, fontSize: 12, fontWeight: "500" },
  price: { color: theme.brand, fontSize: 20, fontWeight: "800" },
  rowBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, padding: 16, borderWidth: 1, borderColor: theme.border },
  rowBtnTxt: { color: theme.text, fontSize: 14, fontWeight: "600", flex: 1 },
});
