import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Signup() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const em = email.trim().toLowerCase();
    if (name.trim().length < 2) { setErr("Enter your full name"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setErr("Enter a valid email"); return; }
    if (password.length < 8) { setErr("Password must be at least 8 characters"); return; }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) { setErr("Password must contain letters and numbers"); return; }
    setLoading(true);
    try {
      await register(em, password, name.trim());
      // AuthGate routes to /auth/role
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.bg}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.sub}>Join the live music marketplace</Text>

          <Text style={styles.label}>Full name</Text>
          <TextInput testID="signup-name-input" style={styles.input} value={name} onChangeText={setName} placeholder="Alex Rivera" placeholderTextColor={theme.textDim} />
          <Text style={styles.label}>Email</Text>
          <TextInput testID="signup-email-input" style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@studio.com" placeholderTextColor={theme.textDim} />
          <Text style={styles.label}>Password</Text>
          <TextInput testID="signup-password-input" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="8+ chars, letters and numbers" placeholderTextColor={theme.textDim} />
          {err && <Text style={styles.err} testID="signup-error">{err}</Text>}

          <Pressable testID="signup-submit-button" onPress={submit} disabled={loading} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Create account</Text>}
          </Pressable>
          <Pressable testID="go-to-login" onPress={() => router.replace("/auth/login")} style={{ marginTop: 20, alignItems: "center" }}>
            <Text style={styles.link}>Already have an account? <Text style={{ color: theme.brand }}>Sign in</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 24, paddingTop: 32 },
  title: { ...type.displayMd, color: theme.text, fontSize: 32 },
  sub: { ...type.bodyMd, color: theme.textDim, marginTop: 6, marginBottom: 32 },
  label: { ...type.label, color: theme.textMid, marginBottom: 6, marginTop: 12 },
  input: { ...type.bodyMd, backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 14, color: theme.text },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, marginTop: 28, alignItems: "center" },
  ctaText: { ...type.titleMd, color: "#fff", fontWeight: "700" },
  err: { ...type.caption, color: theme.error, marginTop: 12 },
  link: { ...type.bodySm, color: theme.textDim },
});
