import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme, type } from "@/src/theme";
import { useNetwork } from "@/src/context/NetworkContext";

/**
 * Full-screen gate shown when the device has no network / internet.
 */
export function NoInternetScreen() {
  const { refresh, checking } = useNetwork();

  return (
    <SafeAreaView style={styles.bg} edges={["top", "bottom"]}>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.brand} />
        </View>
        <Text style={styles.title}>No internet connection</Text>
        <Text style={styles.sub}>
          Check your Wi‑Fi or mobile data and try again.
        </Text>
        <Pressable
          testID="retry-internet"
          onPress={() => refresh()}
          disabled={checking}
          style={styles.cta}
        >
          {checking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.ctaTxt}>Try again</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand,
    alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
  title: { ...type.h1, color: theme.text, textAlign: "center", fontSize: 24 },
  sub: {
    ...type.bodySm, color: theme.textDim, textAlign: "center",
    marginTop: 10, lineHeight: 22, maxWidth: 300,
  },
  cta: {
    marginTop: 28, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.brand, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: theme.radius.pill, minWidth: 160, justifyContent: "center",
  },
  ctaTxt: { ...type.titleMd, color: "#fff", fontWeight: "700" },
});
