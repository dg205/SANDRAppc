import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { getTopMatches } from "../../utils/api";
import { useProfile } from "../../utils/ProfileContext";

export default function Finish() {
  const [loading, setLoading] = useState(false);
  const { profile } = useProfile();

  const handleGoHome = async () => {
    try {
      setLoading(true);

      // Build targetUser from collected profile data
      const targetUser = {
        name: "User",
        age: profile.age ?? 65,
        location: profile.location || "atlanta",
        faith: profile.faith || "christian",
        interests: profile.interests.length > 0 ? profile.interests : ["walking", "music"],
        languages: profile.languages.length > 0 ? profile.languages : ["english"],
        culturalBackground: profile.culturalBackground || "american",
        values: profile.values.length > 0 ? profile.values : ["family", "kindness"],
        favoriteFood: profile.favoriteFood.length > 0 ? profile.favoriteFood : ["american"],
        helpWith: profile.helpWith.length > 0 ? profile.helpWith : ["errands"],
        talkPreferences: profile.talkPreferences.length > 0 ? profile.talkPreferences : ["phone"],
        connectionGoals: profile.connectionGoals.length > 0 ? profile.connectionGoals : ["friendship"],
        familySituation: profile.familySituation || "lives alone",
        availableDays: profile.availableDays.length > 0 ? profile.availableDays : ["monday", "wednesday"],
      };

      // Hardcoded candidates (replace with real DB later)
      const candidates = [
        {
          name: "Maria",
          age: 70,
          location: "atlanta",
          faith: "christian",
          interests: ["music", "gardening"],
          languages: ["english"],
          culturalBackground: "mexican",
          values: ["family"],
          favoriteFood: ["mexican"],
          helpWith: ["rides"],
          talkPreferences: ["phone"],
          connectionGoals: ["friendship"],
          familySituation: "widowed",
          availableDays: ["monday"],
        },
        {
          name: "James",
          age: 62,
          location: "marietta",
          faith: "christian",
          interests: ["movies", "walking"],
          languages: ["english"],
          culturalBackground: "american",
          values: ["honesty"],
          favoriteFood: ["bbq"],
          helpWith: ["errands"],
          talkPreferences: ["in-person"],
          connectionGoals: ["friendship"],
          familySituation: "married",
          availableDays: ["wednesday"],
        },
        {
          name: "Rosa",
          age: 73,
          location: "atlanta",
          faith: "catholic",
          interests: ["cooking", "music"],
          languages: ["spanish"],
          culturalBackground: "mexican",
          values: ["family"],
          favoriteFood: ["mexican"],
          helpWith: ["rides"],
          talkPreferences: ["phone"],
          connectionGoals: ["friendship"],
          familySituation: "lives with family",
          availableDays: ["monday", "friday"],
        },
      ];

      const result = await getTopMatches(targetUser, candidates);

      // Pass to home as a param (stringify because params are strings)
      router.push({
        pathname: "/profile/MatchResults",
        params: { matches: JSON.stringify(result.matches ?? []) },
      });
    } catch (err: any) {
      Alert.alert(
        "Matchmaking failed",
        err?.message ?? "Could not reach the backend. Check your IP + Flask server."
      );

      // Still let them go home even if matching fails
      router.push("/home");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/logo.png")} style={styles.logo} />

      <View style={styles.card}>
        <Text style={styles.title}>You're all set! 🎉</Text>
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
