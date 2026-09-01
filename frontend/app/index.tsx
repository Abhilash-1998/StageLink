import { View, Text, StyleSheet, ActivityIndicator, Image } from "react-native";
import { theme, type } from "@/src/theme";

// Landing/splash. Auth gate in _layout handles routing away from here
// once auth state resolves. Keep this purely visual to avoid race conditions.
export default function Splash() {
  return (
    <View style={styles.bg} testID="splash-screen">
      <View style={styles.center}>
        <Image
          source={require("../assets/images/splash-image.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="gigZee"
        />
        <Text style={styles.tag}>Where live music happens.</Text>
        <ActivityIndicator color={theme.brand} style={{ marginTop: 28 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  logo: { width: 220, height: 220 },
  tag: { ...type.bodyMd, color: theme.textDim, marginTop: 8 },
});
