import Constants from "expo-constants";
import { Platform } from "react-native";

type TrackOpts = {
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
};

type FetchApi = <T = any>(path: string, opts?: RequestInit) => Promise<T>;

/**
 * Thin analytics client. Never throws to callers — analytics must not break UX.
 */
export function createAnalytics(fetchApi: FetchApi) {
  const track = async (event_name: string, opts: TrackOpts = {}) => {
    try {
      await fetchApi("/analytics/track", {
        method: "POST",
        body: JSON.stringify({
          event_name,
          entity_type: opts.entity_type,
          entity_id: opts.entity_id,
          metadata: opts.metadata || {},
          platform: Platform.OS,
          device: Platform.OS,
          app_version: Constants.expoConfig?.version || "1.0.0",
        }),
      });
    } catch {
      // swallow
    }
  };

  return {
    track,
    appOpened: () => track("app_opened", { metadata: { funnel: true } }),
    profileViewed: (id: string) => track("profile_viewed", { entity_type: "user", entity_id: id }),
    search: (q: string) => track("search", { metadata: { q } }),
    filterApplied: (meta: Record<string, any>) => track("filter_applied", { metadata: meta }),
    gigViewed: (id: string) => track("gig_viewed", { entity_type: "gig", entity_id: id }),
    studioViewed: (id: string) => track("studio_viewed", { entity_type: "studio", entity_id: id }),
  };
}
