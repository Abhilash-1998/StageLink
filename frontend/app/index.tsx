import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";

export default function Splash() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      if (!user) router.replace("/auth/login");
      else if (!user.role) router.replace("/auth/role");
      else if (!user.onboarded) router.replace("/auth/onboarding");
      else router.replace("/(tabs)");
    }, 900);
    return () => clearTimeout(t);
  }, [user, loading]);

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
  brand: { color: theme.text, fontSize: 44, fontWeight: "800", letterSpacing: -1 },
  tag: { color: theme.textDim, fontSize: 15, marginTop: 8 },
});
