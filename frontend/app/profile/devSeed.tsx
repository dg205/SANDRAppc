// Test-only screen for exercising the real signup -> survey -> match ->
// connect -> chat pipeline without typing credentials or using the mic.
// Gated by TEST_MODE_ENABLED; unreachable in a production build regardless
// of whether someone finds the URL.
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { router, Redirect } from "expo-router";
import { useAuth } from "../../utils/AuthContext";
import { useProfile, type ProfileData } from "../../utils/ProfileContext";
import { TEST_MODE_ENABLED } from "../../utils/testMode";

const TEST_PASSWORD = "TestPass123!";

type Persona = {
  label: string;
  email: string;
  profile: Partial<ProfileData>;
};

const PERSONAS: Persona[] = [
  {
    label: "Test Senior A",
    email: "test-senior-a@sandrapp-test.local",
    profile: {
      userType: "senior",
      name: "Test Senior A",
      age: 70,
      location: "atlanta",
      faith: "christian",
      interests: ["music", "gardening"],
      languages: ["english"],
      culturalBackground: "american",
      values: ["family", "kindness"],
      favoriteFood: ["american"],
      helpWith: ["rides", "technology help"],
      talkPreferences: ["phone", "in-person"],
      connectionGoals: ["companionship"],
      familySituation: "widowed",
      availableDays: ["monday", "wednesday"],
      bio: "Dev tools test account - senior persona. I enjoy music and gardening.",
      hobbiesText: "Walks, coffee, and volunteering with someone else.",
      meetingText: "companionship",
      commPreferenceText: "Phone calls or meeting in person.",
      availabilityText: "Weekday mornings and afternoons.",
      gettingHelpText: "rides and technology help",
    },
  },
  {
    label: "Test Companion B",
    email: "test-companion-b@sandrapp-test.local",
    profile: {
      userType: "companion",
      name: "Test Companion B",
      age: 27,
      location: "atlanta",
      faith: "christian",
      interests: ["music", "volunteering"],
      languages: ["english"],
      culturalBackground: "american",
      values: ["kindness", "community"],
      favoriteFood: ["american"],
      helpWith: ["rides", "technology help"],
      talkPreferences: ["phone", "in-person"],
      connectionGoals: ["companionship"],
      familySituation: "single",
      availableDays: ["saturday", "sunday"],
      bio: "Dev tools test account - companion persona. I enjoy music and volunteering.",
      hobbiesText: "Walks, coffee, and volunteering with someone else.",
      meetingText: "companionship",
      commPreferenceText: "Phone calls or meeting in person.",
      availabilityText: "Weekend mornings and afternoons.",
      gettingHelpText: "rides and technology help",
    },
  },
];

export default function DevSeed() {
  const { signIn, signUp } = useAuth();
  const { updateProfile } = useProfile();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!TEST_MODE_ENABLED) return <Redirect href="/welcome" />;

  const handlePersona = async (persona: Persona) => {
    setBusy(persona.label);
    setError("");
    try {
      try {
        await signIn(persona.email, TEST_PASSWORD);
      } catch {
        // Account doesn't exist yet on this backend - create it.
        await signUp(persona.email, TEST_PASSWORD);
      }
      updateProfile({ ...persona.profile, email: persona.email });
      router.replace("/profile/finish");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <TouchableOpacity hitSlop={12} onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.title}>Dev Tools</Text>
          <Text style={styles.subtitle}>
            Signs in (or creates, on first use) a fixed test account, fills a
            sample survey, and submits it through the real pipeline - the same
            way a real signup would.
          </Text>

          {error !== "" && <Text style={styles.errorText}>{error}</Text>}

          {PERSONAS.map((persona) => (
            <TouchableOpacity
              key={persona.label}
              style={[
                styles.personaBtn,
                busy !== null && styles.personaBtnDisabled,
              ]}
              onPress={() => handlePersona(persona)}
              disabled={busy !== null}
            >
              {busy === persona.label ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.personaBtnText}>{persona.label}</Text>
              )}
            </TouchableOpacity>
          ))}

          <Text style={styles.hint}>
            Both personas are real accounts on the live backend - log out of one
            and run the other to exercise connect requests and chat between
            them.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF3FF",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0,
  },
  inner: { padding: 20, flex: 1 },

  backBtn: { marginBottom: 16 },
  backText: { fontSize: 16, color: "#2F80ED", fontWeight: "600" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#1A1A2E", marginBottom: 6 },
  subtitle: { fontSize: 15, color: "#555", marginBottom: 20, lineHeight: 22 },

  errorText: {
    fontSize: 14,
    color: "#E74C3C",
    textAlign: "center",
    marginBottom: 12,
  },

  personaBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  personaBtnDisabled: { backgroundColor: "#9CA3AF" },
  personaBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },

  hint: { fontSize: 13, color: "#888", marginTop: 8, lineHeight: 18 },
});
