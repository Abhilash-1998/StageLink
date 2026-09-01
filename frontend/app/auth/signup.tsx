import { useEffect, useCallback, useState } from "react";
import {
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { OtpInput } from "@/src/components/auth/OtpInput";
import { useAuth } from "@/src/context/AuthContext";
import { useSignup } from "@/src/context/SignupContext";
import { theme, type } from "@/src/theme";

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Signup() {
  const { register } = useAuth();
  const signup = useSignup();
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountErr, setAccountErr] = useState<string | null>(null);
  const [accountTouched, setAccountTouched] = useState(false);

  useEffect(() => {
    const id = setInterval(signup.tickCountdowns, 1000);
    signup.tickCountdowns();
    return () => clearInterval(id);
  }, [signup.tickCountdowns]);

  useEffect(() => () => signup.resetSignup(), [signup.resetSignup]);

  const goLogin = useCallback(() => {
    signup.resetSignup();
    router.replace("/auth/login");
  }, [signup]);

  const validateAccount = (): string | null => {
    const name = signup.fullName.trim();
    const pw = signup.password;
    if (name.length < 2) return "Enter your full name";
    if (pw.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must contain letters and numbers";
    if (!signup.verificationToken) return "Email verification required. Verify your email to continue.";
    return null;
  };

  const handleAccountSubmit = async () => {
    if (accountLoading || signup.loading) return;
    setAccountTouched(true);
    setAccountErr(null);
    const validationErr = validateAccount();
    if (validationErr) {
      setAccountErr(validationErr);
      return;
    }
    setAccountLoading(true);
    try {
      await register(
        signup.email,
        signup.password,
        signup.fullName.trim(),
        signup.verificationToken!,
      );
      signup.resetSignup();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Registration failed";
      if (/verification|expired|invalid email/i.test(msg)) {
        signup.changeEmail();
        signup.setError(`${msg} Please verify your email again.`);
      } else {
        setAccountErr(msg);
      }
    } finally {
      setAccountLoading(false);
    }
  };

  const accountValidationErr = signup.step === "account" && accountTouched ? validateAccount() : null;
  const showAccountErr = accountErr || signup.error || accountValidationErr;

  return (
    <SafeAreaView style={styles.bg}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {signup.step === "email" && (
            <>
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.sub}>Enter your email to get started</Text>

              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="signup-email-input"
                style={styles.input}
                value={signup.email}
                onChangeText={signup.setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@studio.com"
                placeholderTextColor={theme.textDim}
                textContentType="emailAddress"
                autoComplete="email"
                editable={!signup.loading}
              />
              {signup.error && <Text style={styles.err} testID="signup-error">{signup.error}</Text>}

              <Pressable
                testID="signup-submit-button"
                onPress={signup.submitEmail}
                disabled={signup.loading}
                style={({ pressed }) => [styles.cta, (pressed || signup.loading) && { opacity: 0.8 }]}
              >
                {signup.loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Continue</Text>}
              </Pressable>
            </>
          )}

          {signup.step === "otp" && (
            <>
              <Text style={styles.title}>Verify your email</Text>
              <Text style={styles.sub}>We sent a 6-digit code to</Text>
              <Text style={styles.verifiedEmail}>{signup.email}</Text>

              <Text style={styles.label}>Verification code</Text>
              <OtpInput
                testID="signup-otp-input"
                value={signup.otpCode}
                onChange={signup.setOtpCode}
                onComplete={(code) => signup.verifyOtp(code)}
                disabled={signup.loading || signup.isOtpExpired}
              />

              {signup.isOtpExpired ? (
                <Text style={styles.warn}>This code has expired. Request a new one below.</Text>
              ) : signup.otpExpiresCountdown > 0 ? (
                <Text style={styles.hint}>Code expires in {formatCountdown(signup.otpExpiresCountdown)}</Text>
              ) : null}

              {signup.error && <Text style={styles.err} testID="signup-error">{signup.error}</Text>}

              <Pressable
                testID="signup-verify-button"
                onPress={() => signup.verifyOtp()}
                disabled={signup.loading || signup.isOtpExpired || signup.otpCode.length !== 6}
                style={({ pressed }) => [
                  styles.cta,
                  (pressed || signup.loading || signup.isOtpExpired) && { opacity: 0.8 },
                ]}
              >
                {signup.loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Verify</Text>}
              </Pressable>

              <Pressable
                testID="signup-resend-otp"
                onPress={signup.resendOtp}
                disabled={signup.loading || signup.resendCountdown > 0}
                style={{ marginTop: 16, alignItems: "center" }}
              >
                <Text style={styles.link}>
                  {signup.resendCountdown > 0
                    ? `Resend code in ${signup.resendCountdown}s`
                    : "Resend code"}
                </Text>
              </Pressable>

              <Pressable
                testID="signup-change-email"
                onPress={signup.changeEmail}
                style={{ marginTop: 12, alignItems: "center" }}
              >
                <Text style={styles.link}>Change email</Text>
              </Pressable>
            </>
          )}

          {signup.step === "account" && (
            <>
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.sub}>Complete your profile</Text>
              <View style={styles.emailBadge}>
                <Text style={styles.emailBadgeLabel}>Verified email</Text>
                <Text style={styles.verifiedEmailInline}>{signup.email}</Text>
              </View>

              <Text style={styles.label}>Full name</Text>
              <TextInput
                testID="signup-name-input"
                style={styles.input}
                value={signup.fullName}
                onChangeText={signup.setFullName}
                placeholder="Alex Rivera"
                placeholderTextColor={theme.textDim}
                autoCapitalize="words"
                textContentType="name"
                autoComplete="name"
                editable={!accountLoading}
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                testID="signup-password-input"
                style={styles.input}
                value={signup.password}
                onChangeText={signup.setPassword}
                secureTextEntry
                placeholder="8+ chars, letters and numbers"
                placeholderTextColor={theme.textDim}
                textContentType="oneTimeCode"
                autoComplete="off"
                importantForAutofill="no"
                autoCorrect={false}
                spellCheck={false}
                passwordRules=""
                editable={!accountLoading}
              />
              {showAccountErr && (
                <Text style={styles.err} testID="signup-error">
                  {accountErr || signup.error || accountValidationErr}
                </Text>
              )}

              <Pressable
                testID="signup-create-account-button"
                onPress={handleAccountSubmit}
                disabled={accountLoading}
                style={({ pressed }) => [styles.cta, (pressed || accountLoading) && { opacity: 0.8 }]}
              >
                {accountLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Create account</Text>}
              </Pressable>

              <Pressable
                testID="signup-change-email"
                onPress={signup.changeEmail}
                style={{ marginTop: 16, alignItems: "center" }}
              >
                <Text style={styles.link}>Change email</Text>
              </Pressable>
            </>
          )}

          <Pressable testID="go-to-login" onPress={goLogin} style={{ marginTop: 20, alignItems: "center" }}>
            <Text style={styles.link}>
              Already have an account? <Text style={{ color: theme.brand }}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 24, paddingTop: 32 },
  title: { ...type.displayMd, color: theme.text },
  sub: { ...type.bodyMd, color: theme.textDim, marginTop: 6, marginBottom: 8 },
  verifiedEmail: { ...type.titleMd, color: theme.text, marginBottom: 24 },
  verifiedEmailInline: { ...type.titleMd, color: theme.text },
  emailBadge: {
    backgroundColor: theme.bg2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 8,
  },
  emailBadgeLabel: { ...type.caption, color: theme.textDim, marginBottom: 4 },
  label: { ...type.label, color: theme.textMid, marginBottom: 6, marginTop: 12 },
  input: {
    ...type.bodyMd,
    backgroundColor: theme.bg2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: theme.text,
  },
  cta: {
    backgroundColor: theme.brand,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    marginTop: 28,
    alignItems: "center",
  },
  ctaText: { ...type.titleLg, color: "#fff" },
  err: { ...type.caption, color: theme.error, marginTop: 12 },
  warn: { ...type.caption, color: theme.warning, marginTop: 12 },
  hint: { ...type.caption, color: theme.textDim, marginTop: 12 },
  link: { ...type.bodySm, color: theme.textDim },
});
