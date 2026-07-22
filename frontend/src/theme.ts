import { TextStyle } from "react-native";

// -------- Design tokens --------
export const theme = {
  bg: "#09090B",
  bg2: "#18181B",
  bg3: "#27272A",
  text: "#FAFAFA",
  textDim: "#A1A1AA",
  textMid: "#E4E4E7",
  brand: "#E11D48",
  brand2: "#BE123C",
  brandTint: "#4C0519",
  border: "#27272A",
  borderStrong: "#3F3F46",
  success: "#059669",
  warning: "#D97706",
  error: "#DC2626",
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
} as const;

// -------- Typography scale --------
// One source of truth for all text styles. Compose with color at usage:
//   { ...type.h1, color: theme.text }
type W = TextStyle["fontWeight"];

export const type = {
  // Displays — splash / hero
  displayLg: { fontSize: 36, fontWeight: "800" as W, letterSpacing: -1, lineHeight: 42 },
  displayMd: { fontSize: 30, fontWeight: "800" as W, letterSpacing: -0.6, lineHeight: 36 },

  // Headings
  h1:    { fontSize: 24, fontWeight: "800" as W, letterSpacing: -0.4, lineHeight: 30 },
  h2:    { fontSize: 22, fontWeight: "700" as W, letterSpacing: -0.3, lineHeight: 28 },
  h3:    { fontSize: 20, fontWeight: "700" as W, letterSpacing: -0.2, lineHeight: 26 },

  // Titles
  titleLg: { fontSize: 18, fontWeight: "700" as W, letterSpacing: -0.1, lineHeight: 24 },
  titleMd: { fontSize: 16, fontWeight: "600" as W, lineHeight: 22 },

  // Body
  bodyLg:  { fontSize: 16, fontWeight: "400" as W, lineHeight: 24 },
  bodyMd:  { fontSize: 15, fontWeight: "400" as W, lineHeight: 22 },
  bodySm:  { fontSize: 14, fontWeight: "400" as W, lineHeight: 20 },

  // Meta
  caption: { fontSize: 12, fontWeight: "400" as W, letterSpacing: 0.1, lineHeight: 17 },
  label:   { fontSize: 13, fontWeight: "600" as W, letterSpacing: 0.1, lineHeight: 18 },
  tiny:    { fontSize: 11, fontWeight: "400" as W, letterSpacing: 0.1, lineHeight: 15 },

  // Emphasis (numeric)
  price:   { fontSize: 20, fontWeight: "800" as W, letterSpacing: -0.3, lineHeight: 26 },
  priceLg: { fontSize: 30, fontWeight: "800" as W, letterSpacing: -0.5, lineHeight: 36 },
  stat:    { fontSize: 22, fontWeight: "800" as W, letterSpacing: -0.3, lineHeight: 28 },

  // Badges — tiny bold tags like "PRO", "BEST"
  badge:   { fontSize: 10, fontWeight: "800" as W, letterSpacing: 0.5, lineHeight: 12 },
} as const;
