import { useEffect, useState, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProfileView } from "@/src/components/ProfileView";

/**
 * Own profile tab — thin container that loads data and delegates rendering
 * to the shared ProfileView component (same one used for /user/[id]).
 */
export default function ProfileTab() {
  const { user, fetchApi, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [completion, setCompletion] = useState<any>(null);
  const [entities, setEntities] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [p, c, e] = await Promise.all([
        fetchApi(`/profile/musician/${user.id}`).catch(() => null),
        fetchApi("/profile/completion").catch(() => null),
        fetchApi("/entities/mine").catch(() => null),
      ]);
      setProfile(p); setCompletion(c); setEntities(e);
    } finally { setLoading(false); }
  }, [fetchApi, user]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onDelete = async (path: string) => {
    try { await fetchApi(path, { method: "DELETE" }); } catch {}
    await load();
  };

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.brand} />
      </View>
    </SafeAreaView>
  );

  return (
    <ProfileView
      mode="own"
      targetUser={user}
      profile={profile}
      entities={entities}
      completion={completion}
      onEdit={() => router.push("/profile/edit")}
      onLogout={async () => { await logout(); }}
      onDelete={onDelete}
    />
  );
}
