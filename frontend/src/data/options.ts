// Centralized static UI options — single source of truth for chip lists,
// categories, presets used across auth/profile/create screens.
// If any of these need to become dynamic later, migrate this module into a
// repository backed by GET /api/options and keep the same exported names.

export const CITIES = [
  "Mumbai", "Bengaluru", "Delhi", "Pune", "Hyderabad", "Chennai", "Kolkata",
];

export const INTERESTS = [
  "Perform", "Hire talent", "Sell equipment", "Rent equipment",
  "Teach", "Book studios", "Build a band",
];

export const GENRES = [
  "Jazz", "Pop", "Rock", "Indie", "EDM", "Classical", "Fusion",
  "R&B", "Soul", "House", "Bollywood", "Carnatic", "Hindustani",
];

export const INSTRUMENTS = [
  "Vocals", "Guitar", "Keyboard", "Violin", "Drums", "Bass",
  "DJ Deck", "Saxophone", "Tabla", "Sitar",
];

export const PROFESSIONS = [
  "Singer", "Guitarist", "Drummer", "Keyboardist", "Violinist", "DJ",
  "Music Producer", "Sound Engineer", "Vocal Coach", "Composer",
  "Music Teacher", "Event Host",
];

export const SKILLS = [
  "Live Performance", "Music Production", "Recording", "Mixing",
  "Mastering", "Song Writing", "Improvisation", "Session Work",
];

export const LANGUAGES = [
  "English", "Hindi", "Marathi", "Tamil", "Telugu",
  "Kannada", "Punjabi", "Bengali",
];

export const EQUIPMENT_CATEGORIES = [
  "Guitar", "Bass", "Keys", "Drums", "Mic", "DJ", "Amp", "Mixer",
];

export const LESSON_SUBJECTS = [
  "Vocals", "Guitar", "Piano", "Drums", "Bass", "Theory", "Production",
];

export const EVENT_TYPES = ["wedding", "corporate", "club", "festival", "private"];

// Preset image choices — used only when the user has no upload yet.
export const AVATAR_CHOICES = [
  "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400",
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400",
  "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=400",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
  "https://images.unsplash.com/photo-1520785643438-5bf77931f493?w=400",
];

export const COVER_CHOICES = [
  "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=1200",
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1200",
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200",
  "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1200",
];

export const GIG_COVERS = [
  "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=800",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800",
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800",
  "https://images.unsplash.com/photo-1519741497674-611481863552?w=800",
];
