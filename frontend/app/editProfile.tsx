/**
 * editProfile.tsx — Edit Profile Screen
 * Loads the current user's saved session, lets them update key fields,
 * then saves back to local storage and syncs with the backend.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { getItem, saveItem, SESSION_KEY } from "../utils/storage";
import { BASE_URL } from "../utils/api";

// ── Selectable options ────────────────────────────────────────────────────────
const INTEREST_OPTIONS = [
  "reading", "music", "gardening", "cooking", "walking", "movies",
  "travel", "art", "crafts", "fishing", "chess", "dancing", "yoga",
  "hiking", "sports", "volunteering", "technology", "history",
];

const HELP_OPTIONS_SENIOR = [
  "rides", "groceries", "errands", "technology help", "yard work",
  "cooking", "home repairs", "companionship", "medical appointments",
];

const HELP_OPTIONS_COMPANION = [
  "rides", "groceries", "errands", "yard work", "technology help",
  "cooking", "companionship", "tutoring", "home repairs",
];

const TALK_OPTIONS = [
  "in-person", "phone", "video call", "text messages",
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function EditProfile() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [email, setEmail]       = useState("");
  const [userType, setUserType] = useState<"senior" | "companion" | "">("");

  // Editable fields
  const [name, setName]         = useState("");
  const [location, setLocation] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [helpWith, setHelpWith] = useState<string[]>([]);
  const [talkPrefs, setTalkPrefs] = useState<string[]>([]);

  // Load session on mount
  useEffect(() => {
    getItem(SESSION_KEY).then((raw) => {
      if (raw) {
        try {
          const s = JSON.parse(raw);
          setEmail(s.email ?? "");
          setUserType(s.userType ?? "");
          setName(s.name ?? "");
          setLocation(s.location ?? "");
          setInterests(s.interests ?? []);
          setHelpWith(s.helpWith ?? []);
          setTalkPrefs(s.talkPreferences ?? []);
        } catch {}
      }
      setLoading(false);
    });
  }, []);

  // Toggle a value in a string array
  const toggle = (
    arr: string[],
    setArr: React.Dispatch<React.SetStateAction<string[]>>,
    val: string
  ) => {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }
    setSaving(true);
    try {
      // Build updated profile snapshot
      const updated = {
        email,
        userType,
        name: name.trim(),
        location: location.trim().toLowerCase(),
        interests,
        helpWith,
        talkPreferences: talkPrefs,
      };

      // Merge into the full stored session
      const raw = await getItem(SESSION_KEY);
      const existing = raw ? JSON.parse(raw) : {};
      const merged = { ...existing, ...updated };
      await saveItem(SESSION_KEY, JSON.stringify(merged));

      // Sync to backend if email is available
      if (email) {
        try {
          await fetch(`${BASE_URL}/api/users/${encodeURIComponent(email)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(merged),
          });
        } catch {
          // Backend sync failed — local save is still good
        }
      }

      Alert.alert("Saved!", "Your profile has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2F80ED" />
      </View>
    );
  }

  const helpOptions =
    userType === "senior" ? HELP_OPTIONS_SENIOR : HELP_OPTIONS_COMPANION;
  const helpLabel =
    userType === "senior" ? "What I need help with" : "How I can help";

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.scroll}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Name */}
      <View style={styles.section}>
        <Text style={styles.label}>Your Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Dorothy"
          placeholderTextColor="#AAA"
        />
      </View>

      {/* Location */}
      <View style={styles.section}>
        <Text style={styles.label}>City</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Atlanta"
          placeholderTextColor="#AAA"
          autoCapitalize="words"
        />
        <Text style={styles.hint}>Enter your city name (e.g. Atlanta, Marietta)</Text>
      </View>

      {/* Interests */}
      <View style={styles.section}>
        <Text style={styles.label}>Interests & Hobbies</Text>
        <View style={styles.chips}>
          {INTEREST_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, interests.includes(opt) && styles.chipActive]}
              onPress={() => toggle(interests, setInterests, opt)}
            >
              <Text
                style={[
                  styles.chipText,
                  interests.includes(opt) && styles.chipTextActive,
                ]}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Help with / can help */}
      <View style={styles.section}>
        <Text style={styles.label}>{helpLabel}</Text>
        <View style={styles.chips}>
          {helpOptions.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, helpWith.includes(opt) && styles.chipActive]}
              onPress={() => toggle(helpWith, setHelpWith, opt)}
            >
              <Text
                style={[
                  styles.chipText,
                  helpWith.includes(opt) && styles.chipTextActive,
                ]}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Talk preferences */}
      <View style={styles.section}>
        <Text style={styles.label}>How I like to connect</Text>
        <View style={styles.chips}>
          {TALK_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, talkPrefs.includes(opt) && styles.chipActive]}
              onPress={() => toggle(talkPrefs, setTalkPrefs, opt)}
            >
              <Text
                style={[
                  styles.chipText,
                  talkPrefs.includes(opt) && styles.chipTextActive,
                ]}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Save button */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Save Changes</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#EAF3FF" },
  scroll: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  backBtn: { fontSize: 16, color: "#2F80ED", fontWeight: "600" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#1A1A2E" },

  section: { marginBottom: 22 },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D8F0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1A1A2E",
  },
  hint: { fontSize: 12, color: "#888", marginTop: 4, marginLeft: 4 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#B0C8F0",
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: "#2F80ED",
    borderColor: "#2F80ED",
  },
  chipText: { fontSize: 14, color: "#2F80ED" },
  chipTextActive: { color: "#fff", fontWeight: "600" },

  saveBtn: {
    marginTop: 8,
    backgroundColor: "#2F80ED",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#2F80ED",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
