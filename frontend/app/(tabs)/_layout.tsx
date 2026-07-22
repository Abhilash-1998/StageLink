import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { StyleSheet, Platform } from "react-native";
import { useAuth } from "@/src/context/AuthContext";
import { theme } from "@/src/theme";

export default function TabsLayout() {
  const { user } = useAuth();
  const isOrg = user?.role === "organizer";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.OS === "web" ? "rgba(9,9,11,0.95)" : "transparent",
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: 78,
          paddingTop: 8,
        },
        tabBarBackground: () => Platform.OS !== "web" ? (
          <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
        ) : null,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textDim,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{
        title: isOrg ? "Manage" : "Discover",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "compass" : "compass-outline"} size={24} color={color} />,
      }} />
      <Tabs.Screen name="applications" options={{
        title: isOrg ? "Talent" : "Applications",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "briefcase" : "briefcase-outline"} size={22} color={color} />,
      }} />
      <Tabs.Screen name="dashboard" options={{
        title: "Insights",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "stats-chart" : "stats-chart-outline"} size={22} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: "Profile",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={24} color={color} />,
      }} />
    </Tabs>
  );
}
