import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { StyleSheet, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, type } from "@/src/theme";

const TAB_BAR_TOP_PADDING = 8;
const TAB_BAR_CONTENT_HEIGHT = 58;
const FAB_LIFT = 16;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "relative",
          backgroundColor: Platform.OS === "web" ? "rgba(9,9,11,0.96)" : "transparent",
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: TAB_BAR_CONTENT_HEIGHT + TAB_BAR_TOP_PADDING + insets.bottom,
          paddingTop: TAB_BAR_TOP_PADDING,
          paddingBottom: insets.bottom,
        },
        tabBarBackground: () => Platform.OS !== "web" ? (
          <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
        ) : null,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textDim,
        tabBarLabelStyle: { ...type.tiny, fontWeight: "600", marginBottom: 4 },
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
          <View style={[styles.createBtn, { transform: [{ translateY: -FAB_LIFT }] }]}>
            <Ionicons name="add" size={30} color="#fff" />
          </View>
        ),
        tabBarLabelStyle: { ...type.tiny, fontWeight: "600", marginTop: 4, marginBottom: 2 },
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

const styles = StyleSheet.create({
  createBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.brand,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
