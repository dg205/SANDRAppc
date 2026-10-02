// utils/auth.ts
// Thin client for Supabase Auth (GoTrue) over plain fetch, matching this
// project's existing style (see utils/api.ts) rather than pulling in
// @supabase/supabase-js. Tokens are stored via expo-secure-store (OS-level
// encryption) - separate from utils/storage.ts, which only holds a
// non-secret display-profile cache.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

const SESSION_KEY = "sandrapp_auth_session";

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  user_id: string;
  email: string;
};

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(key, value);
    } catch {}
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      localStorage.removeItem(key);
    } catch {}
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function toSession(tokenResponse: any): AuthSession {
  return {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at:
      Math.floor(Date.now() / 1000) + (tokenResponse.expires_in ?? 3600),
    user_id: tokenResponse.user?.id ?? "",
    email: tokenResponse.user?.email ?? "",
  };
}

function gotrueErrorMessage(text: string): string {
  try {
    const parsed = JSON.parse(text);
    // GoTrue application errors use error_description/msg/error; the Kong
    // gateway in front of it (e.g. a missing/bad apikey) uses message/hint.
    return (
      parsed.error_description ?? parsed.msg ?? parsed.error ?? parsed.message ?? text
    );
  } catch {
    return text;
  }
}

async function gotrueFetch(
  path: string,
  body: Record<string, any>,
): Promise<AuthSession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(gotrueErrorMessage(text));
  }
  const session = toSession(JSON.parse(text));
  await secureSet(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function signUp(
  email: string,
  password: string,
): Promise<AuthSession> {
  return gotrueFetch("/signup", { email, password });
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthSession> {
  return gotrueFetch("/token?grant_type=password", { email, password });
}

export async function signOut(): Promise<void> {
  const raw = await secureGet(SESSION_KEY);
  await secureDelete(SESSION_KEY);
  if (!raw) return;
  try {
    const session: AuthSession = JSON.parse(raw);
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch {
    // best-effort - the local session is already cleared either way
  }
}

async function refresh(session: AuthSession): Promise<AuthSession | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      },
    );
    if (!res.ok) {
      await secureDelete(SESSION_KEY);
      return null;
    }
    const next = toSession(await res.json());
    await secureSet(SESSION_KEY, JSON.stringify(next));
    return next;
  } catch {
    // network error: leave the stored (stale) session alone so a later
    // retry can still try to refresh it, rather than silently signing out
    return null;
  }
}

/** Restore the saved session at app startup, refreshing it first if stale. */
export async function restoreSession(): Promise<AuthSession | null> {
  const raw = await secureGet(SESSION_KEY);
  if (!raw) return null;
  let session: AuthSession;
  try {
    session = JSON.parse(raw);
  } catch {
    await secureDelete(SESSION_KEY);
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at - now > 60) return session;
  return refresh(session);
}

let refreshInFlight: Promise<AuthSession | null> | null = null;

/**
 * Returns a valid access token for an authenticated request, refreshing it
 * first if it's within 60s of expiring. Concurrent callers share one
 * in-flight refresh instead of each triggering their own. Returns null if
 * there's no session or the refresh failed - callers should treat that as
 * signed out.
 */
export async function ensureFreshToken(): Promise<string | null> {
  const raw = await secureGet(SESSION_KEY);
  if (!raw) return null;
  let session: AuthSession;
  try {
    session = JSON.parse(raw);
  } catch {
    await secureDelete(SESSION_KEY);
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at - now > 60) return session.access_token;

  if (!refreshInFlight) {
    refreshInFlight = refresh(session).finally(() => {
      refreshInFlight = null;
    });
  }
  const refreshed = await refreshInFlight;
  return refreshed?.access_token ?? null;
}
