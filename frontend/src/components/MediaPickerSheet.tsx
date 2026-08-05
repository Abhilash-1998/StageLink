import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, Platform, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { theme, type } from "@/src/theme";

export type PickedMedia = {
  uri: string;              // data URI (base64) or file uri
  base64?: string;          // raw base64 (no prefix) when includeBase64
  type: "image" | "video";
  width?: number;
  height?: number;
};

async function ensureLibraryPermission(): Promise<boolean> {
  const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return req.granted;
}

async function ensureCameraPermission(): Promise<boolean> {
  const cur = await ImagePicker.getCameraPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const req = await ImagePicker.requestCameraPermissionsAsync();
  return req.granted;
}

// Compress to <= maxWidth, jpeg quality, return durable data URI.
async function compressToDataUri(
  uri: string,
  opts?: { maxWidth?: number; quality?: number },
): Promise<string> {
  if (Platform.OS === "web") {
    return uri; // web picker already returns a data URI or blob URL
  }
  const maxWidth = opts?.maxWidth ?? 1024;
  const quality = opts?.quality ?? 0.7;
  const r = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!r.base64) {
    throw new Error("Could not process image. Please try another photo.");
  }
  return `data:image/jpeg;base64,${r.base64}`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onPicked: (items: PickedMedia[]) => void;
  allowsMultiple?: boolean;
  allowVideo?: boolean;
  allowImage?: boolean;
  /** Cap library multi-select (default 8). */
  selectionLimit?: number;
  aspect?: [number, number];
  allowEditing?: boolean;
  /** Smaller = lighter portfolio payloads (Android-friendly). */
  imageMaxWidth?: number;
  imageQuality?: number;
};

export function MediaPickerSheet({
  visible,
  onClose,
  onPicked,
  allowsMultiple,
  allowVideo,
  allowImage = true,
  selectionLimit,
  aspect,
  allowEditing,
  imageMaxWidth,
  imageQuality,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [permError, setPermError] = useState<string | null>(null);
  const limit = Math.max(1, selectionLimit ?? (allowsMultiple ? 8 : 1));

  const handlePick = async (source: "camera" | "library", forceVideo = false) => {
    setPermError(null);
    const mediaTypes = forceVideo || (allowVideo && !allowImage)
      ? ImagePicker.MediaTypeOptions.Videos
      : allowVideo && allowImage
        ? ImagePicker.MediaTypeOptions.All
        : ImagePicker.MediaTypeOptions.Images;

    const granted = source === "camera" ? await ensureCameraPermission() : await ensureLibraryPermission();
    if (!granted) {
      setPermError(source === "camera"
        ? "Camera permission denied. Enable it in Settings to take photos."
        : "Photo library permission denied. Enable it in Settings to choose media.");
      return;
    }

    setBusy(source);
    try {
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes, quality: 0.85, allowsEditing: !!allowEditing,
        allowsMultipleSelection: source === "library" && !!allowsMultiple,
        selectionLimit: allowsMultiple ? limit : 1,
      };
      if (aspect) opts.aspect = aspect;
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.length) return;

      const out: PickedMedia[] = [];
      for (const a of result.assets) {
        const isVideo = a.type === "video" || (a.uri?.toLowerCase().includes(".mp4"));
        if (isVideo) {
          // Local video URIs are not durable — refuse until cloud upload exists.
          throw new Error("Portfolio videos need cloud upload (coming soon). Please add photos for now.");
        } else {
          const dataUri = await compressToDataUri(a.uri, {
            maxWidth: imageMaxWidth,
            quality: imageQuality,
          });
          out.push({ uri: dataUri, type: "image", width: a.width, height: a.height });
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onPicked(out);
      onClose();
    } catch (e: any) {
      setPermError(e?.message || "Something went wrong picking media.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Add media</Text>
          <Text style={styles.sub}>Choose a source</Text>

          {permError && (
            <View style={styles.errBox}>
              <Text style={styles.errTxt}>{permError}</Text>
              <Pressable testID="open-settings" onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
                <Text style={styles.settingsTxt}>Open Settings</Text>
              </Pressable>
            </View>
          )}

          {allowImage && (
            <Pressable testID="pick-camera" onPress={() => handlePick("camera")} disabled={!!busy} style={styles.row}>
              <View style={styles.iconWrap}><Ionicons name="camera" size={22} color={theme.brand} /></View>
              <View style={{ flex: 1 }}><Text style={styles.rowTitle}>Take a photo</Text><Text style={styles.rowSub}>Use your camera</Text></View>
              {busy === "camera" ? <ActivityIndicator color={theme.brand} /> : <Ionicons name="chevron-forward" size={18} color={theme.textDim} />}
            </Pressable>
          )}

          {allowVideo && (
            <Pressable testID="pick-camera-video" onPress={() => handlePick("camera", true)} disabled={!!busy} style={styles.row}>
              <View style={styles.iconWrap}><Ionicons name="videocam" size={22} color={theme.brand} /></View>
              <View style={{ flex: 1 }}><Text style={styles.rowTitle}>Record a video</Text><Text style={styles.rowSub}>Capture with your camera</Text></View>
              {busy === "camera" ? <ActivityIndicator color={theme.brand} /> : <Ionicons name="chevron-forward" size={18} color={theme.textDim} />}
            </Pressable>
          )}

          <Pressable testID="pick-library" onPress={() => handlePick("library")} disabled={!!busy} style={styles.row}>
            <View style={styles.iconWrap}><Ionicons name="images" size={22} color={theme.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Choose from library</Text>
              <Text style={styles.rowSub}>
                {allowsMultiple ? `Pick up to ${limit}` : "Pick one"}
                {allowImage && allowVideo ? " · photos or videos" : allowVideo ? " · video" : " · photos"}
              </Text>
            </View>
            {busy === "library" ? <ActivityIndicator color={theme.brand} /> : <Ionicons name="chevron-forward" size={18} color={theme.textDim} />}
          </Pressable>

          <Pressable testID="picker-cancel" onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, borderTopWidth: 1, borderColor: theme.border },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, marginBottom: 12 },
  title: { ...type.titleLg, color: theme.text, fontWeight: "800" },
  sub: { ...type.bodySm, color: theme.textDim, marginTop: 4, marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg, padding: 14, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border, marginBottom: 8 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center" },
  rowTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  rowSub: { ...type.caption, color: theme.textDim, marginTop: 2 },
  cancel: { alignItems: "center", padding: 12, marginTop: 4 },
  cancelTxt: { ...type.bodySm, color: theme.textDim, fontWeight: "600" },
  errBox: { padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand, marginBottom: 12 },
  errTxt: { ...type.bodySm, color: theme.text },
  settingsBtn: { marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.brand },
  settingsTxt: { ...type.caption, color: "#fff", fontWeight: "700" },
});
