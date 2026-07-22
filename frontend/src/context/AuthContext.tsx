import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const API_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

type User = {
  id: string;
  email: string;
  full_name: string;
  role?: "musician" | "organizer" | null;
  onboarded?: boolean;
  avatar_url?: string | null;
};

type AuthCtx = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, full_name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUserLocal: (u: User) => void;
  apiUrl: string;
  fetchApi: <T = any>(path: string, opts?: RequestInit) => Promise<T>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

const TOKEN_KEY = "stagelink_token";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchApi = useCallback(async <T,>(path: string, opts: RequestInit = {}): Promise<T> => {
    const t = token || (await storeGet(TOKEN_KEY));
    const headers: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
    const text = await res.text();
    let json: any;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { detail: text }; }
    if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
    return json as T;
  }, [token]);

  const refreshUser = useCallback(async () => {
    try {
      const u: User = await fetchApi("/auth/me");
      setUser(u);
    } catch { setUser(null); }
  }, [fetchApi]);

  useEffect(() => {
    (async () => {
      const t = await storeGet(TOKEN_KEY);
      if (t) {
        setToken(t);
        try {
          const res = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
          if (res.ok) setUser(await res.json());
          else await storeDel(TOKEN_KEY);
        } catch {}
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.detail || "Login failed");
    await storeSet(TOKEN_KEY, j.access_token);
    setToken(j.access_token);
    setUser(j.user);
  };

  const register = async (email: string, password: string, full_name: string) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, full_name }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.detail || "Register failed");
    await storeSet(TOKEN_KEY, j.access_token);
    setToken(j.access_token);
    setUser(j.user);
  };

  const logout = async () => {
    await storeDel(TOKEN_KEY);
    setToken(null); setUser(null);
  };

  const setUserLocal = (u: User) => setUser(u);

  return (
    <Ctx.Provider value={{ user, token, loading, login, register, logout, refreshUser, setUserLocal, apiUrl: API_URL, fetchApi }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
