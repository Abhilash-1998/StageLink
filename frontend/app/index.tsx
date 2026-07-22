import { View, Text, StyleSheet, ActivityIndicator, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme, type } from "@/src/theme";

// Landing/splash. Auth gate in _layout handles routing away from here
// once auth state resolves. Keep this purely visual to avoid race conditions.
export default function Splash() {
  return (
    <ImageBackground
      source={{ uri: "https://images.pexels.com/photos/5389617/pexels-photo-5389617.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" }}
      style={styles.bg}
      testID="splash-screen"
    >
      <LinearGradient colors={["rgba(9,9,11,0.4)", "rgba(9,9,11,0.95)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.center}>
        <Text style={styles.brand}>StageLink</Text>
        <Text style={styles.tag}>Where live music happens.</Text>
        <ActivityIndicator color={theme.brand} style={{ marginTop: 32 }} />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  brand: { ...type.displayLg, color: theme.text, fontSize: 44 },
  tag: { ...type.bodyMd, color: theme.textDim, marginTop: 8 },
});
