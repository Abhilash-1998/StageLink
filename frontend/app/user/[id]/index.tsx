import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProfileView } from "@/src/components/ProfileView";

/**
 * Public professional profile viewer — thin container that reuses the same
 * ProfileView component as (tabs)/profile. Loads posts + listings via the
 * public /users/{uid}/entities endpoint so the layout is identical to own.
 */
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, fetchApi } = useAuth();
  const [data, setData] = useState<any>(null);
  const [entities, setEntities] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    if (id === user?.id) { router.replace("/(tabs)/profile"); return; }
    try {
      const [d, ent]: [any, any] = await Promise.all([
        fetchApi(`/profile/musician/${id}`),
        fetchApi(`/users/${id}/entities`).catch(() => null),
      ]);
      setData(d); setEntities(ent);
    } catch { setData(null); setEntities(null); }
    finally { setLoading(false); }
  }, [fetchApi, id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const toggleFollow = async () => {
    setFollowing(!following);
    try { await fetchApi(`/follow/${id}`, { method: "POST" }); }
    catch { setFollowing(following); }
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

  return (
    <ProfileView
      mode="public"
      targetUser={data.user}
      profile={data}
      entities={entities}
      following={following}
      onFollow={toggleFollow}
    />
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10 },
});
