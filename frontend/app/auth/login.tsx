import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.bg}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.sub}>Sign in to your StageLink account</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="login-email-input"
            style={styles.input} value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" placeholder="you@studio.com"
            placeholderTextColor={theme.textDim}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            testID="login-password-input"
            style={styles.input} value={password} onChangeText={setPassword}
            secureTextEntry placeholder="••••••••" placeholderTextColor={theme.textDim}
          />
          {err && <Text style={styles.err} testID="login-error">{err}</Text>}

          <Pressable testID="login-submit-button" onPress={submit} disabled={loading} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Sign In</Text>}
          </Pressable>

          <Pressable testID="go-to-signup" onPress={() => router.replace("/auth/signup")} style={{ marginTop: 20, alignItems: "center" }}>
            <Text style={styles.link}>Don't have an account? <Text style={{ color: theme.brand }}>Create one</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 24, paddingTop: 32 },
  title: { color: theme.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: theme.textDim, fontSize: 15, marginTop: 6, marginBottom: 32 },
  label: { color: theme.textMid, fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 14, color: theme.text, fontSize: 15 },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, marginTop: 28, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16, letterSpacing: 0.3 },
  err: { color: theme.error, marginTop: 12, fontSize: 13 },
  link: { color: theme.textDim, fontSize: 14 },
});
