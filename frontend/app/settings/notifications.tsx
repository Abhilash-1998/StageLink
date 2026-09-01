import { Redirect } from "expo-router";

/** Category prefs were removed — all notification types may be sent. */
export default function NotificationPrefsRedirect() {
  return <Redirect href="/settings" />;
}
