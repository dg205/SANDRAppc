import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";

type RawMatch = {
  name?: string;
  age?: number;
  location?: string;
  score?: number;
  userType?: string;
  candidate?: {
    name?: string;
    age?: number;
    location?: string;
    userType?: string;
  };
  features?: {
    shared_interests?: string[];
    shared_values?: string[];
    shared_languages?: string[];
    [key: string]: any;
  };
  [key: string]: any;
};

type Match = {
  name: string;
  age: number;
  location: string;
  score: number;
  userType?: string;
  candidate?: RawMatch["candidate"];
  features?: RawMatch["features"];
  [key: string]: any;
};

export default function MatchResults() {
  const { matches: matchesParam, userName } = useLocalSearchParams<{
    matches: string;
    userName?: string;
  }>();

  const allMatches: Match[] = useMemo(() => {
    const parsed: RawMatch[] = matchesParam ? JSON.parse(matchesParam) : [];

    return parsed.map((m) => ({
      ...m,
      name: m.name ?? m.candidate?.name ?? "Unknown",
      age: m.age ?? m.candidate?.age ?? 0,
      location: m.location ?? m.candidate?.location ?? "",
      score: m.score ?? 0,
      userType: m.userType ?? m.candidate?.userType ?? "",
    }));
  }, [matchesParam]);

  const topMatches = allMatches.slice(0, 3);
  const otherMatches = allMatches.slice(3);

  const [showOthers, setShowOthers] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#27AE60";
    if (score >= 65) return "#F39C12";
    return "#E74C3C";
  };

  const cap = (s: string) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

  const openMatchProfile = (match: Match, index: number) => {
    router.push({
      pathname: "/profile/MatchProfile",
      params: {
        match: JSON.stringify(match),
        matchIndex: String(index),
        matches: matchesParam ?? "[]",
        userName: userName ?? "",
      },
    });
  };

  const FullCard = ({ match, index }: { match: Match; index: number }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => openMatchProfile(match, index)}
      style={styles.matchCard}
    >
      <View style={styles.matchHeader}>
        <Text style={styles.matchName}>{match.name}</Text>
        <View
          style={[
            styles.scoreBadge,
            { backgroundColor: getScoreColor(match.score) },
          ]}
        >
          <Text style={styles.scoreText}>{match.score}%</Text>
        </View>
      </View>

      <Text style={styles.matchDetail}>Age: {match.age}</Text>
      <Text style={styles.matchDetail}>{cap(match.location)}</Text>

      {match.userType && (
        <Text style={styles.matchType}>
          {match.userType === "senior" ? "Senior" : "Young Companion"}
        </Text>
      )}

      <View style={styles.scoreBar}>
        <View
          style={[
            styles.scoreBarFill,
            {
              width: `${match.score}%` as any,
              backgroundColor: getScoreColor(match.score),
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );

  const MiniCard = ({
    match,
    index,
  }: {
    match: Match;
    index: number;
  }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => openMatchProfile(match, index)}
      style={styles.miniCard}
    >
      <View style={styles.miniRow}>
        <View style={styles.miniLeft}>
          <Text style={styles.miniName}>{match.name}</Text>
          <Text style={styles.miniDetail}>
            Age {match.age} · {cap(match.location)}
          </Text>

          {match.userType && (
            <Text style={styles.miniType}>
              {match.userType === "senior" ? "Senior" : "Young Companion"}
            </Text>
          )}
        </View>

        <View
          style={[
            styles.miniScore,
            { backgroundColor: getScoreColor(match.score) },
          ]}
        >
          <Text style={styles.miniScoreText}>{match.score}%</Text>
        </View>
      </View>

      <View style={styles.scoreBar}>
        <View
          style={[
            styles.scoreBarFill,
            {
              width: `${match.score}%` as any,
              backgroundColor: getScoreColor(match.score),
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.appName}>Sandrapp</Text>
        <Text style={styles.title}>Your Matches</Text>
        <Text style={styles.subtitle}>
          These are your top community connections
        </Text>

        {allMatches.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No matches found yet. Make sure the backend is running and your
              profile is complete.
            </Text>
          </View>
        ) : (
          <>
            {topMatches.map((match, i) => (
              <FullCard key={`top-${i}`} match={match} index={i} />
            ))}

            {otherMatches.length > 0 && (
              <View style={styles.othersSection}>
                <TouchableOpacity
                  style={styles.othersToggle}
                  onPress={() => setShowOthers((v) => !v)}
                >
                  <Text style={styles.othersToggleText}>
                    {showOthers
                      ? "Hide Other Candidates"
                      : `View ${otherMatches.length} Other Candidate${
                          otherMatches.length > 1 ? "s" : ""
                        }`}
                  </Text>
                  <Text style={styles.chevron}>{showOthers ? "▲" : "▼"}</Text>
                </TouchableOpacity>

                {showOthers && (
                  <View style={styles.miniList}>
                    <Text style={styles.miniListLabel}>
                      Other potential candidates — lower compatibility scores
                    </Text>
                    {otherMatches.map((match, i) => (
                      <MiniCard
                        key={`other-${i}`}
                        match={match}
                        index={i + 3}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() =>
            router.push({
              pathname: "/home",
              params: {
                matches: matchesParam ?? "[]",
                userName: userName ?? "",
              },
            })
          }
        >
          <Text style={styles.homeBtnText}>Go to Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EAF3FF" },
  scroll: { padding: 20, alignItems: "center" },

  appName: {
    alignSelf: "flex-start",
    fontSize: 20,
    fontWeight: "700",
    color: "#2F80ED",
    marginBottom: 6,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 6,
    textAlign: "center",
  },

  subtitle: {
    fontSize: 15,
    color: "#555",
    marginBottom: 24,
    textAlign: "center",
  },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    alignItems: "center",
  },

  emptyText: {
    color: "#555",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },

  matchCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },

  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  matchName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A2E",
  },

  scoreBadge: {
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },

  scoreText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  matchDetail: {
    fontSize: 15,
    color: "#444",
    marginBottom: 4,
  },

  matchType: {
    fontSize: 14,
    color: "#2F80ED",
    marginBottom: 12,
    fontWeight: "600",
  },

  scoreBar: {
    height: 8,
    backgroundColor: "#DDE3ED",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 8,
  },

  scoreBarFill: {
    height: "100%",
    borderRadius: 999,
  },

  othersSection: {
    width: "100%",
    marginBottom: 16,
  },

  othersToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#EEF4FF",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: "#B0C8F0",
  },

  othersToggleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2F80ED",
  },

  chevron: {
    fontSize: 13,
    color: "#2F80ED",
  },

  miniList: {
    marginTop: 10,
  },

  miniListLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 10,
    textAlign: "center",
    fontStyle: "italic",
  },

  miniCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    width: "100%",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  miniRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  miniLeft: {
    flex: 1,
    marginRight: 12,
  },

  miniName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 2,
  },

  miniDetail: {
    fontSize: 13,
    color: "#666",
    marginBottom: 2,
  },

  miniType: {
    fontSize: 12,
    color: "#2F80ED",
    fontWeight: "600",
  },

  miniScore: {
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
    minWidth: 52,
    alignItems: "center",
  },

  miniScoreText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  homeBtn: {
    marginTop: 8,
    backgroundColor: "#2F80ED",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
    width: "100%",
    alignItems: "center",
  },

  homeBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
