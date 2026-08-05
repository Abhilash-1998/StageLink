import { Alert, Linking, Platform } from "react-native";

/**
 * Open the device dialer for a phone number.
 * Always gives feedback when the number is missing, hidden, or dialing isn't supported.
 */
export async function openPhoneCall(
  phone?: string | null,
  opts?: { hidden?: boolean; label?: string },
): Promise<void> {
  const who = opts?.label || "organizer";

  if (opts?.hidden) {
    Alert.alert("Phone hidden", `This ${who} has hidden their contact number.`);
    return;
  }

  if (!phone || !String(phone).trim()) {
    Alert.alert("No phone number", `This ${who} hasn't added a phone number yet.`);
    return;
  }

  // Keep a leading + if present; strip other formatting
  const raw = String(phone).trim();
  const digits = raw.replace(/[^\d+]/g, "");
  const digitCount = digits.replace(/\D/g, "").length;
  if (digitCount < 8) {
    Alert.alert("Invalid number", "This phone number can't be dialed.");
    return;
  }

  // iOS: telprompt shows confirm sheet; Android/web: tel
  const primary = Platform.OS === "ios" ? `telprompt:${digits}` : `tel:${digits}`;
  const fallback = `tel:${digits}`;

  try {
    if (Platform.OS === "web") {
      // Browsers often block/ignore tel: — show the number so the user can dial
      Alert.alert("Call", digits, [
        { text: "Cancel", style: "cancel" },
        { text: "Open dialer", onPress: () => { Linking.openURL(fallback).catch(() => {}); } },
      ]);
      return;
    }

    const can = await Linking.canOpenURL(primary).catch(() => false);
    if (can) {
      await Linking.openURL(primary);
      return;
    }
    await Linking.openURL(fallback);
  } catch {
    Alert.alert("Couldn't open dialer", `Please call ${digits} manually.`);
  }
}
