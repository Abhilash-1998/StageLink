import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Modal, FlatList, Image, Dimensions, Pressable, StatusBar, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";

const { width, height } = Dimensions.get("window");

export type MediaItem = { uri: string; type?: "image" | "video"; title?: string };

type Props = {
  visible: boolean;
  items: MediaItem[];
  initialIndex?: number;
  onClose: () => void;
};

export function MediaViewer({ visible, items, initialIndex = 0, onClose }: Props) {
  const listRef = useRef<FlatList>(null);
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    if (visible) {
      setIdx(initialIndex);
      setTimeout(() => listRef.current?.scrollToIndex({ index: initialIndex, animated: false }), 30);
    }
  }, [visible, initialIndex]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar hidden={Platform.OS === "ios" ? false : true} />
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(_, i) => String(i)}
          horizontal pagingEnabled
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
              <Image source={{ uri: item.uri }} style={{ width, height: height * 0.85 }} resizeMode="contain" />
              {item.type === "video" && (
                <View style={styles.playHint}><Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.9)" /></View>
              )}
            </View>
          )}
        />
        <Pressable testID="viewer-close" onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={styles.footer}>
          {items[idx]?.title && <Text style={styles.title} numberOfLines={2}>{items[idx].title}</Text>}
          <Text style={styles.count}>{idx + 1} / {items.length}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  close: { position: "absolute", top: 48, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", bottom: 32, left: 20, right: 20, alignItems: "center" },
  title: { color: "#fff", fontSize: 14, fontWeight: "600", textAlign: "center", marginBottom: 6 },
  count: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  playHint: { position: "absolute", alignItems: "center", justifyContent: "center" },
});
