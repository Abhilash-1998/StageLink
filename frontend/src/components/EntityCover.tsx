import { useEffect, useState } from "react";
import { ImageBackground, StyleSheet, ViewStyle, ImageStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CoverKind, resolveCover, DEFAULT_COVERS } from "@/src/utils/covers";
import { theme } from "@/src/theme";

type Props = {
  kind: CoverKind;
  uri?: string | null;
  images?: string[] | null;
  /** Omit when using absoluteFill inside a sized parent. */
  height?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  children?: React.ReactNode;
  showGradient?: boolean;
};

/**
 * Card/hero cover that always shows something: user image → gallery[0] → generic stock.
 * Falls back to the generic cover if the primary URI fails to load.
 */
export function EntityCover({
  kind,
  uri,
  images,
  height,
  style,
  imageStyle,
  children,
  showGradient = true,
}: Props) {
  const primary = resolveCover(kind, uri, images);
  const fallback = DEFAULT_COVERS[kind];
  const [src, setSrc] = useState(primary);

  useEffect(() => {
    setSrc(primary);
  }, [primary]);

  return (
    <ImageBackground
      source={{ uri: src || fallback }}
      style={[{ backgroundColor: theme.bg3 }, height != null ? { height } : null, style]}
      imageStyle={imageStyle}
      onError={() => {
        if (src !== fallback) setSrc(fallback);
      }}
    >
      {showGradient && (
        <LinearGradient colors={["transparent", "rgba(9,9,11,0.85)"]} style={StyleSheet.absoluteFill} />
      )}
      {children}
    </ImageBackground>
  );
}
