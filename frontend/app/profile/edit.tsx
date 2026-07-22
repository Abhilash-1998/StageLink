import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Image, ImageBackground, Switch, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { MediaPickerSheet, PickedMedia } from "@/src/components/MediaPickerSheet";
import { MediaViewer } from "@/src/components/MediaViewer";

const GENRES = ["Jazz", "Pop", "Rock", "Indie", "EDM", "Classical", "Fusion", "R&B", "Soul", "House", "Bollywood", "Carnatic", "Hindustani"];
const INSTRUMENTS = ["Vocals", "Guitar", "Keyboard", "Violin", "Drums", "Bass", "DJ Deck", "Saxophone", "Tabla", "Sitar"];
const PROFESSIONS = ["Singer", "Guitarist", "Drummer", "Keyboardist", "Violinist", "DJ", "Music Producer", "Sound Engineer", "Vocal Coach", "Composer", "Music Teacher", "Event Host"];
const SKILLS = ["Live Performance", "Music Production", "Recording", "Mixing", "Mastering", "Song Writing", "Improvisation", "Session Work"];
const LANGUAGES = ["English", "Hindi", "Marathi", "Tamil", "Telugu", "Kannada", "Punjabi", "Bengali"];
const AVATAR_CHOICES = [
  "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400",
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400",
  "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=400",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
  "https://images.unsplash.com/photo-1520785643438-5bf77931f493?w=400",
];
const COVER_CHOICES = [
  "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=1200",
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1200",
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200",
  "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1200",
];

