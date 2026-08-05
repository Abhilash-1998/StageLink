import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ImageBackground, Pressable, ActivityIndicator, TextInput, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { formatDate } from "@/src/utils/date";
import { resolveCover } from "@/src/utils/covers";
import { openPhoneCall } from "@/src/utils/phone";

type AppRow = {
  application: { id: string; status: string; message?: string; musician_id: string };
  musician_user?: { id: string; full_name?: string } | null;
  musician_profile?: { stage_name?: string; instruments?: string[] } | null;
};

export default function GigDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, fetchApi } = useAuth();
  const isMusician = user?.active_role === "musician";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [myApp, setMyApp] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [applicants, setApplicants] = useState<AppRow[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const gigData = await fetchApi(`/gigs/${id}`);
    setData(gigData);
    const orgId = gigData?.organizer_user?.id || gigData?.gig?.organizer_id;
    const own = !!user?.id && user.id === orgId;

    if (isMusician) {
      const apps: any[] = await fetchApi("/applications/mine");
      const mine = apps.find((a: any) => a.gig?.id === id);
      setMyApp(mine?.application || null);
    } else {
      setMyApp(null);
    }

    if (own) {
      try {
        const apps = await fetchApi(`/applications/gig/${id}`);
        setApplicants(apps as AppRow[]);
      } catch {
        setApplicants([]);
      }
    } else {
      setApplicants([]);
    }
  }, [id, fetchApi, isMusician, user?.id]);

  useEffect(() => {
    load().catch(() => {}).finally(() => setLoading(false));
  }, [load]);

  const showBanner = (text: string) => {
    setBanner(text);
    setTimeout(() => setBanner(null), 3000);
  };

  const apply = async () => {
    setApplying(true);
    try {
      const app = await fetchApi("/applications", {
        method: "POST",
        body: JSON.stringify({ gig_id: id, message: msg }),
      });
      setMyApp(app);
      showBanner("Collaboration request sent!");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await load();
    } catch (e: any) {
      showBanner(e.message);
    } finally {
      setApplying(false);
    }
  };

  const acceptApplicant = (row: AppRow) => {
    const name = row.musician_profile?.stage_name || row.musician_user?.full_name || "this musician";
    Alert.alert(
      "Accept collaborator?",
      `Accept ${name}? This fills the gig and rejects all other requests.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          style: "default",
          onPress: async () => {
            setActingId(row.application.id);
            try {
              await fetchApi(`/applications/${row.application.id}/accept`, { method: "POST" });
              showBanner("Collaborator accepted — gig filled");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              await load();
            } catch (e: any) {
              showBanner(e.message);
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  };

  const rejectApplicant = async (row: AppRow) => {
    setActingId(row.application.id);
    try {
      await fetchApi(`/applications/${row.application.id}/reject`, { method: "POST" });
      showBanner("Request declined");
      await load();
    } catch (e: any) {
      showBanner(e.message);
    } finally {
      setActingId(null);
    }
  };

  const revokeCollaboration = (appId: string, asOrganizer: boolean) => {
    Alert.alert(
      asOrganizer ? "Revoke collaborator?" : "Withdraw from gig?",
      asOrganizer
        ? "This ends the collaboration and reopens the gig for new requests."
        : "You'll leave this gig and it will reopen for others.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: asOrganizer ? "Revoke" : "Withdraw",
          style: "destructive",
          onPress: async () => {
            setActingId(appId);
            try {
              await fetchApi(`/applications/${appId}/revoke`, { method: "POST" });
              showBanner(asOrganizer ? "Collaboration revoked — gig reopened" : "You withdrew — gig reopened");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              await load();
            } catch (e: any) {
              showBanner(e.message);
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  };

  const cancelGig = () => {
    Alert.alert(
      "Cancel this gig?",
      "It will be removed from profiles and Discover. Pending requests will be declined. This cannot be undone.",
      [
        { text: "Keep gig", style: "cancel" },
        {
          text: "Cancel gig",
          style: "destructive",
          onPress: async () => {
            setActingId("cancel");
            try {
              await fetchApi(`/gigs/${id}/cancel`, { method: "POST" });
              showBanner("Gig cancelled");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              await load();
            } catch (e: any) {
              showBanner(e.message);
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.bg}>
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      </SafeAreaView>
    );
  }

  const g = data.gig;
  const orgId = data.organizer_user?.id || g.organizer_id;
  const phone = data.contact?.phone || null;
  const phoneHidden = !!data.contact?.hide_contact;
  const isOwn = !!user?.id && user.id === orgId;
  const isFilled = g.status === "filled";
  const isOpen = g.status === "open";
  const isCancelled = g.status === "cancelled";
  const myStatus = myApp?.status as string | undefined;
  const accepted = data.accepted_collaborator;
  const acceptedName =
    accepted?.profile?.stage_name || accepted?.user?.full_name || null;

  const statusColor = isCancelled ? theme.error : isFilled ? theme.success : theme.brand;
  const statusLabel = isCancelled ? "CANCELLED" : isFilled ? "FILLED" : "OPEN";

  const canRequestAgain = isOpen && (!myStatus || myStatus === "withdrawn" || myStatus === "rejected");
  const isCollaborating = myStatus === "accepted" && !isCancelled;

  const ctaLabel = (() => {
    if (isCancelled) return "Gig cancelled";
    if (isCollaborating) return "Collaborating ✓";
    if (isFilled) return "Position filled";
    if (myStatus === "pending") return "Request sent";
    if (myStatus === "withdrawn") return "Collaborate again";
    if (myStatus === "rejected" && isOpen) return "Collaborate again";
    if (myStatus === "rejected") return "Not selected";
    return "Collaborate";
  })();

  const ctaDisabled =
    applying || isCollaborating || myStatus === "pending" || isFilled || !isOpen || isCancelled;
  const ctaSuccess = isCollaborating;
  const ctaMuted = (isFilled && !isCollaborating) || isCancelled;

  const callOrganizer = () => {
    openPhoneCall(phone, { hidden: phoneHidden && !phone, label: "organizer" });
  };

  return (
    <View style={styles.bg}>
      <ScrollView contentContainerStyle={{ paddingBottom: isMusician || isOwn ? 130 : 40 }}>
        <ImageBackground source={{ uri: resolveCover("gig", g.cover_url) }} style={styles.hero}>
          <LinearGradient colors={["rgba(9,9,11,0.4)", "rgba(9,9,11,0.95)"]} style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={["top"]}>
            <Pressable testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={theme.text} />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroBottom}>
            <View style={styles.tagRow}>
              <View style={styles.tag}><Text style={styles.tagTxt}>{g.event_type.toUpperCase()}</Text></View>
              <View style={[styles.tag, { borderColor: statusColor, backgroundColor: `${statusColor}33` }]}>
                <Text style={[styles.tagTxt, { color: statusColor }]}>{statusLabel}</Text>
              </View>
            </View>
            <Text style={styles.heroTitle}>{g.title}</Text>
          </View>
        </ImageBackground>

        <View style={styles.body}>
          <Text style={styles.price}>₹{g.budget.toLocaleString("en-IN")}</Text>
          <Text style={styles.priceLbl}>Total budget</Text>

          {isFilled && !isCancelled && acceptedName && (
            <View style={styles.filledBanner}>
              <Ionicons name="checkmark-circle" size={18} color={theme.success} />
              <Text style={styles.filledTxt}>Collaborating with {acceptedName}</Text>
            </View>
          )}

          {isCancelled && (
            <View style={[styles.filledBanner, { borderColor: theme.error, backgroundColor: `${theme.error}18` }]}>
              <Ionicons name="close-circle" size={18} color={theme.error} />
              <Text style={[styles.filledTxt, { color: theme.error }]}>This gig has been cancelled</Text>
            </View>
          )}

          <View style={styles.metaGrid}>
            <View style={styles.metaCard}><Ionicons name="location-outline" size={18} color={theme.brand} /><Text style={styles.metaLbl}>City</Text><Text style={styles.metaVal}>{g.city}</Text></View>
            <View style={styles.metaCard}><Ionicons name="calendar-outline" size={18} color={theme.brand} /><Text style={styles.metaLbl}>Date</Text><Text style={styles.metaVal}>{formatDate(g.date)}</Text></View>
            <View style={styles.metaCard}><Ionicons name="musical-notes-outline" size={18} color={theme.brand} /><Text style={styles.metaLbl}>Genre</Text><Text style={styles.metaVal}>{g.genre}</Text></View>
            <View style={styles.metaCard}><Ionicons name="mic-outline" size={18} color={theme.brand} /><Text style={styles.metaLbl}>Need</Text><Text style={styles.metaVal}>{g.instrument_needed}</Text></View>
          </View>

          <Text style={styles.sTitle}>About this gig</Text>
          <Text style={styles.desc}>{g.description}</Text>

          <Text style={styles.sTitle}>Organizer</Text>
          <Pressable testID="gig-organizer" onPress={() => orgId && router.push(`/user/${orgId}`)} style={styles.orgCard}>
            <View style={styles.orgAvatar}><Ionicons name="business" size={20} color={theme.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.orgName}>{data.organizer_profile?.org_name || data.organizer_user?.full_name}</Text>
              <Text style={styles.orgMeta}>
                {`${data.applications_count} applicant${data.applications_count === 1 ? "" : "s"}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
          </Pressable>

          {!isOwn && (
            <View style={styles.contactRow}>
              <Pressable testID="gig-call" onPress={callOrganizer} style={styles.contactBtn}>
                <Ionicons name="call" size={16} color={theme.brand} />
                <Text style={styles.contactBtnTxt}>Call organizer</Text>
              </Pressable>
              <Pressable
                testID="gig-message"
                onPress={() => orgId && router.push(`/chat/${orgId}`)}
                style={[styles.contactBtn, styles.contactBtnPrimary]}
              >
                <Ionicons name="chatbubble" size={16} color="#fff" />
                <Text style={styles.contactBtnTxtPrimary}>Message organizer</Text>
              </Pressable>
            </View>
          )}

          {isOwn && (
            <>
              {!isCancelled && (
                <Pressable
                  testID="cancel-gig-btn"
                  onPress={cancelGig}
                  disabled={actingId === "cancel"}
                  style={styles.cancelGigBtn}
                >
                  {actingId === "cancel" ? (
                    <ActivityIndicator color={theme.error} />
                  ) : (
                    <>
                      <Ionicons name="close-circle-outline" size={16} color={theme.error} />
                      <Text style={styles.cancelGigTxt}>Cancel gig</Text>
                    </>
                  )}
                </Pressable>
              )}
              <Text style={styles.sTitle}>
                Collaboration requests ({applicants.length})
              </Text>
              {applicants.length === 0 ? (
                <Text style={styles.emptyApps}>No requests yet. Share this gig to get collaborators.</Text>
              ) : (
                applicants.map((row) => {
                  const a = row.application;
                  const name = row.musician_profile?.stage_name || row.musician_user?.full_name || "Musician";
                  const instruments = (row.musician_profile?.instruments || []).slice(0, 2).join(" · ");
                  const st = a.status;
                  const stColor =
                    st === "accepted" ? theme.success
                      : st === "rejected" || st === "withdrawn" ? theme.error
                        : theme.warning;
                  const busy = actingId === a.id;
                  const badgeLabel =
                    st === "withdrawn" ? "WITHDRAWN" : st.toUpperCase();
                  return (
                    <View key={a.id} style={styles.appCard}>
                      <Pressable
                        onPress={() => row.musician_user?.id && router.push(`/user/${row.musician_user.id}`)}
                        style={styles.appHeader}
                      >
                        <View style={styles.appAvatar}>
                          <Ionicons name="person" size={18} color={theme.brand} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.appName}>{name}</Text>
                          {!!instruments && <Text style={styles.appMeta}>{instruments}</Text>}
                          {!!a.message && <Text style={styles.appMsg} numberOfLines={2}>{a.message}</Text>}
                        </View>
                        <View style={[styles.appBadge, { borderColor: stColor, backgroundColor: `${stColor}22` }]}>
                          <Text style={[styles.appBadgeTxt, { color: stColor }]}>{badgeLabel}</Text>
                        </View>
                      </Pressable>
                      {st === "pending" && isOpen && !isCancelled && (
                        <View style={styles.appActions}>
                          <Pressable
                            testID={`reject-${a.id}`}
                            onPress={() => rejectApplicant(row)}
                            disabled={!!actingId}
                            style={styles.rejectBtn}
                          >
                            {busy ? <ActivityIndicator color={theme.error} /> : (
                              <Text style={styles.rejectTxt}>Decline</Text>
                            )}
                          </Pressable>
                          <Pressable
                            testID={`accept-${a.id}`}
                            onPress={() => acceptApplicant(row)}
                            disabled={!!actingId}
                            style={styles.acceptBtn}
                          >
                            {busy ? <ActivityIndicator color="#fff" /> : (
                              <Text style={styles.acceptTxt}>Accept</Text>
                            )}
                          </Pressable>
                        </View>
                      )}
                      {st === "accepted" && !isCancelled && (
                        <View style={styles.appActionsCol}>
                          <Pressable
                            onPress={() => row.musician_user?.id && router.push(`/chat/${row.musician_user.id}`)}
                            style={styles.messageCollab}
                          >
                            <Ionicons name="chatbubble-outline" size={14} color={theme.text} />
                            <Text style={styles.messageCollabTxt}>Message collaborator</Text>
                          </Pressable>
                          <Pressable
                            testID={`revoke-${a.id}`}
                            onPress={() => revokeCollaboration(a.id, true)}
                            disabled={!!actingId}
                            style={styles.revokeBtn}
                          >
                            {busy ? <ActivityIndicator color={theme.error} /> : (
                              <Text style={styles.revokeTxt}>Revoke collaboration</Text>
                            )}
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </>
          )}

          {isMusician && canRequestAgain && (
            <>
              <Text style={styles.sTitle}>Your pitch (optional)</Text>
              <TextInput
                testID="apply-message-input"
                style={styles.input}
                value={msg}
                onChangeText={setMsg}
                multiline
                placeholder="Introduce yourself…"
                placeholderTextColor={theme.textDim}
              />
            </>
          )}
        </View>
      </ScrollView>

      {banner && <View style={styles.banner}><Text style={styles.bannerTxt}>{banner}</Text></View>}

      {isMusician && (
        <SafeAreaView edges={["bottom"]} style={styles.footer}>
          {isCollaborating ? (
            <View style={styles.footerCol}>
              <View style={[styles.cta, styles.ctaDone]}>
                <Text style={styles.ctaTxt}>Collaborating ✓</Text>
              </View>
              <Pressable
                testID="withdraw-btn"
                onPress={() => myApp?.id && revokeCollaboration(myApp.id, false)}
                disabled={!!actingId}
                style={styles.revokeBtn}
              >
                {actingId === myApp?.id ? (
                  <ActivityIndicator color={theme.error} />
                ) : (
                  <Text style={styles.revokeTxt}>Withdraw from gig</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID="apply-btn"
              onPress={apply}
              disabled={ctaDisabled}
              style={[
                styles.cta,
                ctaSuccess && styles.ctaDone,
                ctaMuted && styles.ctaMuted,
                myStatus === "pending" && styles.ctaPending,
              ]}
            >
              {applying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.ctaTxt, ctaMuted && styles.ctaTxtMuted]}>{ctaLabel}</Text>
              )}
            </Pressable>
          )}
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
  tagRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tag: { alignSelf: "flex-start", backgroundColor: "rgba(225,29,72,0.25)", borderColor: theme.brand, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill },
  tagTxt: { ...type.tiny, color: theme.brand, fontWeight: "700", letterSpacing: 0.5 },
  heroTitle: { ...type.h1, color: theme.text, marginTop: 10 },
  body: { padding: 20 },
  price: { ...type.priceLg, color: theme.text },
  priceLbl: { ...type.caption, color: theme.textDim, marginTop: 2, marginBottom: 12 },
  filledBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16,
    backgroundColor: `${theme.success}18`, borderColor: theme.success, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.md,
  },
  filledTxt: { ...type.caption, color: theme.success, fontWeight: "700", flex: 1 },
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
  contactRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  contactBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: theme.radius.pill,
    backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand,
  },
  contactBtnPrimary: { backgroundColor: theme.brand, borderColor: theme.brand },
  contactBtnTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },
  contactBtnTxtPrimary: { ...type.caption, color: "#fff", fontWeight: "700" },
  emptyApps: { ...type.bodySm, color: theme.textDim },
  appCard: {
    backgroundColor: theme.bg2, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.border,
    padding: 14, marginBottom: 10,
  },
  appHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  appAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center" },
  appName: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  appMeta: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  appMsg: { ...type.caption, color: theme.textMid, marginTop: 6, lineHeight: 18 },
  appBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill, borderWidth: 1 },
  appBadgeTxt: { ...type.tiny, fontWeight: "700", letterSpacing: 0.3 },
  appActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  rejectBtn: {
    flex: 1, paddingVertical: 12, borderRadius: theme.radius.pill, alignItems: "center",
    borderWidth: 1, borderColor: theme.error, backgroundColor: `${theme.error}14`,
  },
  rejectTxt: { ...type.caption, color: theme.error, fontWeight: "700" },
  acceptBtn: {
    flex: 1, paddingVertical: 12, borderRadius: theme.radius.pill, alignItems: "center",
    backgroundColor: theme.success,
  },
  acceptTxt: { ...type.caption, color: "#fff", fontWeight: "700" },
  messageCollab: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: theme.radius.pill,
    backgroundColor: theme.bg3, borderWidth: 1, borderColor: theme.borderStrong,
  },
  messageCollabTxt: { ...type.caption, color: theme.text, fontWeight: "700" },
  appActionsCol: { marginTop: 12, gap: 8 },
  revokeBtn: {
    paddingVertical: 12, borderRadius: theme.radius.pill, alignItems: "center",
    borderWidth: 1, borderColor: theme.error, backgroundColor: `${theme.error}12`,
  },
  revokeTxt: { ...type.caption, color: theme.error, fontWeight: "700" },
  cancelGigBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginBottom: 8, paddingVertical: 12, borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.error, backgroundColor: `${theme.error}12`,
  },
  cancelGigTxt: { ...type.caption, color: theme.error, fontWeight: "700" },
  footerCol: { gap: 8 },
  input: { ...type.bodySm, backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, padding: 12, color: theme.text, minHeight: 80, textAlignVertical: "top" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 20, paddingTop: 12 },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center" },
  ctaDone: { backgroundColor: theme.success },
  ctaPending: { backgroundColor: theme.warning },
  ctaMuted: { backgroundColor: theme.bg3, borderWidth: 1, borderColor: theme.border },
  ctaTxt: { ...type.titleMd, color: "#fff", fontWeight: "700" },
  ctaTxtMuted: { color: theme.textDim },
  banner: { position: "absolute", top: 60, left: 20, right: 20, backgroundColor: theme.bg2, borderColor: theme.brand, borderWidth: 1, borderRadius: theme.radius.md, padding: 14, zIndex: 100 },
  bannerTxt: { ...type.caption, color: theme.text, textAlign: "center", fontWeight: "600" },
});
