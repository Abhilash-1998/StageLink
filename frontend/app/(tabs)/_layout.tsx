import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { StyleSheet, Platform, View } from "react-native";
import { theme } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.OS === "web" ? "rgba(9,9,11,0.96)" : "transparent",
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.1, marginBottom: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{
        title: "Home",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />,
      }} />
      <Tabs.Screen name="discover" options={{
        title: "Discover",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "compass" : "compass-outline"} size={24} color={color} />,
      }} />
      <Tabs.Screen name="create" options={{
        title: "Create",
        tabBarIcon: ({ color, focused }) => (
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.brand, alignItems: "center", justifyContent: "center", marginBottom: 0 }}>
            <Ionicons name="add" size={26} color="#fff" />
          </View>
        ),
      }} />
      <Tabs.Screen name="messages" options={{
        title: "Messages",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={22} color={color} />,
      }} />
      <Tabs.Screen name="profile" options={{
        title: "Profile",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={24} color={color} />,
      }} />
      {/* Hidden from tab bar but reachable via router */}
      <Tabs.Screen name="applications" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
    </Tabs>
  );
}