export default function EditProfile() {
  const { user, fetchApi, refreshUser } = useAuth();
  const [p, setP] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Portfolio + Services drafts
  const [newPortTitle, setNewPortTitle] = useState("");
  const [newPortUrl, setNewPortUrl] = useState("");
  const [newPortType, setNewPortType] = useState<"image" | "video" | "audio">("image");
  const [newSvcTitle, setNewSvcTitle] = useState("");
  const [newSvcDesc, setNewSvcDesc] = useState("");
  const [newSvcPrice, setNewSvcPrice] = useState("");
  const [newSvcType, setNewSvcType] = useState<"per_hour" | "per_event" | "starting_at">("per_event");

  // Native picker + viewer state
  const [pickerFor, setPickerFor] = useState<null | "avatar" | "cover" | "portfolio">(null);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const selectionMode = selection.size > 0;

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const r: any = await fetchApi(`/profile/musician/${user.id}`);
      setP(r?.profile || {});
    } catch { setP({}); }
    finally { setLoading(false); }
  }, [fetchApi, user]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = (list: string[] = [], v: string) =>
    list.includes(v) ? list.filter(x => x !== v) : [...list, v];

  const update = (patch: any) => setP((prev: any) => ({ ...(prev || {}), ...patch }));

  const savePatch = async (patch: any) => {
    setErr(null); setMsg(null); setSaving(true);
    try {
      await fetchApi("/profile/musician", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await refreshUser();
      setMsg("Saved");
      setTimeout(() => setMsg(null), 2200);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const saveAll = () => savePatch({
    bio: p?.bio, tagline: p?.tagline, city: p?.city, state: p?.state, country: p?.country,
    genres: p?.genres || [], instruments: p?.instruments || [],
    languages: p?.languages || [], professions: p?.professions || [], skills: p?.skills || [],
    experience_years: parseInt(String(p?.experience_years || 0)) || 0,
    pricing_per_hour: parseInt(String(p?.pricing_per_hour || 0)) || 0,
    willing_to_travel: !!p?.willing_to_travel,
    travel_radius_km: parseInt(String(p?.travel_radius_km || 50)) || 50,
    youtube_url: p?.youtube_url, instagram_url: p?.instagram_url, spotify_url: p?.spotify_url,
    soundcloud_url: p?.soundcloud_url, website_url: p?.website_url, linkedin_url: p?.linkedin_url,
    facebook_url: p?.facebook_url, apple_music_url: p?.apple_music_url,
    avatar_url: p?.avatar_url, cover_url: p?.cover_url,
    visibility: p?.visibility || "public",
    hide_pricing: !!p?.hide_pricing, hide_location: !!p?.hide_location, hide_contact: !!p?.hide_contact,
  });

  const genBio = async () => {
    setAiLoading(true); setErr(null);
    try {
      // ensure minimal fields exist server-side so AI has context
      await fetchApi("/profile/musician", {
        method: "PATCH",
        body: JSON.stringify({
          city: p?.city || "Mumbai", genres: p?.genres || [], instruments: p?.instruments || [],
          experience_years: parseInt(String(p?.experience_years || 0)) || 0,
        }),
      });
      const r: any = await fetchApi("/ai/bio", { method: "POST", body: JSON.stringify({ tone: "professional" }) });
      update({ bio: r.bio });
      setMsg("AI bio drafted — remember to save");
      setTimeout(() => setMsg(null), 2000);
    } catch (e: any) { setErr(e.message); }
    finally { setAiLoading(false); }
  };

  const addPortfolio = async () => {
    if (!newPortTitle.trim() || !newPortUrl.trim()) { setErr("Title and URL required"); return; }
    setSaving(true);
    try {
      await fetchApi("/profile/portfolio", {
        method: "POST",
        body: JSON.stringify({
          title: newPortTitle, description: "", category: "Performance",
          media_url: newPortUrl, media_type: newPortType, tags: [],
        }),
      });
      setNewPortTitle(""); setNewPortUrl("");
      await load();
      setMsg("Added to portfolio");
      setTimeout(() => setMsg(null), 1500);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const removePortfolio = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await fetchApi(`/profile/portfolio/${id}`, { method: "DELETE" });
    await load();
  };

  const toggleSelect = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkDelete = async () => {
    if (selection.size === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const ids = Array.from(selection);
    await Promise.all(ids.map(id => fetchApi(`/profile/portfolio/${id}`, { method: "DELETE" })));
    setSelection(new Set());
    await load();
    setMsg(`Deleted ${ids.length} item${ids.length === 1 ? "" : "s"}`);
    setTimeout(() => setMsg(null), 2000);
  };

  const onPickedMedia = async (items: PickedMedia[]) => {
    if (!items.length) return;
    if (pickerFor === "avatar") {
      update({ avatar_url: items[0].uri });
    } else if (pickerFor === "cover") {
      update({ cover_url: items[0].uri });
    } else if (pickerFor === "portfolio") {
      setSaving(true);
      try {
        for (const it of items) {
          await fetchApi("/profile/portfolio", {
            method: "POST",
            body: JSON.stringify({
              title: newPortTitle.trim() || `Upload ${new Date().toLocaleDateString()}`,
              description: "", category: "Performance",
              media_url: it.uri, media_type: it.type, tags: [],
            }),
          });
        }
        setNewPortTitle("");
        await load();
        setMsg(`Added ${items.length} to portfolio`);
        setTimeout(() => setMsg(null), 2000);
      } catch (e: any) { setErr(e.message); }
      finally { setSaving(false); }
    }
    setPickerFor(null);
  };

  const addService = async () => {
    if (!newSvcTitle.trim() || !newSvcDesc.trim() || !newSvcPrice.trim()) {
      setErr("Fill title, description and price"); return;
    }
    setSaving(true);
    try {
      await fetchApi("/profile/services", {
        method: "POST",
        body: JSON.stringify({
          title: newSvcTitle, description: newSvcDesc,
          price: parseInt(newSvcPrice), pricing_type: newSvcType,
        }),
      });
      setNewSvcTitle(""); setNewSvcDesc(""); setNewSvcPrice("");
      await load();
      setMsg("Service added");
      setTimeout(() => setMsg(null), 1500);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const removeService = async (id: string) => {
    await fetchApi(`/profile/services/${id}`, { method: "DELETE" });
    await load();
  };

  if (loading || !p) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  const Section = ({ title, children }: any) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const Chip = ({ label, on, onPress, testID }: any) => (
    <Pressable testID={testID} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.bg} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="edit-back" onPress={() => router.back()} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.h1}>Edit profile</Text>
        <Pressable testID="edit-save-header" onPress={saveAll} disabled={saving} style={{ padding: 6 }}>
          {saving ? <ActivityIndicator color={theme.brand} size="small" /> :
            <Text style={{ color: theme.brand, fontWeight: "700" }}>Save</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* Cover / Avatar */}
          <View style={styles.coverPreview}>
            {p.cover_url
              ? <Image source={{ uri: p.cover_url }} style={StyleSheet.absoluteFill} />
              : <LinearGradient colors={[theme.brand2, theme.bg]} style={StyleSheet.absoluteFill} />}
            <View style={styles.avatarPreview}>
              {p.avatar_url ? <Image source={{ uri: p.avatar_url }} style={styles.avImg} /> :
                <Text style={styles.avTxt}>{user?.full_name?.[0]}</Text>}
            </View>
          </View>

          <Section title="Profile photo">
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <View style={styles.avatarBig}>
                {p.avatar_url ? <Image source={{ uri: p.avatar_url }} style={{ width: "100%", height: "100%" }} /> :
                  <Text style={styles.avTxt}>{user?.full_name?.[0]}</Text>}
              </View>
              <Pressable testID="pick-avatar" onPress={() => setPickerFor("avatar")} style={styles.uploadBtn}>
                <Ionicons name="camera" size={16} color={theme.brand} />
                <Text style={styles.uploadBtnTxt}>Upload new</Text>
              </Pressable>
              {p.avatar_url && (
                <Pressable testID="clear-avatar" onPress={() => update({ avatar_url: "" })} style={styles.clearBtn}>
                  <Ionicons name="close" size={16} color={theme.textDim} />
                </Pressable>
              )}
            </View>
            <Text style={styles.hint}>Or pick a preset:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
              {AVATAR_CHOICES.map(url => (
                <Pressable key={url} testID={`avatar-${url.slice(-20)}`} onPress={() => update({ avatar_url: url })} style={[styles.picker, p.avatar_url === url && styles.pickerOn]}>
                  <Image source={{ uri: url }} style={{ width: "100%", height: "100%", borderRadius: theme.radius.md }} />
                </Pressable>
              ))}
            </ScrollView>
          </Section>

          <Section title="Cover photo">
            <Pressable testID="pick-cover" onPress={() => setPickerFor("cover")} style={styles.uploadBtn}>
              <Ionicons name="image" size={16} color={theme.brand} />
              <Text style={styles.uploadBtnTxt}>Upload cover</Text>
            </Pressable>
            <Text style={styles.hint}>Or pick a preset:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
              {COVER_CHOICES.map(url => (
                <Pressable key={url} onPress={() => update({ cover_url: url })} style={[styles.coverThumb, p.cover_url === url && styles.pickerOn]}>
                  <Image source={{ uri: url }} style={{ width: "100%", height: "100%", borderRadius: theme.radius.md }} />
                </Pressable>
              ))}
            </ScrollView>
          </Section>

          <Section title="Basic info">
            <Text style={styles.label}>Tagline</Text>
            <TextInput testID="tagline-input" style={styles.input} value={p.tagline || ""} onChangeText={t => update({ tagline: t })} placeholder="Jazz vocalist. Mumbai." placeholderTextColor={theme.textDim} />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <Text style={styles.label}>Bio</Text>
              <Pressable testID="ai-bio" onPress={genBio} disabled={aiLoading} style={styles.aiBtn}>
                {aiLoading ? <ActivityIndicator size="small" color={theme.brand} /> : <Ionicons name="sparkles" size={13} color={theme.brand} />}
                <Text style={styles.aiBtnTxt}>{aiLoading ? "Drafting…" : "AI draft"}</Text>
              </Pressable>
            </View>
            <TextInput testID="bio-input" style={[styles.input, { height: 110, textAlignVertical: "top", paddingTop: 12 }]} value={p.bio || ""} onChangeText={t => update({ bio: t })} multiline placeholder="Tell your story…" placeholderTextColor={theme.textDim} />

            <Text style={styles.label}>City</Text>
            <TextInput testID="city-input" style={styles.input} value={p.city || ""} onChangeText={t => update({ city: t })} placeholder="Mumbai" placeholderTextColor={theme.textDim} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>State</Text>
                <TextInput style={styles.input} value={p.state || ""} onChangeText={t => update({ state: t })} placeholder="Maharashtra" placeholderTextColor={theme.textDim} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Country</Text>
                <TextInput style={styles.input} value={p.country || "India"} onChangeText={t => update({ country: t })} placeholderTextColor={theme.textDim} />
              </View>
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLbl}>Willing to travel</Text>
                <Text style={styles.switchSub}>For gigs outside your city</Text>
              </View>
              <Switch testID="travel-switch" value={!!p.willing_to_travel} onValueChange={v => update({ willing_to_travel: v })} thumbColor={p.willing_to_travel ? theme.brand : "#666"} trackColor={{ true: theme.brandTint, false: theme.bg3 }} />
            </View>
            {p.willing_to_travel && (
              <>
                <Text style={styles.label}>Travel radius (km)</Text>
                <TextInput style={styles.input} value={String(p.travel_radius_km || 50)} onChangeText={t => update({ travel_radius_km: parseInt(t) || 0 })} keyboardType="number-pad" placeholderTextColor={theme.textDim} />
              </>
            )}
          </Section>

          <Section title="Professions">
            <View style={styles.chipWrap}>
              {PROFESSIONS.map(x => (
                <Chip key={x} testID={`prof-${x}`} label={x} on={(p.professions || []).includes(x)} onPress={() => update({ professions: toggle(p.professions, x) })} />
              ))}
            </View>
          </Section>

          <Section title="Skills">
            <View style={styles.chipWrap}>
              {SKILLS.map(x => (
                <Chip key={x} label={x} on={(p.skills || []).includes(x)} onPress={() => update({ skills: toggle(p.skills, x) })} />
              ))}
            </View>
          </Section>

          <Section title="Genres">
            <View style={styles.chipWrap}>
              {GENRES.map(x => (
                <Chip key={x} label={x} on={(p.genres || []).includes(x)} onPress={() => update({ genres: toggle(p.genres, x) })} />
              ))}
            </View>
          </Section>

          <Section title="Instruments">
            <View style={styles.chipWrap}>
              {INSTRUMENTS.map(x => (
                <Chip key={x} label={x} on={(p.instruments || []).includes(x)} onPress={() => update({ instruments: toggle(p.instruments, x) })} />
              ))}
            </View>
          </Section>

          <Section title="Languages">
            <View style={styles.chipWrap}>
              {LANGUAGES.map(x => (
                <Chip key={x} label={x} on={(p.languages || []).includes(x)} onPress={() => update({ languages: toggle(p.languages, x) })} />
              ))}
            </View>
          </Section>

          <Section title="Experience & pricing">
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Years of experience</Text>
                <TextInput testID="exp-input" style={styles.input} value={String(p.experience_years || "")} onChangeText={t => update({ experience_years: parseInt(t) || 0 })} keyboardType="number-pad" placeholder="5" placeholderTextColor={theme.textDim} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Base rate ₹/hour</Text>
                <TextInput testID="price-input" style={styles.input} value={String(p.pricing_per_hour || "")} onChangeText={t => update({ pricing_per_hour: parseInt(t) || 0 })} keyboardType="number-pad" placeholder="5000" placeholderTextColor={theme.textDim} />
              </View>
            </View>
          </Section>

          <Section title="Portfolio">
            {selectionMode && (
              <View style={styles.selBar}>
                <Text style={styles.selCount}>{selection.size} selected</Text>
                <View style={{ flex: 1 }} />
                <Pressable testID="sel-clear" onPress={() => setSelection(new Set())} style={styles.selBtn}>
                  <Text style={styles.selBtnTxt}>Cancel</Text>
                </Pressable>
                <Pressable testID="sel-delete" onPress={bulkDelete} style={[styles.selBtn, { backgroundColor: theme.error, borderColor: theme.error }]}>
                  <Ionicons name="trash" size={13} color="#fff" />
                  <Text style={[styles.selBtnTxt, { color: "#fff" }]}>Delete</Text>
                </Pressable>
              </View>
            )}
            {(p.portfolio_items || []).length > 0 && (
              <View style={styles.portGrid}>
                {(p.portfolio_items || []).map((it: any, i: number) => {
                  const on = selection.has(it.id);
                  return (
                    <Pressable
                      key={it.id}
                      testID={`port-item-${it.id}`}
                      onLongPress={() => toggleSelect(it.id)}
                      onPress={() => selectionMode ? toggleSelect(it.id) : setViewerIdx(i)}
                      delayLongPress={280}
                      style={styles.portTile}
                    >
                      <Image source={{ uri: it.thumbnail_url || it.media_url }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                      {it.media_type === "video" && (
                        <View style={styles.playBadge}><Ionicons name="play-circle" size={20} color="#fff" /></View>
                      )}
                      {on && (
                        <View style={styles.selectedOverlay}>
                          <View style={styles.selectedCheck}><Ionicons name="checkmark" size={14} color="#fff" /></View>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
            <View style={styles.addCard}>
              <TextInput testID="new-port-title" style={styles.input} value={newPortTitle} onChangeText={setNewPortTitle} placeholder="Title (optional if uploading)" placeholderTextColor={theme.textDim} />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <Pressable testID="upload-portfolio" onPress={() => setPickerFor("portfolio")} disabled={saving} style={[styles.addBtn, { flex: 1 }]}>
                  <Ionicons name="cloud-upload" size={16} color={theme.brand} />
                  <Text style={styles.addBtnTxt}>Upload from device</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>Or paste a URL below:</Text>
              <TextInput testID="new-port-url" style={[styles.input, { marginTop: 8 }]} value={newPortUrl} onChangeText={setNewPortUrl} placeholder="https://…" placeholderTextColor={theme.textDim} autoCapitalize="none" />
              <View style={[styles.chipWrap, { marginTop: 8 }]}>
                {(["image", "video", "audio"] as const).map(t => (
                  <Chip key={t} label={t} on={newPortType === t} onPress={() => setNewPortType(t)} />
                ))}
              </View>
              <Pressable testID="add-portfolio" onPress={addPortfolio} disabled={saving} style={styles.addBtn}>
                <Ionicons name="add" size={16} color={theme.brand} />
                <Text style={styles.addBtnTxt}>Add via URL</Text>
              </Pressable>
            </View>
          </Section>

          <Section title="Services offered">
            {(p.services || []).map((s: any) => (
              <View key={s.id} style={styles.portRow} testID={`svc-item-${s.id}`}>
                <View style={styles.svcIcon}><Ionicons name="briefcase" size={18} color={theme.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.portTitle}>{s.title}</Text>
                  <Text style={styles.portMeta}>₹{s.price.toLocaleString("en-IN")} · {s.pricing_type.replace("_", " ")}</Text>
                </View>
                <Pressable testID={`svc-del-${s.id}`} onPress={() => removeService(s.id)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={16} color={theme.error} />
                </Pressable>
              </View>
            ))}
            <View style={styles.addCard}>
              <TextInput testID="new-svc-title" style={styles.input} value={newSvcTitle} onChangeText={setNewSvcTitle} placeholder="Service title" placeholderTextColor={theme.textDim} />
              <TextInput testID="new-svc-desc" style={[styles.input, { marginTop: 8, height: 60, textAlignVertical: "top", paddingTop: 8 }]} value={newSvcDesc} onChangeText={setNewSvcDesc} multiline placeholder="What's included?" placeholderTextColor={theme.textDim} />
              <TextInput testID="new-svc-price" style={[styles.input, { marginTop: 8 }]} value={newSvcPrice} onChangeText={setNewSvcPrice} keyboardType="number-pad" placeholder="Price (INR)" placeholderTextColor={theme.textDim} />
              <View style={[styles.chipWrap, { marginTop: 8 }]}>
                {(["per_hour", "per_event", "starting_at"] as const).map(t => (
                  <Chip key={t} label={t.replace("_", " ")} on={newSvcType === t} onPress={() => setNewSvcType(t)} />
                ))}
              </View>
              <Pressable testID="add-service" onPress={addService} disabled={saving} style={styles.addBtn}>
                <Ionicons name="add" size={16} color={theme.brand} />
                <Text style={styles.addBtnTxt}>Add service</Text>
              </Pressable>
            </View>
          </Section>

          <Section title="Social links">
            <Text style={styles.label}>Instagram</Text>
            <TextInput style={styles.input} value={p.instagram_url || ""} onChangeText={t => update({ instagram_url: t })} placeholder="https://instagram.com/…" placeholderTextColor={theme.textDim} autoCapitalize="none" />
            <Text style={styles.label}>YouTube</Text>
            <TextInput style={styles.input} value={p.youtube_url || ""} onChangeText={t => update({ youtube_url: t })} placeholder="https://youtube.com/@…" placeholderTextColor={theme.textDim} autoCapitalize="none" />
            <Text style={styles.label}>Spotify</Text>
            <TextInput style={styles.input} value={p.spotify_url || ""} onChangeText={t => update({ spotify_url: t })} placeholder="https://open.spotify.com/…" placeholderTextColor={theme.textDim} autoCapitalize="none" />
            <Text style={styles.label}>SoundCloud</Text>
            <TextInput style={styles.input} value={p.soundcloud_url || ""} onChangeText={t => update({ soundcloud_url: t })} placeholder="https://soundcloud.com/…" placeholderTextColor={theme.textDim} autoCapitalize="none" />
            <Text style={styles.label}>Website</Text>
            <TextInput style={styles.input} value={p.website_url || ""} onChangeText={t => update({ website_url: t })} placeholder="https://…" placeholderTextColor={theme.textDim} autoCapitalize="none" />
            <Text style={styles.label}>LinkedIn</Text>
            <TextInput style={styles.input} value={p.linkedin_url || ""} onChangeText={t => update({ linkedin_url: t })} placeholder="https://linkedin.com/in/…" placeholderTextColor={theme.textDim} autoCapitalize="none" />
          </Section>

          <Section title="Privacy">
            <Text style={styles.label}>Profile visibility</Text>
            <View style={styles.chipWrap}>
              {(["public", "followers", "private"] as const).map(v => (
                <Chip key={v} testID={`vis-${v}`} label={v} on={p.visibility === v} onPress={() => update({ visibility: v })} />
              ))}
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>Hide pricing publicly</Text>
              <Switch value={!!p.hide_pricing} onValueChange={v => update({ hide_pricing: v })} thumbColor={p.hide_pricing ? theme.brand : "#666"} trackColor={{ true: theme.brandTint, false: theme.bg3 }} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>Hide precise location</Text>
              <Switch value={!!p.hide_location} onValueChange={v => update({ hide_location: v })} thumbColor={p.hide_location ? theme.brand : "#666"} trackColor={{ true: theme.brandTint, false: theme.bg3 }} />
            </View>
          </Section>

          {err && <Text style={styles.err} testID="edit-error">{err}</Text>}
          {msg && <Text style={styles.ok} testID="edit-ok">{msg}</Text>}

          <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
            <Pressable testID="edit-save-cta" onPress={saveAll} disabled={saving} style={styles.cta}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaTxt}>Save all changes</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <MediaPickerSheet
        visible={!!pickerFor}
        onClose={() => setPickerFor(null)}
        onPicked={onPickedMedia}
        allowsMultiple={pickerFor === "portfolio"}
        allowVideo={pickerFor === "portfolio"}
        aspect={pickerFor === "avatar" ? [1, 1] : pickerFor === "cover" ? [16, 9] : undefined}
        allowEditing={pickerFor === "avatar" || pickerFor === "cover"}
      />

      <MediaViewer
        visible={viewerIdx !== null}
        items={(p.portfolio_items || []).map((it: any) => ({ uri: it.media_url, type: it.media_type, title: it.title }))}
        initialIndex={viewerIdx ?? 0}
        onClose={() => setViewerIdx(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border },
  h1: { ...type.titleLg, color: theme.text, fontWeight: "700" },
  coverPreview: { height: 130, backgroundColor: theme.bg2, marginBottom: 40 },
  avatarPreview: { position: "absolute", bottom: -34, left: 20, width: 76, height: 76, borderRadius: 38, backgroundColor: theme.bg2, borderWidth: 3, borderColor: theme.bg, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avImg: { width: "100%", height: "100%" },
  avTxt: { ...type.displayMd, color: theme.text },
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionTitle: { ...type.titleMd, color: theme.text, fontWeight: "700", marginBottom: 10 },
  label: { ...type.caption, color: theme.textMid, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: { ...type.bodySm, backgroundColor: theme.bg2, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, color: theme.text },
  hint: { ...type.tiny, color: theme.textDim, marginTop: 12, marginBottom: -4 },
  pickerRow: { flexDirection: "row", gap: 10, paddingVertical: 6 },
  picker: { width: 64, height: 64, borderRadius: theme.radius.md, borderWidth: 2, borderColor: theme.border, padding: 2 },
  coverThumb: { width: 120, height: 68, borderRadius: theme.radius.md, borderWidth: 2, borderColor: theme.border, padding: 2 },
  pickerOn: { borderColor: theme.brand },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  chipOn: { backgroundColor: theme.brandTint, borderColor: theme.brand },
  chipTxt: { ...type.caption, color: theme.textDim, fontWeight: "500", textTransform: "capitalize" },
  chipTxtOn: { ...type.caption, color: theme.text, fontWeight: "700", textTransform: "capitalize" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  switchLbl: { ...type.bodySm, color: theme.text, fontWeight: "600" },
  switchSub: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  aiBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.pill, backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand },
  aiBtnTxt: { ...type.tiny, color: theme.brand, fontWeight: "700" },
  portRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.bg2, borderRadius: theme.radius.md, padding: 10, borderWidth: 1, borderColor: theme.border, marginBottom: 8 },
  portThumb: { width: 48, height: 48, borderRadius: theme.radius.sm, backgroundColor: theme.bg3 },
  portTitle: { ...type.caption, color: theme.text, fontWeight: "700" },
  portMeta: { ...type.tiny, color: theme.textDim, marginTop: 2 },
  iconBtn: { padding: 8, borderRadius: theme.radius.md, backgroundColor: theme.bg3 },
  svcIcon: { width: 48, height: 48, borderRadius: theme.radius.sm, backgroundColor: theme.brandTint, alignItems: "center", justifyContent: "center" },
  addCard: { backgroundColor: theme.bg2, borderRadius: theme.radius.md, padding: 12, borderWidth: 1, borderColor: theme.border, borderStyle: "dashed", marginTop: 8 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 10, borderRadius: theme.radius.pill, backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand },
  addBtnTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },
  err: { ...type.caption, color: theme.error, marginTop: 16, marginHorizontal: 20 },
  ok: { ...type.caption, color: theme.success, marginTop: 16, marginHorizontal: 20 },
  cta: { backgroundColor: theme.brand, borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center" },
  ctaTxt: { ...type.titleMd, color: "#fff", fontWeight: "700" },
  avatarBig: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.brandTint, borderColor: theme.brand, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.pill },
  uploadBtnTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },
  clearBtn: { padding: 10, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  portGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  portTile: { width: "31.8%", aspectRatio: 1, borderRadius: theme.radius.md, overflow: "hidden", backgroundColor: theme.bg2 },
  playBadge: { position: "absolute", top: 8, right: 8 },
  selectedOverlay: { position: "absolute", inset: 0, backgroundColor: "rgba(225,29,72,0.4)", borderWidth: 3, borderColor: theme.brand, borderRadius: theme.radius.md, alignItems: "flex-end", padding: 6 },
  selectedCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.brand, alignItems: "center", justifyContent: "center" },
  selBar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, padding: 10, borderRadius: theme.radius.md, backgroundColor: theme.brandTint, borderWidth: 1, borderColor: theme.brand },
  selCount: { ...type.caption, color: theme.brand, fontWeight: "700" },
  selBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.pill, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border },
  selBtnTxt: { ...type.caption, color: theme.textMid, fontWeight: "700" },
});
