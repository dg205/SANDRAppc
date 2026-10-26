/**
 * ProfileSummary.tsx — a person's own profile, read-only.
 * Shown right after the survey, to play back what was picked up from their
 * spoken answers before they see any matches, and as the Profile tab
 * (?from=tab), where Edit Profile, Retake Survey and Log Out live.
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Avatar from "../../components/Avatar";
import BottomNav from "../../components/BottomNav";
import { getMyProfile } from "../../utils/api";
import { useAuth } from "../../utils/AuthContext";
import { removeItem, SESSION_KEY } from "../../utils/storage";

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];

export default function ProfileSummary() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  // "dashboard" is what older links pass; it's the same screen now.
  const isTab = from === "tab" || from === "dashboard";
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setProfile(await getMyProfile());
    } catch {
      setError("We couldn't load your profile right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload on return, so changes made in Edit Profile show up here.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // After the survey, there's nothing behind this screen.
  const goToMatches = () => router.replace("/home");

  const handleLogout = async () => {
    let confirmed = false;
    if (Platform.OS === "web") {
      confirmed = window.confirm("Are you sure you want to log out?");
    } else {
      confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert("Log Out", "Are you sure you want to log out?", [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Log Out", style: "destructive", onPress: () => resolve(true) },
        ]);
      });
    }
    if (confirmed) {
      await removeItem(SESSION_KEY);
      await signOut();
      router.replace("/welcome");
    }
  };

  // The tab bar sits under every state of the Profile tab.
  const withNav = (content: React.ReactNode) =>
    isTab ? (
      <View style={styles.tabScreen}>
        <View style={styles.flex}>{content}</View>
        <BottomNav active="profile" />
      </View>
    ) : (
      content
    );

  if (loading) {
    return withNav(
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2F80ED" />
      </View>
    );
  }

  if (!profile) {
    return withNav(
      <View style={styles.center}>
        <Text style={styles.emptyText} accessibilityRole={error ? "alert" : undefined}>
          {error || "You haven't made a profile yet. Take the survey to create one."}
        </Text>
        {error ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={load} accessibilityRole="button">
            <Text style={styles.primaryBtnText}>Try Again</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push("/survey")}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Take the Survey</Text>
          </TouchableOpacity>
        )}
        {isTab ? (
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} accessibilityRole="button">
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.secondaryBtn} onPress={goToMatches} accessibilityRole="button">
            <Text style={styles.secondaryBtnText}>Go to Dashboard</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const isSenior = profile.userType === "senior";
  // The first three are what matching leans on most, so say so when one is
  // missing instead of quietly leaving it out.
  const sections = [
    { title: "Interests", tags: list(profile.interests), important: true },
    {
      title: isSenior ? "What I need help with" : "How I can help",
      tags: list(profile.helpWith),
      important: true,
    },
    { title: "How I like to connect", tags: list(profile.talkPreferences), important: true },
    {
      title: "Usually free",
      quote: text(profile.availabilityText),
      tags: list(profile.availableDays),
    },
    { title: "Looking for", tags: list(profile.connectionGoals) },
    { title: "Languages", tags: list(profile.languages) },
    { title: "Values", tags: list(profile.values) },
    { title: "Faith", tags: text(profile.faith) ? [text(profile.faith)] : [] },
  ].filter((s) => s.important || s.quote || s.tags.length > 0);

  return withNav(
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle} accessibilityRole="header">
          Your Profile
        </Text>
        <Text style={styles.pageSub}>
          {isTab
            ? "This is how your profile looks right now."
            : "Here's what we learned about you. Take a look and change anything that isn't right."}
        </Text>

        <View style={styles.card}>
          <View style={styles.identity}>
            <Avatar name={profile.name ?? ""} photoUrl={profile.photoUrl} size={72} />
            <View style={styles.identityText}>
              <Text style={styles.name}>{profile.name}</Text>
              {!!profile.age && <Text style={styles.detail}>Age: {profile.age}</Text>}
              <Text style={styles.detail}>
                {text(profile.location) ? cap(text(profile.location)) : "City not added yet"}
              </Text>
              <Text style={styles.role}>{isSenior ? "Older Adult" : "Young Companion"}</Text>
            </View>
          </View>
          {!!text(profile.bio) && (
            <>
              <Text style={styles.sectionTitle}>About me</Text>
              <Text style={styles.quote}>“{text(profile.bio)}”</Text>
            </>
          )}
        </View>

        <View style={styles.card}>
          {sections.map((section, i) => (
            <View
              key={section.title}
              style={[styles.section, i === sections.length - 1 && styles.lastSection]}
            >
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {!!section.quote && <Text style={styles.quote}>“{section.quote}”</Text>}
              {section.tags.length > 0 ? (
                <View style={styles.tagRow}>
                  {section.tags.map((t) => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{cap(t)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                !section.quote && (
                  <Text style={styles.missing}>
                    Not added yet. Tap Edit Profile to add it.
                  </Text>
                )
              )}
            </View>
          ))}
        </View>

        {isTab ? (
          <>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/editProfile")}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push("/survey")}
              accessibilityRole="button"
              accessibilityHint="Answers the voice survey again and replaces your profile"
            >
              <Text style={styles.secondaryBtnText}>Retake Survey</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} accessibilityRole="button">
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.primaryBtn} onPress={goToMatches} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>Looks Good, See My Matches</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push("/editProfile")}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF3FF",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  tabScreen: { flex: 1, backgroundColor: "#EAF3FF" },
  flex: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 32 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#EAF3FF",
  },
  emptyText: { fontSize: 16, color: "#555", textAlign: "center", marginBottom: 18, lineHeight: 24 },

  pageTitle: { fontSize: 28, fontWeight: "800", color: "#1A1A2E" },
  pageSub: { fontSize: 15, color: "#555", lineHeight: 22, marginTop: 4, marginBottom: 18 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  identity: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  identityText: { flex: 1, marginLeft: 16 },
  name: { fontSize: 24, fontWeight: "800", color: "#1A1A2E" },
  detail: { fontSize: 15, color: "#444", marginTop: 2 },
  role: { fontSize: 13, color: "#2F80ED", fontWeight: "600", marginTop: 4 },

  section: { marginBottom: 18 },
  lastSection: { marginBottom: 0 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 8,
  },
  quote: { fontSize: 16, color: "#1A1A2E", lineHeight: 24, fontStyle: "italic", marginBottom: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    backgroundColor: "#EEF4FF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#B0C8F0",
  },
  tagText: { fontSize: 14, color: "#2F80ED", fontWeight: "500" },
  missing: { fontSize: 14, color: "#888", fontStyle: "italic" },

  primaryBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    alignSelf: "stretch",
    marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    alignSelf: "stretch",
    borderWidth: 2,
    borderColor: "#2F80ED",
    backgroundColor: "#fff",
    marginTop: 10,
  },
  secondaryBtnText: { color: "#2F80ED", fontSize: 16, fontWeight: "700" },
  logoutBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    alignSelf: "stretch",
    borderWidth: 1.5,
    borderColor: "#FDA29B",
    backgroundColor: "#FEF3F2",
    marginTop: 10,
  },
  logoutText: { color: "#B42318", fontSize: 16, fontWeight: "700" },
});
