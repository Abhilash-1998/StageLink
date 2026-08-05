import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Image, Switch, Linking, Share, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/context/AuthContext";
import { theme, type } from "@/src/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { MediaPickerSheet, PickedMedia } from "@/src/components/MediaPickerSheet";
import { GENRES, INSTRUMENTS, PROFESSIONS, SKILLS, LANGUAGES, DEFAULT_CITY } from "@/src/data/options";
import { confirmDelete } from "@/src/utils/confirm";
import { PRICING_TYPES, PRICING_TYPE_LABELS, pricingUnitLabel, type PricingType } from "@/src/utils/pricing";

type ProfileOptions = {
  professions: string[];
  skills: string[];
  genres: string[];
  instruments: string[];
  languages: string[];
  pricing_types: string[];
};

const FALLBACK_OPTIONS: ProfileOptions = {
  professions: [...PROFESSIONS],
  skills: [...SKILLS],
  genres: [...GENRES],
  instruments: [...INSTRUMENTS],
  languages: [...LANGUAGES],
  pricing_types: [...PRICING_TYPES],
};

const PORTFOLIO_MAX_LINKS = 5;

function portfolioHostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("drive.google")) return "Google Drive";
    if (host.includes("dropbox")) return "Dropbox";
    if (host.includes("youtube") || host.includes("youtu.be")) return "YouTube";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("soundcloud")) return "SoundCloud";
    return host;
  } catch {
    return "Link";
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

export default function EditProfile() {
  const { user, fetchApi, refreshUser } = useAuth();
  const [p, setP] = useState<any>(null);
  const [opts, setOpts] = useState<ProfileOptions>(FALLBACK_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  // Portfolio + Services drafts
  const [newPortTitle, setNewPortTitle] = useState("");
  const [newPortUrl, setNewPortUrl] = useState("");
  const [newSvcTitle, setNewSvcTitle] = useState("");
  const [newSvcDesc, setNewSvcDesc] = useState("");
  const [newSvcPrice, setNewSvcPrice] = useState("");
  const [newSvcType, setNewSvcType] = useState<PricingType>("per_event");

  // Avatar / cover picker only (portfolio is link-based)
  const [pickerFor, setPickerFor] = useState<null | "avatar" | "cover">(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const selectionMode = selection.size > 0;

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [profileRes, optionsRes] = await Promise.all([
        fetchApi(`/profile/musician/${user.id}`).catch(() => null),
        fetchApi<ProfileOptions>("/config/profile-options").catch(() => null),
      ]);
      const profile = (profileRes as any)?.profile || {};
      // Default: hide contact unless explicitly set to public (false)
      if (profile.hide_contact === undefined || profile.hide_contact === null) {
        profile.hide_contact = true;
      }
      setP(profile);
      if (optionsRes) {
        setOpts({
          professions: optionsRes.professions?.length ? optionsRes.professions : FALLBACK_OPTIONS.professions,
          skills: optionsRes.skills?.length ? optionsRes.skills : FALLBACK_OPTIONS.skills,
          genres: optionsRes.genres?.length ? optionsRes.genres : FALLBACK_OPTIONS.genres,
          instruments: optionsRes.instruments?.length ? optionsRes.instruments : FALLBACK_OPTIONS.instruments,
          languages: optionsRes.languages?.length ? optionsRes.languages : FALLBACK_OPTIONS.languages,
          pricing_types: optionsRes.pricing_types?.length ? optionsRes.pricing_types : FALLBACK_OPTIONS.pricing_types,
        });
      }
    } catch { setP({}); }
    finally { setLoading(false); }
  }, [fetchApi, user]);

  // Load once on mount — do not reload on every focus/re-render (that dismisses the keyboard).
  useEffect(() => {
    if (loadedOnce.current) return;
    if (!user) return;
    loadedOnce.current = true;
    load();
  }, [user, load]);

  const toggle = (list: string[] = [], v: string) =>
    list.includes(v) ? list.filter(x => x !== v) : [...list, v];

  const update = (patch: any) => setP((prev: any) => ({ ...(prev || {}), ...patch }));

  const savePrivacy = async (patch: { hide_pricing?: boolean; hide_location?: boolean; hide_contact?: boolean }) => {
    update(patch);
    setErr(null);
    try {
      await fetchApi("/profile/musician", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMsg("Privacy updated");
      setTimeout(() => setMsg(null), 1800);
    } catch (e: any) {
      setErr(e.message || "Could not update privacy");
    }
  };

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

  const saveAll = async () => {
    // Save pending portfolio link first so it isn't lost if only "Save" is tapped.
    const pendingUrl = newPortUrl.trim();
    if (pendingUrl) {
      const ok = await addPortfolio();
      if (!ok) return;
    }
    await savePatch({
      bio: p?.bio, tagline: p?.tagline, city: DEFAULT_CITY, state: p?.state, country: p?.country,
      phone: p?.phone || "",
      genres: p?.genres || [], instruments: p?.instruments || [],
      languages: p?.languages || [], professions: p?.professions || [], skills: p?.skills || [],
      experience_years: parseInt(String(p?.experience_years || 0)) || 0,
      pricing_per_hour: parseInt(String(p?.pricing_per_hour || 0)) || 0,
      pricing_type: (p?.pricing_type as PricingType) || "per_event",
      willing_to_travel: !!p?.willing_to_travel,
      travel_radius_km: parseInt(String(p?.travel_radius_km || 50)) || 50,
      youtube_url: p?.youtube_url, instagram_url: p?.instagram_url, spotify_url: p?.spotify_url,
      soundcloud_url: p?.soundcloud_url, website_url: p?.website_url, linkedin_url: p?.linkedin_url,
      facebook_url: p?.facebook_url, apple_music_url: p?.apple_music_url,
      avatar_url: p?.avatar_url, cover_url: p?.cover_url,
      visibility: p?.visibility || "public",
      hide_pricing: !!p?.hide_pricing, hide_location: !!p?.hide_location, hide_contact: p?.hide_contact !== false,
    });
  };

  const refreshPortfolio = useCallback(async () => {
    if (!user) return [] as any[];
    try {
      const r: any = await fetchApi(`/profile/musician/${user.id}`);
      const items = Array.isArray(r?.profile?.portfolio_items) ? r.profile.portfolio_items : [];
      setP((prev: any) => {
        const prevItems = Array.isArray(prev?.portfolio_items) ? prev.portfolio_items : [];
        // Never wipe a just-added local item if the server briefly returns [].
        const merged = items.length > 0 ? items : prevItems;
        return {
          ...(prev || {}),
          portfolio_items: merged,
          services: r?.profile?.services || prev?.services || [],
        };
      });
      return items;
    } catch {
      return [] as any[];
    }
  }, [fetchApi, user]);

  /** Returns true if the link was saved (or nothing to save). */
  const addPortfolio = async (): Promise<boolean> => {
    const title = newPortTitle.trim() || "Portfolio link";
    let url = newPortUrl.trim();
    if (!url) {
      const msg = "Paste a Google Drive / YouTube / portfolio link first";
      setErr(msg);
      Alert.alert("Portfolio", msg);
      return false;
    }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    const items = p?.portfolio_items || [];
    if (items.length >= PORTFOLIO_MAX_LINKS) {
      const msg = `Portfolio limit: ${PORTFOLIO_MAX_LINKS} links max`;
      setErr(msg);
      Alert.alert("Portfolio", msg);
      return false;
    }

    setSaving(true); setErr(null);
    try {
      const item: any = await fetchApi("/profile/portfolio", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: "",
          category: "Performance",
          media_url: url,
          media_type: "link",
          tags: [],
        }),
      });

      // Optimistic: show immediately even if refresh is slow/empty.
      if (item?.id && item?.media_url) {
        setP((prev: any) => {
          const cur = Array.isArray(prev?.portfolio_items) ? prev.portfolio_items : [];
          if (cur.some((x: any) => x.id === item.id)) return prev;
          return { ...(prev || {}), portfolio_items: [...cur, item] };
        });
      }

      setNewPortTitle("");
      setNewPortUrl("");
      await refreshPortfolio();
      setMsg("Portfolio link added");
      setTimeout(() => setMsg(null), 2000);
      return true;
    } catch (e: any) {
      const msg = e?.message || "Could not save portfolio link";
      setErr(msg);
      Alert.alert("Couldn't save link", msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openPortfolioLink = async (url: string) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else setErr("Couldn't open that link");
    } catch {
      setErr("Couldn't open that link");
    }
  };

  const removePortfolio = async (id: string) => {
    if (!(await confirmDelete("Delete this portfolio link?"))) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await fetchApi(`/profile/portfolio/${id}`, { method: "DELETE" });
    await refreshPortfolio();
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
    if (!(await confirmDelete(`Delete ${selection.size} item${selection.size === 1 ? "" : "s"}?`))) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const ids = Array.from(selection);
    await Promise.all(ids.map(id => fetchApi(`/profile/portfolio/${id}`, { method: "DELETE" })));
    setSelection(new Set());
    await refreshPortfolio();
    setMsg(`Deleted ${ids.length} item${ids.length === 1 ? "" : "s"}`);
    setTimeout(() => setMsg(null), 2000);
  };

  const onPickedMedia = async (items: PickedMedia[]) => {
    if (!items.length) return;
    if (pickerFor === "avatar") {
      update({ avatar_url: items[0].uri });
    } else if (pickerFor === "cover") {
      update({ cover_url: items[0].uri });
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
    if (!(await confirmDelete("Delete this service?"))) return;
    await fetchApi(`/profile/services/${id}`, { method: "DELETE" });
    await load();
  };

  if (loading || !p) return <SafeAreaView style={styles.bg}><View style={styles.center}><ActivityIndicator color={theme.brand} /></View></SafeAreaView>;

  const portfolioItems: any[] = p.portfolio_items || [];
  const portfolioFull = portfolioItems.length >= PORTFOLIO_MAX_LINKS;

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
          {/* Cover + avatar with upload actions stacked on the previews */}
          <View style={styles.heroWrap}>
            <View style={styles.coverPreview}>
              {p.cover_url
                ? <Image source={{ uri: p.cover_url }} style={StyleSheet.absoluteFill} />
                : <LinearGradient colors={[theme.brand2, theme.bg]} style={StyleSheet.absoluteFill} />}
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.45)"]}
                style={styles.coverShade}
                pointerEvents="none"
              />
              <Pressable
                testID="pick-cover"
                onPress={() => setPickerFor("cover")}
                style={styles.coverAction}
                accessibilityLabel="Change cover photo"
              >
                <Ionicons name="image" size={14} color="#fff" />
                <Text style={styles.coverActionTxt}>{p.cover_url ? "Change cover" : "Add cover"}</Text>
              </Pressable>
              {!!p.cover_url && (
                <Pressable
                  testID="clear-cover"
                  onPress={() => update({ cover_url: "" })}
                  style={styles.coverClear}
                  accessibilityLabel="Remove cover photo"
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              )}
            </View>

            <Pressable
              testID="pick-avatar"
              onPress={() => setPickerFor("avatar")}
              style={styles.avatarPreview}
              accessibilityLabel="Change profile photo"
            >
              <View style={styles.avatarInner}>
                {p.avatar_url ? <Image source={{ uri: p.avatar_url }} style={styles.avImg} /> :
                  <Text style={styles.avTxt}>{user?.full_name?.[0]}</Text>}
              </View>
              <View style={styles.avatarCamBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </Pressable>
          </View>
          {p.avatar_url ? (
            <View style={styles.photoHintRow}>
              <Pressable testID="clear-avatar" onPress={() => update({ avatar_url: "" })} style={styles.photoHintBtn}>
                <Ionicons name="trash-outline" size={13} color={theme.textDim} />
                <Text style={styles.photoHintTxt}>Remove photo</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.photoHint}>Tap cover or photo to upload</Text>
          )}

          <Section title="Basic info">
            <Text style={styles.label}>Tagline</Text>
            <TextInput testID="tagline-input" style={styles.input} value={p.tagline || ""} onChangeText={t => update({ tagline: t })} placeholder="Jazz vocalist. Hyderabad." placeholderTextColor={theme.textDim} />

            <Text style={styles.label}>Bio</Text>
            <TextInput testID="bio-input" style={[styles.input, { height: 110, textAlignVertical: "top", paddingTop: 12 }]} value={p.bio || ""} onChangeText={t => update({ bio: t })} multiline placeholder="Tell your story…" placeholderTextColor={theme.textDim} />

            <Text style={styles.label}>Mobile number</Text>
            <TextInput
              testID="phone-input"
              style={styles.input}
              value={p.phone || ""}
              onChangeText={t => update({ phone: t })}
              placeholder="+91 98765 43210"
              placeholderTextColor={theme.textDim}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
            />
            <Text style={[styles.hint, { marginTop: 6 }]}>Used for booking coordination. You can hide it in Privacy.</Text>

            <Text style={styles.label}>City</Text>
            <View style={[styles.input, { justifyContent: "center" }]}>
              <Text style={{ ...type.bodySm, color: theme.text }}>{DEFAULT_CITY}</Text>
            </View>
            <Text style={[styles.hint, { marginTop: 6 }]}>Hyderabad only for this release. More cities soon.</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>State</Text>
                <TextInput style={styles.input} value={p.state || ""} onChangeText={t => update({ state: t })} placeholder="Telangana" placeholderTextColor={theme.textDim} />
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

            <Pressable
              testID="edit-open-availability"
              onPress={() => router.push("/profile/availability")}
              style={styles.linkRow}
            >
              <View style={styles.linkIcon}><Ionicons name="calendar-outline" size={18} color={theme.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Availability</Text>
                <Text style={styles.linkSub}>Days you’re free · vacation dates</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
            </Pressable>
          </Section>

          <Section title="Professions">
            <View style={styles.chipWrap}>
              {opts.professions.map(x => (
                <Chip key={x} testID={`prof-${x}`} label={x} on={(p.professions || []).includes(x)} onPress={() => update({ professions: toggle(p.professions, x) })} />
              ))}
            </View>
          </Section>

          <Section title="Skills">
            <View style={styles.chipWrap}>
              {opts.skills.map(x => (
                <Chip key={x} label={x} on={(p.skills || []).includes(x)} onPress={() => update({ skills: toggle(p.skills, x) })} />
              ))}
            </View>
          </Section>

          <Section title="Genres">
            <View style={styles.chipWrap}>
              {opts.genres.map(x => (
                <Chip key={x} label={x} on={(p.genres || []).includes(x)} onPress={() => update({ genres: toggle(p.genres, x) })} />
              ))}
            </View>
          </Section>

          <Section title="Instruments">
            <View style={styles.chipWrap}>
              {opts.instruments.map(x => (
                <Chip key={x} label={x} on={(p.instruments || []).includes(x)} onPress={() => update({ instruments: toggle(p.instruments, x) })} />
              ))}
            </View>
          </Section>

          <Section title="Languages">
            <View style={styles.chipWrap}>
              {opts.languages.map(x => (
                <Chip key={x} label={x} on={(p.languages || []).includes(x)} onPress={() => update({ languages: toggle(p.languages, x) })} />
              ))}
            </View>
          </Section>

          <Section title="Experience & pricing">
            <Text style={styles.label}>Years of experience</Text>
            <TextInput testID="exp-input" style={styles.input} value={String(p.experience_years || "")} onChangeText={t => update({ experience_years: parseInt(t) || 0 })} keyboardType="number-pad" placeholder="5" placeholderTextColor={theme.textDim} />

            <Text style={styles.label}>Base rate (INR)</Text>
            <TextInput
              testID="price-input"
              style={styles.input}
              value={String(p.pricing_per_hour || "")}
              onChangeText={t => update({ pricing_per_hour: parseInt(t) || 0 })}
              keyboardType="number-pad"
              placeholder="5000"
              placeholderTextColor={theme.textDim}
            />
            <Text style={styles.label}>Rate type</Text>
            <View style={styles.chipWrap}>
              {opts.pricing_types.map(t => (
                <Chip
                  key={t}
                  testID={`pricing-type-${t}`}
                  label={PRICING_TYPE_LABELS[t] || pricingUnitLabel(t)}
                  on={(p.pricing_type || "per_event") === t}
                  onPress={() => update({ pricing_type: t })}
                />
              ))}
            </View>
            <Text style={[styles.hint, { marginTop: 8 }]}>
              Example: singers often use per event; studios / recording use per session; teachers use per hour.
            </Text>
          </Section>

          <Section title="Portfolio">
            <Text style={styles.hint}>
              Add Google Drive / Dropbox / YouTube links to your work.
              {"  "}({portfolioItems.length}/{PORTFOLIO_MAX_LINKS} links)
            </Text>
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
            {portfolioItems.length > 0 && (
              <View style={{ gap: 8, marginTop: 8, marginBottom: 8 }}>
                {portfolioItems.map((it: any) => {
                  const on = selection.has(it.id);
                  const label = portfolioHostLabel(it.media_url || "");
                  return (
                    <Pressable
                      key={it.id}
                      testID={`port-item-${it.id}`}
                      onLongPress={() => toggleSelect(it.id)}
                      onPress={() => selectionMode ? toggleSelect(it.id) : openPortfolioLink(it.media_url)}
                      delayLongPress={280}
                      style={[styles.portRow, on && { borderColor: theme.brand }]}
                    >
                      <View style={styles.svcIcon}>
                        <Ionicons name="link-outline" size={18} color={theme.brand} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.portTitle} numberOfLines={1}>{it.title || "Portfolio link"}</Text>
                        <Text style={styles.portMeta} numberOfLines={1}>{label}</Text>
                      </View>
                      {on ? (
                        <View style={styles.selectedCheck}><Ionicons name="checkmark" size={14} color="#fff" /></View>
                      ) : (
                        <>
                          <Pressable
                            testID={`port-share-${it.id}`}
                            onPress={() => {
                              Share.share({
                                title: it.title || "Portfolio link",
                                message: `${it.title || "Portfolio"}\n${it.media_url}`,
                                url: it.media_url,
                              }).catch(() => {});
                            }}
                            style={styles.iconBtn}
                          >
                            <Ionicons name="share-outline" size={16} color={theme.textMid} />
                          </Pressable>
                          <Pressable testID={`port-del-${it.id}`} onPress={() => removePortfolio(it.id)} style={styles.iconBtn}>
                            <Ionicons name="trash-outline" size={16} color={theme.error} />
                          </Pressable>
                        </>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {portfolioFull ? (
              <Text style={[styles.hint, { marginTop: 8 }]}>Portfolio full — delete a link to add more.</Text>
            ) : (
              <View style={styles.addCard}>
                <TextInput
                  testID="new-port-title"
                  style={styles.input}
                  value={newPortTitle}
                  onChangeText={setNewPortTitle}
                  placeholder="Title (optional)"
                  placeholderTextColor={theme.textDim}
                />
                <TextInput
                  testID="new-port-url"
                  style={[styles.input, { marginTop: 8 }]}
                  value={newPortUrl}
                  onChangeText={setNewPortUrl}
                  placeholder="https://drive.google.com/..."
                  placeholderTextColor={theme.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Pressable
                  testID="add-portfolio"
                  onPress={() => { void addPortfolio(); }}
                  disabled={saving}
                  style={[styles.addBtn, { marginTop: 10 }]}
                >
                  <Ionicons name="add" size={16} color={theme.brand} />
                  <Text style={styles.addBtnTxt}>Add portfolio link</Text>
                </Pressable>
                <Text style={[styles.hint, { marginTop: 8 }]}>
                  Tip: tap “Add portfolio link” (or Save) after pasting the URL.
                </Text>
              </View>
            )}
          </Section>

          <Section title="Services offered">
            {(p.services || []).map((s: any) => (
              <View key={s.id} style={styles.portRow} testID={`svc-item-${s.id}`}>
                <View style={styles.svcIcon}><Ionicons name="briefcase" size={18} color={theme.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.portTitle}>{s.title}</Text>
                  <Text style={styles.portMeta}>₹{s.price.toLocaleString("en-IN")} · {PRICING_TYPE_LABELS[s.pricing_type] || pricingUnitLabel(s.pricing_type)}</Text>
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
                {(opts.pricing_types.length ? opts.pricing_types : PRICING_TYPES).map(t => (
                  <Chip key={t} label={PRICING_TYPE_LABELS[t] || pricingUnitLabel(t)} on={newSvcType === t} onPress={() => setNewSvcType(t as PricingType)} />
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
              <Switch value={!!p.hide_pricing} onValueChange={v => savePrivacy({ hide_pricing: v })} thumbColor={p.hide_pricing ? theme.brand : "#666"} trackColor={{ true: theme.brandTint, false: theme.bg3 }} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>Hide precise location</Text>
              <Switch value={!!p.hide_location} onValueChange={v => savePrivacy({ hide_location: v })} thumbColor={p.hide_location ? theme.brand : "#666"} trackColor={{ true: theme.brandTint, false: theme.bg3 }} />
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLbl}>Hide mobile number</Text>
                <Text style={styles.switchSub}>Others won’t see your phone (profile + Call)</Text>
              </View>
              <Switch value={p.hide_contact !== false} onValueChange={v => savePrivacy({ hide_contact: v })} thumbColor={p.hide_contact !== false ? theme.brand : "#666"} trackColor={{ true: theme.brandTint, false: theme.bg3 }} />
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
        allowsMultiple={false}
        allowImage
        allowVideo={false}
        selectionLimit={1}
        aspect={pickerFor === "avatar" ? [1, 1] : pickerFor === "cover" ? [16, 9] : undefined}
        allowEditing={pickerFor === "avatar" || pickerFor === "cover"}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border },
  h1: { ...type.titleLg, color: theme.text, fontWeight: "700" },
  heroWrap: { marginBottom: 12 },
  coverPreview: { height: 150, backgroundColor: theme.bg2, overflow: "hidden" },
  coverShade: { ...StyleSheet.absoluteFillObject },
  coverAction: {
    position: "absolute", right: 12, bottom: 12, zIndex: 2,
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill,
    backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  coverActionTxt: { ...type.caption, color: "#fff", fontWeight: "700" },
  coverClear: {
    position: "absolute", top: 12, right: 12, zIndex: 2,
    width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  avatarPreview: {
    position: "absolute", bottom: -36, left: 20, width: 84, height: 84,
    alignItems: "center", justifyContent: "center", zIndex: 3,
  },
  avatarInner: {
    width: 84, height: 84, borderRadius: 42, overflow: "hidden",
    backgroundColor: theme.bg2, borderWidth: 3, borderColor: theme.bg,
    alignItems: "center", justifyContent: "center",
  },
  avatarCamBadge: {
    position: "absolute", right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.brand, borderWidth: 2, borderColor: theme.bg,
    alignItems: "center", justifyContent: "center",
  },
  avImg: { width: "100%", height: "100%" },
  avTxt: { ...type.displayMd, color: theme.text },
  photoHint: { ...type.caption, color: theme.textDim, paddingHorizontal: 20, marginTop: 44, marginBottom: 4 },
  photoHintRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 20, marginTop: 44, marginBottom: 4 },
  photoHintBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  photoHintTxt: { ...type.caption, color: theme.textDim },
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
  linkRow: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16,
    padding: 14, borderRadius: theme.radius.md, backgroundColor: theme.bg2,
    borderWidth: 1, borderColor: theme.border,
  },
  linkIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: theme.brandTint,
    alignItems: "center", justifyContent: "center",
  },
  linkTitle: { ...type.bodySm, color: theme.text, fontWeight: "700" },
  linkSub: { ...type.caption, color: theme.textDim, marginTop: 2 },
  switchLbl: { ...type.bodySm, color: theme.text, fontWeight: "600" },
  switchSub: { ...type.tiny, color: theme.textDim, marginTop: 2 },
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
