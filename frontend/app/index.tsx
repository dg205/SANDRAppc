import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../utils/AuthContext";
import { useProfile } from "../utils/ProfileContext";
import { authFetch } from "../utils/api";
import { saveItem, SESSION_KEY } from "../utils/storage";

export default function Index() {
  const { session, loading: authLoading } = useAuth();
  const { updateProfile } = useProfile();
  const [checking, setChecking] = useState(true);
  // Optimistic default: only a confirmed 404 flips this to false. A network
  // error or unexpected status sends a signed-in user to /home instead of
  // forcing them to redo onboarding - home.tsx already has an empty state
  // for "no profile yet" that routes to /survey just as well.
  const [hasProfile, setHasProfile] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setChecking(false);
      return;
    }
    authFetch("/api/users/me")
      .then(async (res) => {
        if (res.status === 404) {
          setHasProfile(false);
          return;
        }
        if (res.ok) {
          const profile = await res.json();
          updateProfile(profile);
          await saveItem(
            SESSION_KEY,
            JSON.stringify({
              name: profile.name,
              location: profile.location,
              email: profile.email,
              userType: profile.userType,
            }),
          );
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
    // updateProfile is intentionally omitted: it's a new function identity
    // on every ProfileProvider render, and this check should only re-run
    // when the auth state itself changes, not on unrelated profile writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);

  if (authLoading || checking) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#EAF3FF",
        }}
      >
        <ActivityIndicator size="large" color="#2F80ED" />
      </View>
    );
  }

  if (!session) return <Redirect href="/welcome" />;
  if (!hasProfile) return <Redirect href="/survey" />;
  return <Redirect href="/home" />;
}
