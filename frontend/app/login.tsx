// app/login.tsx
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
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../utils/AuthContext";

export default function Login() {
  const { signIn } = useAuth();
  const { expired } = useLocalSearchParams<{ expired?: string }>();
  const sessionExpired = expired === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    email.trim().length > 3 && password.length > 0 && !submitting;

  const handleLogin = async () => {
    setSubmitting(true);
    setError("");
    try {
      await signIn(email.trim(), password);
      router.replace("/home");
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
        {/* After an expiry the screen behind this one needs a login, so
            Back goes to the welcome screen instead. */}
        <TouchableOpacity
          onPress={() =>
            sessionExpired ? router.replace("/welcome") : router.back()
          }
          style={styles.backBtn}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.title}>Log in</Text>
          <Text style={styles.subtitle}>
            {sessionExpired
              ? "Your session expired. Please log in again."
              : "Welcome back."}
          </Text>

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
            placeholder="Your password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error !== "" && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
            onPress={handleLogin}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Log In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace("/signup")}
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>
              Don&apos;t have an account? Sign up
            </Text>
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
});
