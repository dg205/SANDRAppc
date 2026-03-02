import React from "react";
import { View, Text, StyleSheet, ScrollView, Image } from "react-native";
import { useLocalSearchParams } from "expo-router";

export default function Home() {
  const { matches: matchesParam } = useLocalSearchParams<{ matches?: string }>();

  let matches: any[] = [];
  try {
    matches = matchesParam ? JSON.parse(matchesParam) : [];
  } catch {
    matches = [];
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.container}>
        <Image source={require("../assets/logo.png")} style={styles.logo} />
        <Text style={styles.heading}>Your Matches</Text>
        <Text style={styles.subtitle}>
          {matches.length > 0
            ? `We found ${matches.length} match${matches.length > 1 ? "es" : ""} for you!`
            : "No matches found yet. Check back soon!"}
        </Text>

        {matches.map((match, idx) => {
          const candidate = match.candidate ?? {};
          const score = match.score ?? 0;
          const features = match.features ?? {};

          return (
            <View key={idx} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.name}>{candidate.name ?? `Match ${idx + 1}`}</Text>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreText}>{Math.round(score * 100)}%</Text>
                </View>
              </View>

              {candidate.age && (
                <Text style={styles.detail}>Age: {candidate.age}</Text>
              )}
              {candidate.location && (
                <Text style={styles.detail}>Location: {candidate.location}</Text>
              )}

              {Object.keys(features).length > 0 && (
                <View style={styles.featuresBox}>
                  <Text style={styles.featuresTitle}>Match Breakdown</Text>
                  {Object.entries(features).map(([key, val]) => (
                    <View key={key} style={styles.featureRow}>
                      <Text style={styles.featureLabel}>{formatLabel(key)}</Text>
                      <Text style={styles.featureValue}>
                        {typeof val === "number" ? `${Math.round(val * 100)}%` : String(val)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {matches.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Complete your profile and we'll find people near you who share your interests,
              values, and culture.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  container: {
    flex: 1,
    backgroundColor: "#E4F0FF",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: "center",
  },
  logo: { width: 80, height: 80, marginBottom: 15, resizeMode: "contain" },
  heading: { fontSize: 26, fontWeight: "700", color: "#222", marginBottom: 6 },
  subtitle: { fontSize: 16, color: "#555", marginBottom: 20, textAlign: "center" },
  card: {
    backgroundColor: "#fff",
    width: "100%",
    padding: 20,
    borderRadius: 15,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  name: { fontSize: 20, fontWeight: "600", color: "#222" },
  scoreBadge: {
    backgroundColor: "#8AB4FF",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  scoreText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  detail: { fontSize: 15, color: "#555", marginBottom: 4 },
  featuresBox: {
    marginTop: 12,
    backgroundColor: "#F2F6FF",
    padding: 14,
    borderRadius: 10,
  },
  featuresTitle: { fontSize: 15, fontWeight: "600", marginBottom: 8, color: "#333" },
  featureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  featureLabel: { fontSize: 14, color: "#555" },
  featureValue: { fontSize: 14, fontWeight: "600", color: "#333" },
  emptyCard: {
    backgroundColor: "#fff",
    width: "100%",
    padding: 30,
    borderRadius: 15,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  emptyText: { fontSize: 16, color: "#555", textAlign: "center", lineHeight: 24 },
});
