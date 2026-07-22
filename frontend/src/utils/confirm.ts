import { Alert, Platform } from "react-native";

/**
 * Cross-platform delete confirmation dialog.
 * Uses window.confirm on web (Alert is a no-op on Metro web) and native Alert
 * elsewhere. Resolves true if the user confirms.
 */
export function confirmDelete(
  title = "Delete this item?",
  message = "This action cannot be undone."
): Promise<boolean> {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Delete", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
