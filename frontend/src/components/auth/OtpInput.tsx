import { useEffect, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Platform } from "react-native";
import { theme, type } from "@/src/theme";

type Props = {
  value: string;
  onChange: (digits: string) => void;
  onComplete?: (digits: string) => void;
  disabled?: boolean;
  testID?: string;
};

const BOX_COUNT = 6;

export function OtpInput({ value, onChange, onComplete, disabled, testID }: Props) {
  const inputRef = useRef<TextInput>(null);
  const digits = value.replace(/\D/g, "").slice(0, BOX_COUNT);
  const completedRef = useRef("");

  useEffect(() => {
    if (digits.length === BOX_COUNT && digits !== completedRef.current) {
      completedRef.current = digits;
      onComplete?.(digits);
    }
    if (digits.length < BOX_COUNT) completedRef.current = "";
  }, [digits, onComplete]);

  const handleChange = (text: string) => {
    onChange(text.replace(/\D/g, "").slice(0, BOX_COUNT));
  };

  return (
    <Pressable
      style={styles.wrap}
      onPress={() => !disabled && inputRef.current?.focus()}
      disabled={disabled}
    >
      <TextInput
        ref={inputRef}
        testID={testID}
        style={styles.hiddenInput}
        value={digits}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        maxLength={BOX_COUNT}
        editable={!disabled}
        caretHidden
        importantForAutofill="yes"
      />
      <View style={styles.boxRow}>
        {Array.from({ length: BOX_COUNT }, (_, i) => {
          const char = digits[i] ?? "";
          const active = i === digits.length && !disabled;
          return (
            <View key={`otp-${i}`} style={[styles.box, active && styles.boxActive, disabled && styles.boxDisabled]}>
              <Text style={styles.boxText}>{char}</Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
  boxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxWidth: 52,
    backgroundColor: theme.bg2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  boxActive: {
    borderColor: theme.brand,
  },
  boxDisabled: {
    opacity: 0.5,
  },
  boxText: {
    ...type.h2,
    color: theme.text,
    textAlign: "center",
  },
});
