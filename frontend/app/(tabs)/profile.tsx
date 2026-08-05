import { useEffect, useState, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProfileView, ProfilePayload } from "@/src/components/ProfileView";

/**
 * Own profile tab — identical wrapper to /user/[id]. Both call the unified
 * GET /api/profile/{userId} endpoint. The rendered layout is 100% the same;
 * the response's `permissions` field decides which action buttons show.
 */
export default function ProfileTab() {
  const { user, fetchApi } = useAuth();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const d: ProfilePayload = await fetchApi(`/profile/${user.id}`);
      // If unified profile has no portfolio yet, fall back to musician profile
      // (handles older API / duplicate-row edge cases).
      const existing = d?.profile?.portfolio_items;
      if (!Array.isArray(existing) || existing.length === 0) {
        try {
          const m: any = await fetchApi(`/profile/musician/${user.id}`);
          const items = m?.profile?.portfolio_items;
          if (Array.isArray(items) && items.length > 0) {
            d.profile = { ...(d.profile || {}), portfolio_items: items };
          }
        } catch { /* keep unified payload */ }
      }
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [fetchApi, user?.id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onDelete = async (path: string) => {
    try { await fetchApi(path, { method: "DELETE" }); } catch {}
    await load();
  };

  if (loading || !data) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.brand} />
      </View>
    </SafeAreaView>
  );

  return <ProfileView data={data} onDelete={onDelete} />;
}
