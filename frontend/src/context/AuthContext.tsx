import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const API_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

type User = {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
  active_role?: string | null;
  onboarded?: boolean;
  avatar_url?: string | null;
  verified?: boolean;
  premium?: boolean;
};

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthCtx = {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUserLocal: (u: User) => void;
  apiUrl: string;
  fetchApi: <T = any>(path: string, opts?: RequestInit) => Promise<T>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

const ACCESS_KEY = "stagelink_access_token";
const REFRESH_KEY = "stagelink_refresh_token";

async function storeGet(k: string) {
  if (Platform.OS === "web") return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null;
  return SecureStore.getItemAsync(k);
}
async function storeSet(k: string, v: string) {
  if (Platform.OS === "web") { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); return; }
  return SecureStore.setItemAsync(k, v);
}
async function storeDel(k: string) {
  if (Platform.OS === "web") { if (typeof localStorage !== "undefined") localStorage.removeItem(k); return; }
  return SecureStore.deleteItemAsync(k);
}

async function clearTokens() {
  await Promise.all([storeDel(ACCESS_KEY), storeDel(REFRESH_KEY)]);
}
async function saveTokens(access: string, refresh: string) {
  await Promise.all([storeSet(ACCESS_KEY, access), storeSet(REFRESH_KEY, refresh)]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const refreshing = useRef<Promise<string | null> | null>(null);

  const tryRefresh = useCallback(async (): Promise<string | null> => {
    if (refreshing.current) return refreshing.current;
    const doRefresh = (async () => {
      const rt = await storeGet(REFRESH_KEY);
      if (!rt) return null;
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: rt }),
        });
        if (!res.ok) return null;
        const j = await res.json();
        await saveTokens(j.access_token, j.refresh_token);
        if (j.user) setUser(j.user);
        return j.access_token as string;
      } catch { return null; }
    })();
    refreshing.current = doRefresh;
    try { return await doRefresh; }
    finally { refreshing.current = null; }
  }, []);

  const fetchApi = useCallback(async <T,>(path: string, opts: RequestInit = {}): Promise<T> => {
    const attempt = async (token: string | null) => {
      const headers: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
      if (token) headers.Authorization = `Bearer ${token}`;
      return fetch(`${API_URL}${path}`, { ...opts, headers });
    };
    let token = await storeGet(ACCESS_KEY);
    let res = await attempt(token);
    if (res.status === 401 && token) {
      const newToken = await tryRefresh();
      if (newToken) {
        res = await attempt(newToken);
      } else {
        await clearTokens();
        setUser(null);
        setStatus("unauthenticated");
        throw new Error("Session expired. Please sign in again.");
      }
    }
    const text = await res.text();
    let json: any;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { detail: text }; }
    if (!res.ok) {
      const detail = json?.detail;
      const msg = Array.isArray(detail) ? (detail[0]?.msg || "Validation error")
                : (typeof detail === "string" ? detail : `Request failed (${res.status})`);
      throw new Error(msg);
    }
    return json as T;
  }, [tryRefresh]);

  const refreshUser = useCallback(async () => {
    try {
      const u = await fetchApi<User>("/auth/me");
      setUser(u);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, [fetchApi]);

  useEffect(() => {
    (async () => {
      const at = await storeGet(ACCESS_KEY);
      if (!at) { setStatus("unauthenticated"); return; }
      try {
        const res = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${at}` } });
        if (res.ok) { setUser(await res.json()); setStatus("authenticated"); return; }
        if (res.status === 401) {
          const newToken = await tryRefresh();
          if (newToken) {
            const r2 = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${newToken}` } });
            if (r2.ok) { setUser(await r2.json()); setStatus("authenticated"); return; }
          }
        }
        await clearTokens();
        setStatus("unauthenticated");
      } catch {
        // Network error — allow unauthenticated so login screen shows.
        setStatus("unauthenticated");
      }
    })();
  }, [tryRefresh]);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = j?.detail;
      const msg = Array.isArray(detail) ? (detail[0]?.msg || "Login failed")
                : (typeof detail === "string" ? detail : "Login failed");
      throw new Error(msg);
    }
    await saveTokens(j.access_token, j.refresh_token);
    setUser(j.user);
    setStatus("authenticated");
  };

  const register = async (email: string, password: string, full_name: string) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, full_name: full_name.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = j?.detail;
      const msg = Array.isArray(detail) ? (detail[0]?.msg || "Registration failed")
                : (typeof detail === "string" ? detail : "Registration failed");
      throw new Error(msg);
    }
    await saveTokens(j.access_token, j.refresh_token);
    setUser(j.user);
    setStatus("authenticated");
  };

  const logout = async () => {
    try { await fetchApi("/auth/logout", { method: "POST" }); } catch {}
    await clearTokens();
    setUser(null);
    setStatus("unauthenticated");
  };

  const setUserLocal = (u: User) => setUser(u);

  return (
    <Ctx.Provider value={{ user, status, login, register, logout, refreshUser, setUserLocal, apiUrl: API_URL, fetchApi }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
