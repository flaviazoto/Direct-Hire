"use client";
// src/context/AuthContext.tsx
// localStorage-first auth. Reads dh_token on mount, hits /api/user/profile to
// confirm validity, and handles silent token refresh when the access token expires.

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const API = "/api";

export interface AuthUser {
  id:            string;
  email:         string;
  firstName?:    string;
  lastName?:     string;
  role:          string;
  accountStatus?: string;
}

interface AuthState {
  isLoggedIn: boolean;
  user:       AuthUser | null;
  role:       string | null;
  firstName:  string | null;
  loading:    boolean;
}

interface AuthContextType {
  auth:              AuthState;
  loading:           boolean;
  refresh:           () => Promise<void>;
  logout:            () => Promise<void>;
  hydrateFromLogin:  (user: { id: string; email: string; role: string }) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("dh_token") : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState>({
    isLoggedIn: false,
    user:       null,
    role:       null,
    firstName:  null,
    loading:    true,
  });

  const setLoggedOut = useCallback(() => {
    localStorage.removeItem("dh_token");
    localStorage.removeItem("dh_role");
    setAuth({ isLoggedIn: false, user: null, role: null, firstName: null, loading: false });
  }, []);

  const applyProfile = useCallback((data: Record<string, unknown>) => {
    const u = (data.profile ?? data.user ?? data) as Record<string, unknown>;
    const userBase = (data.user ?? {}) as Record<string, unknown>;
    const user: AuthUser = {
      id:            (userBase.id   ?? u.id   ?? "") as string,
      email:         (userBase.email ?? u.email ?? "") as string,
      firstName:     (u.firstName   ?? userBase.firstName  ?? "") as string,
      lastName:      (u.lastName    ?? userBase.lastName   ?? "") as string,
      role:          (userBase.role  ?? u.role  ?? localStorage.getItem("dh_role") ?? "") as string,
      accountStatus: (userBase.accountStatus ?? u.accountStatus ?? "") as string,
    };
    setAuth({ isLoggedIn: true, user, role: user.role, firstName: user.firstName ?? null, loading: false });
  }, []);

  // Hydrates auth state directly from a login response's `user` object —
  // no network call, so there's no path from here to setLoggedOut(). Used
  // right after a successful login instead of refresh(), which does its own
  // /user/profile + /auth/refresh round-trip and can wipe a token that was
  // literally just issued if that round-trip hits a transient failure.
  const hydrateFromLogin = useCallback((user: { id: string; email: string; role: string }) => {
    setAuth({
      isLoggedIn: true,
      user:       { id: user.id, email: user.email, role: user.role },
      role:       user.role,
      firstName:  null,
      loading:    false,
    });
  }, []);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) { setLoggedOut(); return; }

    try {
      const res = await fetch(`${API}/user/profile`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        credentials: "include",
      });

      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        applyProfile(data.data ? (data.data as Record<string, unknown>) : data);
        return;
      }

      if (res.status === 401) {
        // Try silent cookie-based refresh
        let rr: Response;
        try {
          rr = await fetch(`${API}/auth/refresh`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          // Network-level failure reaching /auth/refresh — not a definitive
          // auth rejection, so don't wipe the token. Let subsequent calls
          // retry naturally through api-client.ts's own 401 handling.
          setAuth((s) => ({ ...s, loading: false }));
          return;
        }

        if (rr.ok) {
          const rd = (await rr.json()) as Record<string, unknown>;
          const d  = (rd.data ?? rd) as Record<string, unknown>;
          const newToken = (d.accessToken ?? d.token) as string | undefined;
          if (newToken) {
            localStorage.setItem("dh_token", newToken);
            if (d.role) localStorage.setItem("dh_role", d.role as string);
          }

          const retry = await fetch(`${API}/user/profile`, {
            headers: {
              Authorization: `Bearer ${newToken ?? token}`,
              "Content-Type": "application/json",
            },
            credentials: "include",
          });

          if (retry.ok) {
            const data = (await retry.json()) as Record<string, unknown>;
            applyProfile(data.data ? (data.data as Record<string, unknown>) : data);
            return;
          }

          // Refresh nominally succeeded but the confirmation retry didn't —
          // not a definitive rejection either; don't wipe, just stop loading.
          setAuth((s) => ({ ...s, loading: false }));
          return;
        }

        if (rr.status === 401 || rr.status === 403) {
          // Definitive rejection: access token invalid AND the refresh token
          // is also invalid/expired/forbidden. Safe to log out.
          setLoggedOut();
          return;
        }

        // /auth/refresh hit a transient error (5xx etc.) — not definitive.
        setAuth((s) => ({ ...s, loading: false }));
        return;
      }

      // Any other error — don't log out, just mark loading done
      setAuth((s) => ({ ...s, loading: false }));
    } catch {
      setAuth((s) => ({ ...s, loading: false }));
    }
  }, [applyProfile, setLoggedOut]);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    const token = getToken();
    try {
      await fetch(`${API}/auth/logout`, {
        method:      "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch { /* ignore — clear locally regardless */ }
    setLoggedOut();
    router.push("/login");
  }, [router, setLoggedOut]);

  return (
    <AuthContext.Provider value={{ auth, loading: auth.loading, refresh, logout, hydrateFromLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
