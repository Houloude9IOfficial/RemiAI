"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AuthAccount = { id: number; email: string; displayName: string };
type AuthState = { loading: boolean; configured: boolean; account: AuthAccount | null; refresh: () => Promise<void>; logout: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [account, setAccount] = useState<AuthAccount | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" });
      const data = await response.json();
      setConfigured(data.configured === true);
      setAccount(data.account ?? null);
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const value = useMemo<AuthState>(() => ({
    loading, configured, account, refresh,
    logout: async () => { await fetch("/api/auth/logout", { method: "POST" }); setAccount(null); },
  }), [loading, configured, account]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
