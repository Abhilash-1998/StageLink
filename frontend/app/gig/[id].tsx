import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ImageBackground, Pressable, ActivityIndicator, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

export default function GigDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, fetchApi } = useAuth();
  const isMusician = user?.active_role === "musician";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [msg, setMsg] = useState("");
  const [contract, setContract] = useState<string | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    fetchApi(`/gigs/${id}`).then(setData).catch(() => {}).finally(() => setLoading(false));
    if (isMusician) fetchApi("/applications/mine").then((apps: any) => {
      setApplied(apps.some((a: any) => a.gig.id === id));
    }).catch(() => {});
  }, [id, fetchApi, isMusician]);

  const apply = async () => {
    setApplying(true);
    try {
      await fetchApi("/applications", { method: "POST", body: JSON.stringify({ gig_id: id, message: msg }) });
      setApplied(true);
      setBanner("Application submitted!");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) { setBanner(e.message); }
    finally { setApplying(false); setTimeout(() => setBanner(null), 3000); }
  };

  const generateContract = async () => {
    setContractLoading(true);
    try {
      const r: any = await fetchApi(`/ai/contract/${id}`, { method: "POST" });
      setContract(r.contract);
    } catch (e: any) { setBanner(e.message); }
    finally { setContractLoading(false); }
  };

  if (loading || !data) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;
  const g = data.gig;

  return (
    <View style={styles.bg}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        <ImageBackground source={{ uri: g.cover_url }} style={styles.hero}>
          <LinearGradient colors={["rgba(9,9,11,0.4)", "rgba(9,9,11,0.95)"]} style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={["top"]}>
            <Pressable testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={theme.text} />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroBottom}>
            <View style={styles.tag}><Text style={styles.tagTxt}>{g.event_type.toUpperCase()}</Text></View>
            <Text style={styles.heroTitle}>{g.title}</Text>
          </View>
        </ImageBackground>

        <View style={styles.body}>
          <Text style={styles.price}>₹{g.budget.toLocaleString("en-IN")}</Text>
          <Text style={styles.priceLbl}>Total budget</Text>

          <View style={styles.metaGrid}>
            <View style={styles.metaCard}><Ionicons name="location-outline" size={18} color={theme.brand} /><Text style={styles.metaLbl}>City</Text><Text style={styles.metaVal}>{g.city}</Text></View>
            <View style={styles.metaCard}><Ionicons name="calendar-outline" size={18} color={theme.brand} /><Text style={styles.metaLbl}>Date</Text><Text style={styles.metaVal}>{g.date}</Text></View>
            <View style={styles.metaCard}><Ionicons name="musical-notes-outline" size={18} color={theme.brand} /><Text style={styles.metaLbl}>Genre</Text><Text style={styles.metaVal}>{g.genre}</Text></View>
            <View style={styles.metaCard}><Ionicons name="mic-outline" size={18} color={theme.brand} /><Text style={styles.metaLbl}>Need</Text><Text style={styles.metaVal}>{g.instrument_needed}</Text></View>
          </View>

          <Text style={styles.sTitle}>About this gig</Text>
          <Text style={styles.desc}>{g.description}</Text>

          <Text style={styles.sTitle}>Organizer</Text>
          <View style={styles.orgCard}>
            <View style={styles.orgAvatar}><Ionicons name="business" size={20} color={theme.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.orgName}>{data.organizer_profile?.org_name || data.organizer_user?.full_name}</Text>
              <Text style={styles.orgMeta}>{data.applications_count} applicant{data.applications_count === 1 ? "" : "s"}</Text>
            </View>
          </View>

          {isMusician && !applied && (
            <>
              <Text style={styles.sTitle}>Your pitch (optional)</Text>
              <TextInput
                testID="apply-message-input"
                style={styles.input} value={msg} onChangeText={setMsg} multiline
                placeholder="Introduce yourself…" placeholderTextColor={theme.textDim}
              />
            </>
          )}

          {isMusician && (
            <Pressable testID="ai-contract-btn" onPress={generateContract} disabled={contractLoading} style={styles.aiBtn}>
              {contractLoading ? <ActivityIndicator size="small" color={theme.brand} /> : <Ionicons name="document-text" size={16} color={theme.brand} />}
              <Text style={styles.aiBtnTxt}>{contractLoading ? "Drafting contract…" : "Preview AI contract"}</Text>
            </Pressable>
          )}
          {contract && (
            <View style={styles.contractBox}>
              <Text style={styles.contractTitle}>Draft Performance Contract</Text>
              <Text style={styles.contractTxt}>{contract}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {banner && <View style={styles.banner}><Text style={styles.bannerTxt}>{banner}</Text></View>}

      {isMusician && (
        <SafeAreaView edges={["bottom"]} style={styles.footer}>
          <Pressable testID="apply-btn" onPress={apply} disabled={applied || applying} style={[styles.cta, applied && styles.ctaDone]}>
            {applying ? <ActivityIndicator color="#fff" /> :
              <Text style={styles.ctaTxt}>{applied ? "Applied ✓" : "Apply Now"}</Text>}
          </Pressable>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { height: 320 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(9,9,11,0.7)", alignItems: "center", justifyContent: "center", marginLeft: 16, marginTop: 8 },
  heroBottom: { position: "absolute", bottom: 20, left: 20, right: 20 },
  tag: { alignSelf: "flex-start", backgroundColor: "rgba(225,29,72,0.25)", borderColor: theme.brand, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill },
  tagTxt: { ...type.tiny, color: theme.brand, fontWeight: "700", letterSpacing: 0.5 },
  heroTitle: { ...type.h1, color: theme.text, marginTop: 10 },
  body: { padding: 20 },
  price: { ...type.priceLg, color: theme.text },
  priceLbl: { ...type.caption, color: theme.textDim, marginTop: 2, marginBottom: 20 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaCard: { flexBasis: "47%", flexGrow: 1, backgroundColor: theme.bg2, borderRadius: theme.radius.md, padding: 14, borderWidth: 1, borderColor: theme.border },
  metaLbl: { ...type.tiny, color: theme.textDim, marginTop: 8 },
  metaVal: { ...type.bodySm, color: theme.text, fontWeight: "700", marginTop: 2 },
  sTitle: { ...type.titleMd, color: theme.text, fontWeight: "700", marginTop: 24, marginBottom: 10 },
  desc: { ...type.bodySm, color: theme.textMid, lineHeight: 22 },
  orgCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, padding: 14, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border },
  orgAvatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center" },
  orgName: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  orgMeta: { ...type.caption, color: theme.textDim, marginTop: 2 },
  input: { ...type.bodySm, backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, padding: 12, color: theme.text, minHeight: 80, textAlignVertical: "top" },
  aiBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, paddingVertical: 14, borderRadius: theme.radius.pill, backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand },
  aiBtnTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },
  contractBox: { marginTop: 12, backgroundColor: theme.bg2, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border, padding: 14 },
  contractTitle: { ...type.caption, color: theme.text, fontWeight: "700", marginBottom: 8 },
  contractTxt: { ...type.caption, color: theme.textMid, lineHeight: 20 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 20, paddingTop: 12 },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center" },
  ctaDone: { backgroundColor: theme.success },
  ctaTxt: { ...type.titleMd, color: "#fff", fontWeight: "700" },
  banner: { position: "absolute", top: 60, left: 20, right: 20, backgroundColor: theme.bg2, borderColor: theme.brand, borderWidth: 1, borderRadius: theme.radius.md, padding: 14, zIndex: 100 },
  bannerTxt: { ...type.caption, color: theme.text, textAlign: "center", fontWeight: "600" },
});
