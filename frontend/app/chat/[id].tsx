import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";

type Msg = { id: string; from_id: string; to_id: string; text: string; created_at: string };

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, fetchApi } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [other, setOther] = useState<any>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);

  const load = useCallback(async () => {
    try {
      const d: any = await fetchApi(`/threads/${id}`);
      setMessages(d.messages || []);
      setOther(d.other);
    } catch {}
  }, [fetchApi, id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  const send = async () => {
    if (!text.trim() || sending) return;
    const t = text.trim(); setText(""); setSending(true);
    try {
      await fetchApi("/messages", { method: "POST", body: JSON.stringify({ to_user_id: id, text: t }) });
      await load();
    } catch { setText(t); }
    finally { setSending(false); }
  };

  if (loading) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="chat-back" onPress={() => router.back()} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.avatar}>
          {other?.avatar_url ? <Image source={{ uri: other.avatar_url }} style={{ width: "100%", height: "100%" }} /> :
            <Text style={styles.avTxt}>{other?.full_name?.[0]}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{other?.full_name}</Text>
          <Text style={styles.sub}>{other?.verified ? "Verified" : "Active"}</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 20, gap: 6 }}
          renderItem={({ item, index }) => {
            const mine = item.from_id === user?.id;
            const prev = messages[index - 1];
            const showGap = !prev || prev.from_id !== item.from_id;
            return (
              <View style={{ marginTop: showGap ? 8 : 0, alignItems: mine ? "flex-end" : "flex-start" }}>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={[styles.bubbleTxt, mine && { color: "#fff" }]}>{item.text}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<View style={{ padding: 40, alignItems: "center" }}><Text style={{ color: theme.textDim }}>Say hi 👋</Text></View>}
        />
        <View style={styles.inputRow}>
          <TextInput
            testID="chat-input" style={styles.input} value={text} onChangeText={setText}
            placeholder="Message…" placeholderTextColor={theme.textDim} multiline
            onSubmitEditing={send} returnKeyType="send" blurOnSubmit={false}
          />
          <Pressable testID="chat-send" onPress={send} disabled={!text.trim() || sending} style={[styles.send, (!text.trim() || sending) && { opacity: 0.5 }]}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.bg2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avTxt: { ...type.titleMd, color: theme.text, fontWeight: "700" },
  title: { ...type.titleMd, color: theme.text, fontWeight: "700" },
  sub: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  bubble: { maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  mine: { backgroundColor: theme.brand, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: theme.bg2, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.border },
  bubbleTxt: { ...type.bodySm, color: theme.text },
  inputRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.bg, alignItems: "flex-end" },
  input: { ...type.bodySm, flex: 1, backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: theme.text, maxHeight: 100 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" },
});
