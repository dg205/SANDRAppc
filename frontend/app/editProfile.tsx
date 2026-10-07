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
import { getItem, removeItem, saveItem, SESSION_KEY } from "../utils/storage";
import {
  authFetch,
  deleteAccount,
  deleteProfilePhoto,
  getBlockedUsers,
  getMyProfile,
  unblockUser,
  uploadProfilePhoto,
} from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { confirmAction } from "../utils/confirm";
import { hasNativeModule } from "../utils/nativeModules";
import Avatar from "../components/Avatar";

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
  const { signOut } = useAuth();
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

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [blocked, setBlocked] = useState<{ id: number; name: string }[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Load the saved profile from the server, falling back to the local cache
  // (which only holds a few fields) if that fails.
  useEffect(() => {
    const fill = (s: Record<string, any>) => {
      setEmail(s.email ?? "");
      setUserType(s.userType ?? "");
      setName(s.name ?? "");
      setLocation(s.location ?? "");
      setInterests(s.interests ?? []);
      setHelpWith(s.helpWith ?? []);
      setTalkPrefs(s.talkPreferences ?? []);
      setPhotoUrl(s.photoUrl ?? null);
    };

    (async () => {
      try {
        const profile = await getMyProfile();
        if (profile) {
          fill(profile);
          return;
        }
      } catch {}
      const raw = await getItem(SESSION_KEY);
      try {
        if (raw) fill(JSON.parse(raw));
      } catch {}
    })().finally(() => setLoading(false));

    getBlockedUsers().then(setBlocked).catch(() => {});
  }, []);

  const pickPhoto = async () => {
    setPhotoError("");
    // Loaded on tap, not at the top of the file: an app build from before
    // the photo picker was added has no native picker, and importing it
    // up front would crash this whole screen instead of just this button.
    let ImagePicker: typeof import("expo-image-picker");
    try {
      if (!hasNativeModule("ExponentImagePicker")) throw new Error("missing");
      ImagePicker = await import("expo-image-picker");
    } catch {
      setPhotoError("Adding a photo needs the latest version of the app.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    setPhotoBusy(true);
    try {
      setPhotoUrl(await uploadProfilePhoto(result.assets[0]));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoError("");
    setPhotoBusy(true);
    try {
      await deleteProfilePhoto();
      setPhotoUrl(null);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const unblock = async (personId: number) => {
    try {
      await unblockUser(personId);
      setBlocked((prev) => prev.filter((b) => b.id !== personId));
    } catch {}
  };

  const handleDeleteAccount = async () => {
    const confirmed = await confirmAction(
      "Delete your account?",
      "This permanently deletes your profile, photo, connections, chats and survey answers. It can't be undone.",
      "Delete Forever"
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccount();
      await removeItem(SESSION_KEY);
      await signOut();
      router.replace("/welcome");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  // Toggle a value in a string array
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

      // Sync to backend (identity comes from the signed-in session, not email)
      try {
        await authFetch("/api/users/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(merged),
        });
      } catch {
        // Backend sync failed — local save is still good
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
        <TouchableOpacity hitSlop={12} onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Photo */}
      <View style={styles.photoSection}>
        <Avatar name={name} photoUrl={photoUrl} size={96} />
        <View style={styles.photoActions}>
          <TouchableOpacity
            style={[styles.photoBtn, photoBusy && styles.saveBtnDisabled]}
            onPress={pickPhoto}
            disabled={photoBusy}
          >
            {photoBusy ? (
              <ActivityIndicator color="#2F80ED" />
            ) : (
              <Text style={styles.photoBtnText}>
                {photoUrl ? "Change Photo" : "Add a Photo"}
              </Text>
            )}
          </TouchableOpacity>
          {!!photoUrl && !photoBusy && (
            <TouchableOpacity hitSlop={12} onPress={removePhoto}>
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {photoError !== "" && <Text style={styles.errorText}>{photoError}</Text>}

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
        <ChipPicker
          options={INTEREST_OPTIONS}
          selected={interests}
          onChange={setInterests}
          placeholder="e.g. birdwatching"
        />
      </View>

      {/* Help with / can help */}
      <View style={styles.section}>
        <Text style={styles.label}>{helpLabel}</Text>
        <ChipPicker
          options={helpOptions}
          selected={helpWith}
          onChange={setHelpWith}
          placeholder="e.g. reading mail"
        />
      </View>

      {/* Talk preferences */}
      <View style={styles.section}>
        <Text style={styles.label}>How I like to connect</Text>
        <ChipPicker
          options={TALK_OPTIONS}
          selected={talkPrefs}
          onChange={setTalkPrefs}
          placeholder="e.g. letters"
        />
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

      {/* Blocked people */}
      {blocked.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.label}>Blocked people</Text>
          {blocked.map((person) => (
            <View key={person.id} style={styles.blockedRow}>
              <Text style={styles.blockedName}>{person.name}</Text>
              <TouchableOpacity hitSlop={12} onPress={() => unblock(person.id)}>
                <Text style={styles.unblockText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Delete account */}
      <View style={[styles.card, styles.dangerCard]}>
        <Text style={styles.label}>Delete account</Text>
        <Text style={styles.dangerHint}>
          Permanently delete your account and everything in it. This can&apos;t
          be undone.
        </Text>
        {deleteError !== "" && <Text style={styles.errorText}>{deleteError}</Text>}
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.saveBtnDisabled]}
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color="#E74C3C" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete My Account</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const MAX_OTHER_LENGTH = 40;

// Tap-to-toggle chips plus an "Other" chip for typing your own answer.
// Saved answers that aren't in `options` (typed in earlier, or from the
// survey) show as extra selected chips, so they can be seen and removed.
function ChipPicker({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const extras = selected.filter((s) => !options.includes(s));
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val]);

  const addOther = () => {
    // Stored lowercase like the preset options, so matching treats them alike.
    const val = draft.trim().toLowerCase();
    if (val && !selected.includes(val)) onChange([...selected, val]);
    setDraft("");
    setAdding(false);
  };

  return (
    <>
      <View style={styles.chips}>
        {[...options, ...extras].map((opt) => {
          const on = selected.includes(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, on && styles.chipActive]}
              onPress={() => toggle(opt)}
            >
              <Text style={[styles.chipText, on && styles.chipTextActive]}>
                {opt}
                {on && extras.includes(opt) ? "  ✕" : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
        {!adding && (
          <TouchableOpacity
            style={[styles.chip, styles.otherChip]}
            onPress={() => setAdding(true)}
          >
            <Text style={styles.chipText}>+ Other</Text>
          </TouchableOpacity>
        )}
      </View>

      {adding && (
        <View style={styles.otherRow}>
          <TextInput
            style={[styles.input, styles.otherInput]}
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor="#AAA"
            maxLength={MAX_OTHER_LENGTH}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={addOther}
          />
          <TouchableOpacity
            style={[styles.otherAddBtn, !draft.trim() && styles.saveBtnDisabled]}
            onPress={addOther}
            disabled={!draft.trim()}
          >
            <Text style={styles.otherAddText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setDraft("");
              setAdding(false);
            }}
          >
            <Text style={styles.otherCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
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
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: "#2F80ED",
    borderColor: "#2F80ED",
  },
  chipText: { fontSize: 14, color: "#2F80ED" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  otherChip: { borderStyle: "dashed" },
  otherRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  otherInput: { flex: 1, paddingVertical: 10 },
  otherAddBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  otherAddText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  otherCancelText: { color: "#888", fontSize: 15, fontWeight: "600" },

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

  photoSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginBottom: 22,
  },
  photoActions: { flex: 1, gap: 10 },
  photoBtn: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#2F80ED",
    backgroundColor: "#fff",
    paddingVertical: 12,
    alignItems: "center",
  },
  photoBtnText: { color: "#2F80ED", fontSize: 16, fontWeight: "700" },
  removePhotoText: { color: "#E74C3C", fontSize: 14, fontWeight: "600", textAlign: "center" },
  errorText: { fontSize: 14, color: "#E74C3C", textAlign: "center", marginBottom: 12 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginTop: 24,
  },
  blockedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF1F6",
  },
  blockedName: { fontSize: 16, color: "#1A1A2E" },
  unblockText: { fontSize: 15, color: "#2F80ED", fontWeight: "600" },

  dangerCard: { borderWidth: 1, borderColor: "#FFAAAA" },
  dangerHint: { fontSize: 14, color: "#666", lineHeight: 20, marginBottom: 14 },
  deleteBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#E74C3C",
  },
  deleteBtnText: { color: "#E74C3C", fontSize: 16, fontWeight: "700" },
});
