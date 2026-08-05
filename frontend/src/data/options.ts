// Centralized static UI options — chip lists and categories for forms.
// No stock photos or mock content — users upload their own media.
//
// Live lists:
//   GET /api/config/onboarding       → cities, interests
//   GET /api/config/profile-options  → professions, skills, genres, instruments, languages
// Values below are offline fallbacks only.

/** Launch city fallback — live list comes from the API. */
export const DEFAULT_CITY = "Hyderabad";
export const CITIES = [DEFAULT_CITY] as const;
export type City = (typeof CITIES)[number];

/** Fallback interests if /config/onboarding is unreachable. */
export const INTERESTS = [
  "Perform", "Hire talent", "Sell equipment", "Rent equipment",
  "Teach", "Book studios", "Build a band",
];

/** Fallbacks if /config/profile-options is unreachable. */
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

export const ENTITY_TYPES = ["Gigs", "Musicians", "Bands", "Studios", "Equipment", "Lessons", "Venues"] as const;
export type EntityType = typeof ENTITY_TYPES[number];
