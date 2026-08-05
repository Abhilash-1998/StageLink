import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

type NetworkCtx = {
  isOnline: boolean;
  checking: boolean;
  refresh: () => Promise<boolean>;
};

const Ctx = createContext<NetworkCtx>({
  isOnline: true,
  checking: false,
  refresh: async () => true,
});

function resolveOnline(state: NetInfoState): boolean {
  // isInternetReachable can be null while unknown — don't flash offline then
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  if (state.isConnected === true && state.isInternetReachable !== false) return true;
  return true;
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let mounted = true;
    NetInfo.fetch().then((state) => {
      if (mounted) setIsOnline(resolveOnline(state));
    }).catch(() => {});

    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(resolveOnline(state));
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const state = await NetInfo.fetch();
      const online = resolveOnline(state);
      setIsOnline(online);
      return online;
    } catch {
      setIsOnline(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  const value = useMemo(
    () => ({ isOnline, checking, refresh }),
    [isOnline, checking, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNetwork() {
  return useContext(Ctx);
}
