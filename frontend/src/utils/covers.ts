/**
 * Generic cover images for marketplace cards when the user didn't upload one
 * (or their upload fails to render). Stable Unsplash CDN URLs.
 */
export type CoverKind = "band" | "equipment" | "studio" | "lesson" | "venue" | "gig";

export const DEFAULT_COVERS: Record<CoverKind, string> = {
  band: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80",
  equipment: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80",
  studio: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80",
  lesson: "https://images.unsplash.com/photo-1514320291840-3095421dfa9a?auto=format&fit=crop&w=1200&q=80",
  venue: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80",
  gig: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80",
};

export function resolveCover(kind: CoverKind, url?: string | null, images?: string[] | null): string {
  const first = (images || []).find((u) => typeof u === "string" && u.trim());
  const candidate = (url && String(url).trim()) || first || "";
  if (candidate) return candidate;
  return DEFAULT_COVERS[kind];
}
