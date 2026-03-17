import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";

type Match = {
  name: string;
  age: number;
  location: string;
  score: number;
  userType?: string;
};

export default function MatchResults() {
  const { matches: matchesParam } = useLocalSearchParams<{ matches: string }>();

  const matches: Match[] = matchesParam ? JSON.parse(matchesParam) : [];

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#27AE60";
    if (score >= 60) return "#F39C12";
    return "#E74C3C";
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.appName}>Sandrapp</Text>
        <Text style={styles.title}>Your Matches 🎉</Text>
        <Text style={styles.subtitle}>
          These are your top intergenerational connections
        </Text>

        {matches.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No matches found yet. Make sure the backend is running and your profile is complete.
            </Text>
          </View>
        ) : (
          matches.map((match, index) => (
            <View key={index} style={styles.matchCard}>
              <View style={styles.matchHeader}>
                <Text style={styles.matchName}>{match.name}</Text>
                <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(match.score) }]}>
                  <Text style={styles.scoreText}>{match.score}%</Text>
                </View>
              </View>
              <Text style={styles.matchDetail}>🎂 Age: {match.age}</Text>
              <Text style={styles.matchDetail}>📍 {match.location}</Text>
              {match.userType && (
                <Text style={styles.matchType}>
                  {match.userType === "senior" ? "🧓 Senior" : "🙋 Young Companion"}
                </Text>
              )}
              <View style={styles.scoreBar}>
                <View
                  style={[
                    styles.scoreBarFill,
                    { width: `${match.score}%` as any, backgroundColor: getScoreColor(match.score) },
                  ]}
                />
              </View>
            </View>
          ))
        )}

        <TouchableOpacity style={styles.homeBtn} onPress={() => router.push("/home")}>
          <Text style={styles.homeBtnText}>Go to Home →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EAF3FF" },
  scroll: { padding: 20, alignItems: "center" },
  appName: { alignSelf: "flex-start", fontSize: 20, fontWeight: "700", color: "#2F80ED", marginBottom: 6 },
  title: { fontSize: 28, fontWeight: "700", color: "#1A1A2E", marginBottom: 6, textAlign: "center" },
  subtitle: { fontSize: 15, color: "#555", marginBottom: 24, textAlign: "center" },
  emptyCard: { backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "100%", alignItems: "center" },
  emptyText: { color: "#555", textAlign: "center", fontSize: 15, lineHeight: 22 },
  matchCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", marginBottom: 16, shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  matchHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  matchName: { fontSize: 22, fontWeight: "700", color: "#1A1A2E" },
  scoreBadge: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12 },
  scoreText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  matchDetail: { fontSize: 15, color: "#444", marginBottom: 4 },
  matchType: { fontSize: 14, color: "#2F80ED", marginBottom: 12, fontWeight: "600" },
  scoreBar: { height: 8, backgroundColor: "#DDE3ED", borderRadius: 999, overflow: "hidden", marginTop: 8 },
  scoreBarFill: { height: "100%", borderRadius: 999 },
  homeBtn: { marginTop: 8, backgroundColor: "#2F80ED", borderRadius: 12, paddingVertical: 16, paddingHorizontal: 40, width: "100%", alignItems: "center" },
  homeBtnText: { color: "#fff", fontSize: 18, fontWeight: "600" },
});
