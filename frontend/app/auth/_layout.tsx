import { Stack } from "expo-router";
import { SignupProvider } from "@/src/context/SignupContext";

export default function AuthLayout() {
  return (
    <SignupProvider>
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </SignupProvider>
  );
}
