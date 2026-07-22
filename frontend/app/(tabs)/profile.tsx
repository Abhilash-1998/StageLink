import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileTab() {
  const { user, fetchApi, logout, refreshUser } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [entities, setEntities] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const isMusician = user?.active_role === "musician";
  const hasBoth = (user?.roles?.length || 0) >= 2;

  const load = useCallback(async () => {
    if (!user) return;
    const url = user.active_role === "organizer"
      ? `/profile/organizer/${user.id}`
      : `/profile/musician/${user.id}`;
    try {
      const [p, e] = await Promise.all([
        fetchApi(url).catch(() => null),
        fetchApi("/entities/mine").catch(() => null),
      ]);
      setProfile(p); setEntities(e);
    } finally { setLoading(false); }
  }, [fetchApi, user]);

  useEffect(() => { load(); }, [load]);

  const switchRole = async (r: "musician" | "organizer") => {
    if (user?.active_role === r) return;
    setSwitching(true);
    try {
      await fetchApi("/auth/active-role", { method: "POST", body: JSON.stringify({ active_role: r }) });
      await refreshUser();
    } finally { setSwitching(false); }
  };

  if (loading) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  const p = profile?.profile || {};
  const initials = user?.full_name?.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  const totalListings = (entities?.gigs?.length || 0) + (entities?.bands?.length || 0)
                      + (entities?.equipment?.length || 0) + (entities?.studios?.length || 0)
                      + (entities?.lessons?.length || 0);

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={styles.cover}>
          <LinearGradient colors={[theme.brand2, theme.bg]} style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            {user?.avatar_url ? <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} /> :
              <Text style={styles.avatarTxt}>{initials}</Text>}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.name}>{user?.full_name}</Text>
              {user?.verified && <Ionicons name="checkmark-circle" size={16} color={theme.brand} />}
              {user?.premium && <View style={styles.proTag}><Text style={styles.proTagTxt}>PRO</Text></View>}
            </View>
            <Text style={styles.role}>{p.city || "—"}{p.experience_years ? ` · ${p.experience_years}y` : ""}</Text>
          </View>
        </View>

        {/* Role switcher */}
        {hasBoth && (
          <View style={styles.switcher}>
            <Pressable testID="role-musician-btn" disabled={switching} onPress={() => switchRole("musician")} style={[styles.switchBtn, isMusician && styles.switchOn]}>
              <Ionicons name="musical-notes" size={14} color={isMusician ? "#fff" : theme.textDim} />
              <Text style={[styles.switchTxt, isMusician && styles.switchTxtOn]}>Musician</Text>
            </Pressable>
            <Pressable testID="role-organizer-btn" disabled={switching} onPress={() => switchRole("organizer")} style={[styles.switchBtn, !isMusician && styles.switchOn]}>
              <Ionicons name="megaphone" size={14} color={!isMusician ? "#fff" : theme.textDim} />
              <Text style={[styles.switchTxt, !isMusician && styles.switchTxtOn]}>Organizer</Text>
            </Pressable>
          </View>
        )}

        {isMusician && profile?.rating !== undefined && (
          <View style={styles.statsBar}>
            <View style={styles.stat}><Text style={styles.statNum}>{profile.rating || "0.0"}</Text><Text style={styles.statLbl}>★ Rating</Text></View>
            <View style={styles.statDiv} />
            <View style={styles.stat}><Text style={styles.statNum}>{profile.review_count || 0}</Text><Text style={styles.statLbl}>Reviews</Text></View>
            <View style={styles.statDiv} />
            <View style={styles.stat}><Text style={styles.statNum}>{profile.reliability || 0}%</Text><Text style={styles.statLbl}>Reliable</Text></View>
            <View style={styles.statDiv} />
            <View style={styles.stat}><Text style={styles.statNum}>{profile.followers || 0}</Text><Text style={styles.statLbl}>Followers</Text></View>
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

        {/* Quick links */}
        <View style={{ padding: 20, gap: 10, marginTop: 4 }}>
          <Pressable testID="go-applications" onPress={() => router.push("/(tabs)/applications")} style={styles.rowBtn}>
            <Ionicons name="briefcase-outline" size={18} color={theme.text} />
            <Text style={styles.rowBtnTxt}>My applications & gigs</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          <Pressable testID="go-dashboard" onPress={() => router.push("/(tabs)/dashboard")} style={styles.rowBtn}>
            <Ionicons name="stats-chart-outline" size={18} color={theme.text} />
            <Text style={styles.rowBtnTxt}>Insights & analytics</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          {totalListings > 0 && (
            <Pressable testID="my-listings" onPress={() => router.push("/(tabs)/discover")} style={styles.rowBtn}>
              <Ionicons name="grid-outline" size={18} color={theme.text} />
              <Text style={styles.rowBtnTxt}>My listings</Text>
              <View style={styles.countBadge}><Text style={styles.countBadgeTxt}>{totalListings}</Text></View>
              <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
            </Pressable>
          )}
          <Pressable testID="go-subscription" onPress={() => router.push("/subscription")} style={styles.rowBtn}>
            <Ionicons name="diamond-outline" size={18} color={theme.brand} />
            <Text style={styles.rowBtnTxt}>Upgrade to Pro</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          <Pressable testID="edit-profile" onPress={() => router.push("/auth/onboarding")} style={styles.rowBtn}>
            <Ionicons name="create-outline" size={18} color={theme.text} />
            <Text style={styles.rowBtnTxt}>Edit profile</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>
          <Pressable testID="logout-btn" onPress={async () => { await logout(); }} style={[styles.rowBtn, { borderColor: theme.error }]}>
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
  proTag: { backgroundColor: theme.brand, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  proTagTxt: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  switcher: { flexDirection: "row", marginHorizontal: 20, marginTop: 20, backgroundColor: theme.bg2, borderRadius: theme.radius.pill, padding: 4, borderWidth: 1, borderColor: theme.border },
  switchBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: theme.radius.pill },
  switchOn: { backgroundColor: theme.brand },
  switchTxt: { color: theme.textDim, fontSize: 13, fontWeight: "600" },
  switchTxtOn: { color: "#fff", fontWeight: "700" },
  statsBar: { flexDirection: "row", marginHorizontal: 20, marginTop: 20, backgroundColor: theme.bg2, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.border, paddingVertical: 14 },
  stat: { flex: 1, alignItems: "center" },
  statNum: { color: theme.text, fontSize: 17, fontWeight: "800" },
  statLbl: { color: theme.textDim, fontSize: 10, marginTop: 3 },
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
  countBadge: { backgroundColor: theme.brandTint, borderColor: theme.brand, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.pill },
  countBadgeTxt: { color: theme.brand, fontSize: 11, fontWeight: "700" },
});
