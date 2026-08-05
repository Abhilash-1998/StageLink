import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { theme, type } from "@/src/theme";

// Landing/splash. Auth gate in _layout handles routing away from here
// once auth state resolves. Keep this purely visual to avoid race conditions.
export default function Splash() {
  return (
    <View style={styles.bg} testID="splash-screen">
      <View style={styles.center}>
        <Text style={styles.brand}>gigZee</Text>
        <Text style={styles.tag}>Where live music happens.</Text>
        <ActivityIndicator color={theme.brand} style={{ marginTop: 32 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  brand: { ...type.displayLg, color: theme.text },
  tag: { ...type.bodyMd, color: theme.textDim, marginTop: 8 },
});
