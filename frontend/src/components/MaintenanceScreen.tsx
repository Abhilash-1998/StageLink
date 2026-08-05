import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme, type } from "@/src/theme";
import { useHealth } from "@/src/context/HealthContext";

/**
 * Shown when GET /health fails or returns ok: false (maintenance).
 */
export function MaintenanceScreen() {
  const { message, refresh, checking } = useHealth();

  return (
    <SafeAreaView style={styles.bg} edges={["top", "bottom"]}>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Ionicons name="construct-outline" size={48} color={theme.brand} />
        </View>
        <Text style={styles.title}>Under maintenance</Text>
        <Text style={styles.sub}>
          {message || "gigZee is under maintenance. Please try again shortly."}
        </Text>
        <Pressable
          testID="retry-health"
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
    marginTop: 10, lineHeight: 22, maxWidth: 320,
  },
  cta: {
    marginTop: 28, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.brand, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: theme.radius.pill, minWidth: 160, justifyContent: "center",
  },
  ctaTxt: { ...type.titleMd, color: "#fff", fontWeight: "700" },
});
