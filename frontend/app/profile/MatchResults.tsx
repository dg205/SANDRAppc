import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ConnectionRequest,
  Match,
  getConnectRequests,
  loadMyMatches,
  matchReason,
  relationWith,
} from "../../utils/api";
import Avatar from "../../components/Avatar";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";

type Filter = "all" | "top" | "nearby";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "top", label: "Top Rated" },
  { key: "nearby", label: "Nearby" },
];

// "Top Rated" keeps matches at or above this score.
const TOP_RATED_SCORE = 70;

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

const words = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

// The Matches tab: everyone the matcher suggests, best first, with search
// and quick filters.
export default function MatchResults() {
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setError("");
    try {
      const { profile, matches } = await loadMyMatches();
      setAllMatches(matches);
      if (profile?.name) {
        setUserName(profile.name);
        // Only used to show where you stand with each match; the list still
        // works if this fails.
        getConnectRequests(profile.name, "all").then(setRequests, () => {});
      }
    } catch {
      setError("We couldn't load your matches. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload on return, so someone just blocked drops out and a request just
  // sent shows as sent.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allMatches.filter((m) => {
      if (filter === "top" && m.score < TOP_RATED_SCORE) return false;
      if (filter === "nearby" && !m.features?.same_city) return false;
      if (!q) return true;
      const haystack = [
        m.name,
        m.location,
        ...words(m.features?.shared_interests),
        ...words(m.candidate?.interests),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allMatches, filter, query]);

  const openProfile = (m: Match) =>
    router.push({
      pathname: "/profile/MatchProfile",
      params: {
        match: JSON.stringify(m),
        matchIndex: String(allMatches.indexOf(m)),
        matches: JSON.stringify(allMatches),
        userName,
      },
    });

  const connect = (m: Match) =>
    router.push({
      pathname: "/profile/ConnectRequest",
      params: { matchName: m.name, matchId: m.id !== undefined ? String(m.id) : "", fromUserName: userName },
    });

  const openChat = (m: Match, r: ConnectionRequest) =>
    router.push({
      pathname: "/profile/Chat",
      params: {
        connectionId: String(r.id),
        otherUserName: m.name,
        otherUserId: m.id !== undefined ? String(m.id) : "",
        userName,
      },
    });

  // The dark button changes with where you stand with this person.
  const primaryAction = (m: Match) => {
    const relation = relationWith(requests, m.id);
    switch (relation.status) {
      case "connected":
        return { label: "Chat", onPress: () => openChat(m, relation.request), disabled: false };
      case "sent":
        return { label: "Request Sent", onPress: () => {}, disabled: true };
      case "received":
        return {
          label: "Respond",
          onPress: () => router.replace("/profile/Requests"),
          disabled: false,
        };
      default:
        return { label: "Connect", onPress: () => connect(m), disabled: false };
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <AppHeader />

        <Text style={styles.title} accessibilityRole="header">
          Your Matches
        </Text>
        <Text style={styles.subtitle}>Discover people who share your interests.</Text>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search matches..."
            placeholderTextColor="#6B7280"
            accessibilityLabel="Search matches by name, city or interest"
            returnKeyType="search"
          />
          {query !== "" && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.chips} accessibilityRole="radiogroup">
          {FILTERS.map((f) => {
            const selected = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => setFilter(f.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2F80ED" style={styles.spinner} />
        ) : error ? (
          <View style={styles.emptyCard} accessibilityRole="alert">
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity
              style={styles.darkBtn}
              onPress={() => {
                setLoading(true);
                load();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.darkBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : allMatches.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No matches yet. Finish your profile and we&apos;ll find people who
              share your interests and values.
            </Text>
            <TouchableOpacity
              style={styles.darkBtn}
              onPress={() => router.push("/survey")}
              accessibilityRole="button"
            >
              <Text style={styles.darkBtnText}>Take the Survey</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle} accessibilityRole="header">
                Recommended for You
              </Text>
              <Text style={styles.count}>{shown.length} shown</Text>
            </View>

            {shown.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {query.trim()
                    ? `No matches for "${query.trim()}".`
                    : filter === "nearby"
                      ? "No matches in your city yet."
                      : "No matches above 70% yet."}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.link}>Show all matches</Text>
                </TouchableOpacity>
              </View>
            )}

            {shown.map((m) => {
              const tags = words(m.features?.shared_interests).slice(0, 3);
              const reason = matchReason(m);
              const action = primaryAction(m);
              return (
                <View key={m.id ?? m.name} style={styles.card}>
                  <View style={styles.row}>
                    <Avatar name={m.name} photoUrl={m.photoUrl} size={48} />
                    <View style={styles.info}>
                      <Text style={styles.name}>{m.name}</Text>
                      <Text style={styles.detail}>
                        {[m.age ? `Age ${m.age}` : "", cap(m.location)].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <View style={styles.scorePill} accessibilityLabel={`${m.score} percent match`}>
                      <Text style={styles.scoreText}>{m.score}%</Text>
                    </View>
                  </View>

                  {tags.length > 0 && (
                    <View style={styles.tags}>
                      {tags.map((t) => (
                        <View key={t} style={styles.tag}>
                          <Text style={styles.tagText}>{cap(t)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {!!reason && <Text style={styles.reason}>{reason}</Text>}

                  <View style={styles.buttons}>
                    <TouchableOpacity
                      style={styles.outlineBtn}
                      onPress={() => openProfile(m)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${m.name}'s profile`}
                    >
                      <Text style={styles.outlineBtnText}>View Profile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.darkBtn, styles.flexBtn, action.disabled && styles.btnDisabled]}
                      onPress={action.onPress}
                      disabled={action.disabled}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: action.disabled }}
                      accessibilityLabel={`${action.label}, ${m.name}`}
                    >
                      <Text style={styles.darkBtnText}>{action.label}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      <BottomNav active="matches" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF3FF",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 24 },
  spinner: { marginTop: 40 },

  title: { fontSize: 28, fontWeight: "800", color: "#1A1A2E" },
  subtitle: { fontSize: 15, color: "#4B5563", marginTop: 2, marginBottom: 14 },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#DDE3ED",
  },
  searchInput: { flex: 1, fontSize: 16, color: "#1A1A2E", paddingVertical: 10 },

  chips: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#C9D3E3",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    minHeight: 38,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  chipTextActive: { color: "#fff" },

  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 10,
  },
  listTitle: { fontSize: 19, fontWeight: "700", color: "#1A1A2E" },
  count: { fontSize: 14, color: "#4B5563" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  row: { flexDirection: "row", alignItems: "center" },
  info: { flex: 1, marginLeft: 12 },
  name: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  detail: { fontSize: 14, color: "#4B5563", marginTop: 2 },
  scorePill: {
    backgroundColor: "#EAF3FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  scoreText: { color: "#1D5FBF", fontSize: 13, fontWeight: "700" },

  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  tag: { backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 13, color: "#374151", fontWeight: "500" },
  reason: { fontSize: 15, color: "#374151", marginTop: 10, lineHeight: 21 },

  buttons: { flexDirection: "row", gap: 10, marginTop: 14 },
  outlineBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#C9D3E3",
    borderRadius: 999,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  outlineBtnText: { color: "#1A1A2E", fontSize: 15, fontWeight: "700" },
  darkBtn: {
    backgroundColor: "#111827",
    borderRadius: 999,
    minHeight: 46,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  flexBtn: { flex: 1, paddingHorizontal: 0 },
  btnDisabled: { backgroundColor: "#6B7280" },
  darkBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginTop: 12,
  },
  emptyText: { color: "#4B5563", textAlign: "center", fontSize: 16, lineHeight: 23, marginBottom: 14 },
  link: { fontSize: 15, fontWeight: "700", color: "#2F80ED" },
});
