import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/src/config/backend";

const HEALTH_URL = `${API_BASE}/health`;
const POLL_MS = 60_000;
/** Fail open quickly so Expo Go / bad networks don't freeze on a spinner. */
const PROBE_TIMEOUT_MS = 3_500;

type HealthCtx = {
  /** null = still checking first time */
  healthy: boolean | null;
  message: string | null;
  checking: boolean;
  refresh: () => Promise<boolean>;
};

const Ctx = createContext<HealthCtx>({
  healthy: null,
  message: null,
  checking: false,
  refresh: async () => true,
});

async function probeHealth(signal?: AbortSignal): Promise<{ ok: boolean; message: string | null }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(HEALTH_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      if (!res.ok || json?.ok === false) {
        return {
          ok: false,
          message:
            (typeof json?.message === "string" && json.message) ||
            "gigZee is under maintenance. Please try again shortly.",
        };
      }
      return { ok: true, message: null };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  } catch {
    // Network blip / Expo tunnel lag — allow the app through; screens will error on API.
    return { ok: true, message: null };
  }
}

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);

  const apply = useCallback((ok: boolean, msg: string | null) => {
    if (!mounted.current) return;
    setHealthy(ok);
    setMessage(ok ? null : msg);
  }, []);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const r = await probeHealth();
      apply(r.ok, r.message);
      return r.ok;
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    const ac = new AbortController();
    (async () => {
      setChecking(true);
      const r = await probeHealth(ac.signal);
      apply(r.ok, r.message);
      if (mounted.current) setChecking(false);
    })();

    const id = setInterval(() => {
      refresh();
    }, POLL_MS);

    return () => {
      mounted.current = false;
      ac.abort();
      clearInterval(id);
    };
  }, [apply, refresh]);

  const value = useMemo(
    () => ({ healthy, message, checking, refresh }),
    [healthy, message, checking, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHealth() {
  return useContext(Ctx);
}
