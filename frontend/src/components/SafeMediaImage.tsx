import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { theme, type } from "@/src/theme";
import { resolveMediaUrl } from "@/src/utils/mediaUrl";

/** URIs that survive across devices / app restarts (after resolve). */
export function isRenderableMediaUri(uri?: string | null): boolean {
  if (!uri || typeof uri !== "string") return false;
  const u = uri.trim();
  if (!u) return false;
  // Local device paths break after restart and never work for other users.
  if (
    u.startsWith("file://") ||
    u.startsWith("content://") ||
    u.startsWith("ph://") ||
    u.startsWith("/data/") ||
    u.startsWith("/storage/")
  ) {
    return false;
  }
  return (
    u.startsWith("data:image") ||
    u.startsWith("data:video") ||
    u.startsWith("http://") ||
    u.startsWith("https://") ||
    u.startsWith("/api/media/")
  );
}

type Props = {
  uri?: string | null;
  style?: any;
  contentFit?: "cover" | "contain" | "fill";
  isVideo?: boolean;
  recyclingKey?: string;
};

/**
 * Portfolio / profile media renderer.
 * Resolves `/api/media/...` and uses expo-image for reliable decoding.
 */
export function SafeMediaImage({
  uri,
  style,
  contentFit = "cover",
  isVideo,
  recyclingKey,
}: Props) {
  const resolved = resolveMediaUrl(uri);
  const ok = isRenderableMediaUri(uri) && !!resolved;
  if (!ok) {
    return (
      <View style={[styles.fallback, style]}>
        <Ionicons
          name={isVideo ? "videocam-outline" : "image-outline"}
          size={22}
          color={theme.textDim}
        />
        <Text style={styles.fallbackTxt}>
          {isVideo ? "Video unavailable" : "Photo unavailable"}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: resolved! }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      transition={120}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: theme.bg3,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 8,
  },
  fallbackTxt: {
    ...type.tiny,
    color: theme.textDim,
    textAlign: "center",
  },
});
