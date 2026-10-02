import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as auth from "./auth";

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
    auth.restoreSession().then((restored) => {
      setSession(restored);
      setLoading(false);
    });
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
