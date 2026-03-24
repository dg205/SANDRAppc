import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { addUser, BASE_URL } from "../../utils/api";
import { useProfile } from "../../utils/ProfileContext";
import { saveItem, SESSION_KEY } from "../../utils/storage";

export default function Finish() {
  const [loading, setLoading] = useState(false);
  const { profile, resetProfile } = useProfile();

  const handleGoHome = async () => {
    try {
      setLoading(true);

      // 1. Save this user to the backend DB
      await addUser({ ...profile });

      // 2. Get ML matches — backend filters to opposite userType automatically
      const res = await fetch(`${BASE_URL}/api/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentUser: profile }),
      });
      if (!res.ok) throw new Error(`Match request failed (${res.status})`);
      const result = await res.json();

      // Flatten nested candidate data so MatchResults can access .name/.age/.location directly
      const flattened = (result.matches ?? []).map((m: any) => ({
        name:     m.candidate?.name     ?? "Unknown",
        age:      m.candidate?.age      ?? 0,
        location: m.candidate?.location ?? "",
        userType: m.candidate?.userType ?? "",
        score:    m.score               ?? 0,
      }));

      // Persist session so dashboard + edit profile can read it later
      const userName = profile.name ?? "";
      await saveItem(SESSION_KEY, JSON.stringify({ ...profile, name: userName }));
      resetProfile();

      // Pass matches + user's name to MatchResults screen
      router.push({
        pathname: "/profile/MatchResults",
        params: { matches: JSON.stringify(flattened), userName },
      });
    } catch (err: any) {
      Alert.alert(
        "Matchmaking failed",
        err?.message ?? "Could not reach the backend. Is Flask running?"
      );
      router.push("/home");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/logo.png")} style={styles.logo} />

      <View style={styles.card}>
        <Text style={styles.title}>You're all set!</Text>
        <Text style={styles.caption}>Your profile has been created.</Text>

        <TouchableOpacity
          style={[styles.nextBtn, loading && styles.nextBtnDisabled]}
          onPress={handleGoHome}
          disabled={loading}
        >
          {loading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.nextText}>Finding matches…</Text>
            </View>
          ) : (
            <Text style={styles.nextText}>Go to Home →</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E4F0FF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  logo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
    marginBottom: 30,
  },

  card: {
    backgroundColor: "#fff",
    width: "100%",
    padding: 25,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
    color: "#222",
  },

  caption: {
    fontSize: 16,
    color: "#555",
    marginBottom: 25,
    textAlign: "center",
  },

  nextBtn: {
    backgroundColor: "#8AB4FF",
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 10,
  },

  nextBtnDisabled: {
    opacity: 0.75,
  },

  nextText: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
  },
});
