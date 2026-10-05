import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { router } from "expo-router";
import * as auth from "./auth";
import { removeItem, SESSION_KEY } from "./storage";

type AuthContextType = {
  session: auth.AuthSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<auth.AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // An expired session found during startup just leaves the user signed
    // out (index.tsx routes them to /welcome); one that expires while they're
    // using the app sends them straight to log in again.
    let restored = false;
    auth.setSessionExpiredHandler(() => {
      setSession(null);
      removeItem(SESSION_KEY);
      if (restored) {
        router.replace({ pathname: "/login", params: { expired: "1" } });
      }
    });

    auth.restoreSession().then((s) => {
      restored = true;
      setSession(s);
      setLoading(false);
    });

    return () => auth.setSessionExpiredHandler(null);
  }, []);

  const signIn = async (email: string, password: string) => {
    setSession(await auth.signIn(email, password));
  };

  const signUp = async (email: string, password: string) => {
    setSession(await auth.signUp(email, password));
  };

  const signOut = async () => {
    await auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
