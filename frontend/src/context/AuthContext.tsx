"use client";
// src/context/AuthContext.tsx
// Cookie-based auth context — no localStorage, no token handling.
// Calls /api/user/profile once on mount via the checkAuth() helper
// (which never triggers the 401 → /login redirect used by other API calls).
// All pages share this single auth check via React context.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { checkAuth, authApi } from "@/lib/api-client";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  isLoggedIn:    true;
  role:          string;
  accountStatus: string | undefined;
  firstName:     string | undefined;
}

export type AuthState =
  | { isLoggedIn: false }
  | AuthUser;

interface AuthContextValue {
  auth:    AuthState;
  loading: boolean;
  /** Re-runs the auth check — call after login or meaningful state change. */
  refresh: () => Promise<void>;
  logout:  () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router  = useRouter();
  const [auth,    setAuth]    = useState<AuthState>({ isLoggedIn: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await checkAuth();
      if (result.isLoggedIn) {
        setAuth({
          isLoggedIn:    true,
          role:          result.role          ?? "",
          accountStatus: result.accountStatus,
          firstName:     result.firstName,
        });
      } else {
        setAuth({ isLoggedIn: false });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setAuth({ isLoggedIn: false });
    router.push("/");
  }, [router]);

  return (
    <AuthContext.Provider value={{ auth, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
