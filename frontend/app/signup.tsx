import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../utils/AuthContext";
import { useProfile } from "../utils/ProfileContext";
import { TEST_MODE_ENABLED } from "../utils/testMode";

export default function Signup() {
  const { signUp } = useAuth();
  const { updateProfile } = useProfile();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    email.trim().length > 3 &&
    password.length >= 6 &&
    password === confirmPassword &&
    !submitting;

  const fillTestValues = () => {
    setEmail(`test+${Date.now()}@sandrapp-test.local`);
    setPassword("TestPass123!");
    setConfirmPassword("TestPass123!");
  };

  const handleSignUp = async () => {
    setSubmitting(true);
    setError("");
    try {
      await signUp(email.trim(), password);
      updateProfile({ email: email.trim() });
      router.replace("/survey");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Coming back from the survey (or from Log in) replaces the
            screen, so there may be nothing to go back to. */}
        <TouchableOpacity
          hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>
            You&apos;ll use this email and password to log back in.
          </Text>

          {TEST_MODE_ENABLED && (
            <TouchableOpacity
              onPress={fillTestValues}
              style={styles.testFillBtn}
            >
              <Text style={styles.testFillText}>Fill test values</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 6 characters"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter your password"
            placeholderTextColor="#999"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          {error !== "" && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
            onPress={handleSignUp}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign Up</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace("/login")}
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>Already have an account? Log in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF3FF",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0,
  },
  scroll: { padding: 20, paddingBottom: 48 },

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
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  input: {
    backgroundColor: "#F5F9FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D8F0",
    padding: 14,
    fontSize: 16,
    color: "#1A1A2E",
    marginBottom: 20,
  },

  errorText: {
    fontSize: 14,
    color: "#E74C3C",
    textAlign: "center",
    marginBottom: 12,
  },

  primaryBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnDisabled: { backgroundColor: "#9CA3AF" },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },

  linkBtn: { marginTop: 16, alignItems: "center" },
  linkText: { color: "#2F80ED", fontSize: 14, fontWeight: "600" },

  testFillBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF5E0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 16,
  },
  testFillText: { color: "#A8710A", fontSize: 13, fontWeight: "600" },
});
