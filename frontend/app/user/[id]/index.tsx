import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProfileView, ProfilePayload } from "@/src/components/ProfileView";

/**
 * Public professional profile viewer — identical wrapper to (tabs)/profile.
 * Both call the unified GET /api/profile/{userId} endpoint; the response's
 * `permissions` field is what makes the buttons differ.
 */
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, fetchApi } = useAuth();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    if (id === user?.id) { router.replace("/(tabs)/profile"); return; }
    try {
      const d: ProfilePayload = await fetchApi(`/profile/${id}`);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [fetchApi, id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const onFollowToggle = async () => {
    try { await fetchApi(`/follow/${id}`, { method: "POST" }); } catch {}
    await load();
  };

  if (loading) return (
    <SafeAreaView style={styles.bg}>
      <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
    </SafeAreaView>
  );
  if (!data) return (
    <SafeAreaView style={styles.bg}>
      <View style={styles.center}>
        <Text style={{ ...type.bodySm, color: theme.textDim }}>Profile not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ ...type.label, color: theme.brand }}>Go back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );

  return <ProfileView data={data} onFollowToggle={onFollowToggle} />;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10 },
});
