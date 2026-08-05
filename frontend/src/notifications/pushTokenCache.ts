/** In-memory Expo push token — kept separate so Auth can import without loading expo-notifications. */

let cachedExpoPushToken: string | null = null;
let lastRegistrationError: string | null = null;

export function getCachedPushToken(): string | null {
  return cachedExpoPushToken;
}

export function setCachedPushToken(token: string | null) {
  cachedExpoPushToken = token;
}

export function getLastPushRegistrationError(): string | null {
  return lastRegistrationError;
}

export function setLastPushRegistrationError(error: string | null) {
  lastRegistrationError = error;
}
