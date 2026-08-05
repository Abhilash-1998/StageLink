import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/context/AuthContext";
import { NetworkProvider, useNetwork } from "@/src/context/NetworkContext";
import { HealthProvider, useHealth } from "@/src/context/HealthContext";
import { NoInternetScreen } from "@/src/components/NoInternetScreen";
import { MaintenanceScreen } from "@/src/components/MaintenanceScreen";
import { PushNotificationBootstrap } from "@/src/notifications/PushNotificationBootstrap";
import { StartupPermissionsGate } from "@/src/permissions/StartupPermissionsGate";
import { theme } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const seg = segments[0];
    const inAuthGroup = seg === "auth";
    const isSplash = !seg;

    if (status === "unauthenticated") {
      if (!inAuthGroup) router.replace("/auth/login");
      return;
    }

    // Authenticated — action-based model: skip role gate, all users can do everything.
    if (!user) return;
    if (!user.onboarded) {
      if (!(seg === "auth" && segments[1] === "onboarding")) router.replace("/auth/onboarding");
      return;
    }
    // fully onboarded — bounce off auth/splash into tabs
    if (inAuthGroup || isSplash) router.replace("/(tabs)");
  }, [status, user, segments, router]);

  if (status === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.brand} size="large" />
      </View>
    );
  }
  return <>{children}</>;
}

function NetworkGate({ children }: { children: React.ReactNode }) {
  const { isOnline } = useNetwork();
  if (!isOnline) return <NoInternetScreen />;
  return <>{children}</>;
}

function HealthGate({ children }: { children: React.ReactNode }) {
  const { healthy } = useHealth();
  // Don't block first paint — only show maintenance when server explicitly says so.
  if (healthy === false) return <MaintenanceScreen />;
  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
      <SafeAreaProvider>
        <NetworkProvider>
          <NetworkGate>
            <AuthProvider>
              <HealthProvider>
                <HealthGate>
                  <StartupPermissionsGate>
                    <PushNotificationBootstrap>
                      <StatusBar style="light" />
                      <AuthGate>
                        <Stack
                          screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: theme.bg },
                            animation: "fade",
                          }}
                        />
                      </AuthGate>
                    </PushNotificationBootstrap>
                  </StartupPermissionsGate>
                </HealthGate>
              </HealthProvider>
            </AuthProvider>
          </NetworkGate>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
