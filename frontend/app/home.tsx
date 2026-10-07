/**
 * home.tsx — Dashboard
 * Greets the user by name and shows their connections and top matches.
 * Provides Logout and Edit Profile actions.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { getItem, removeItem, SESSION_KEY } from "../utils/storage";
import {
  ConnectionRequest,
  Match,
  getConnectRequests,
  relationWith,
  getMyProfile,
  getTopMatches,
  normalizeMatches,
  respondToConnectRequest,
} from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import Avatar from "../components/Avatar";
import { markHasProfile } from "../components/LeaveSurveyButton";

// Shown on a match card when you already have something going with them.
const RELATION_BADGES: Record<string, { label: string; color: string } | undefined> = {
  connected: { label: "✓ Connected", color: "#27AE60" },
  sent: { label: "Request sent", color: "#F39C12" },
  received: { label: "Wants to connect with you", color: "#2F80ED" },
};

export default function Dashboard() {
  const { matches: matchesParam, userName: paramName } =
    useLocalSearchParams<{ matches?: string; userName?: string }>();
  const { signOut } = useAuth();

  const [displayName, setDisplayName] = useState<string>(
    paramName && paramName.trim() ? paramName.trim() : ""
  );
  const [pendingRequests, setPendingRequests] = useState<ConnectionRequest[]>([]);
  const [connections, setConnections] = useState<ConnectionRequest[]>([]);
  const [allRequests, setAllRequests] = useState<ConnectionRequest[]>([]);

  const [matches, setMatches] = useState<Match[]>(() => {
    try {
      return matchesParam ? normalizeMatches(JSON.parse(matchesParam)) : [];
    } catch {
      return [];
    }
  });
  const [loadingMatches, setLoadingMatches] = useState(matches.length === 0);
  const [matchesError, setMatchesError] = useState("");

  // Matches are only passed in right after the survey. On login or app
  // reopen, rebuild them from the user's saved profile. A quiet reload keeps
  // the current list on screen and ignores errors.
  const loadMatches = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoadingMatches(true);
      setMatchesError("");
    }
    try {
      const profile = await getMyProfile();
      if (!profile) {
        setMatches([]);
        return;
      }
      markHasProfile();
      if (profile.name) setDisplayName((prev) => prev || profile.name);
      const result = await getTopMatches(profile, []);
      setMatches(normalizeMatches(result.matches));
    } catch {
      if (!quiet) setMatchesError("We couldn't load your matches right now.");
    } finally {
      if (!quiet) setLoadingMatches(false);
    }
  }, []);

  // First visit: load matches unless the survey just handed them over. Coming
  // back later: refresh quietly, so someone you just blocked drops out.
  const visited = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (visited.current) {
        loadMatches(true);
      } else if (matches.length === 0) {
        loadMatches();
      }
      visited.current = true;
      // matches is only read on the first visit.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadMatches])
  );

  // Load name from persistent storage if not passed via params
  useEffect(() => {
    if (!displayName) {
      getItem(SESSION_KEY).then((raw) => {
        if (raw) {
          try {
            const session = JSON.parse(raw);
            if (session?.name) setDisplayName(session.name);
          } catch {}
        }
      });
    }
  }, []);

  const me = paramName?.trim() || displayName;

  // Accepted requests (either direction) become connections; pending ones
  // sent to this user still need an answer.
  const loadRequests = useCallback(async () => {
    if (!me) return;
    try {
      const requests = await getConnectRequests(me, "all");
      setAllRequests(requests);
      setConnections(requests.filter((r) => r.status === "accepted"));
      setPendingRequests(
        requests.filter((r) => r.to_user_name === me && r.status === "pending")
      );
    } catch {}
  }, [me]);

  // Reload whenever the dashboard comes back into view, so a request accepted
  // elsewhere shows up here as a connection.
  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests])
  );

  const respondToRequest = async (id: number, status: "accepted" | "rejected") => {
    try {
      await respondToConnectRequest(id, status);
      await loadRequests();
    } catch {}
  };

  const openChat = (c: ConnectionRequest) => {
    const other = c.from_user_name === me ? c.to_user_name : c.from_user_name;
    router.push({
      pathname: "/profile/Chat",
      params: { connectionId: String(c.id), otherUserName: other, userName: me },
    });
  };

  const name = displayName || "Friend";

  const handleLogout = async () => {
    let confirmed = false;
    if (Platform.OS === "web") {
      confirmed = (window as any).confirm("Are you sure you want to log out?");
    } else {
      confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert("Log Out", "Are you sure you want to log out?", [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Log Out", style: "destructive", onPress: () => resolve(true) },
        ]);
      });
    }
    if (confirmed) {
      await removeItem(SESSION_KEY);
      await signOut();
      router.replace("/welcome");
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#27AE60";
    if (score >= 60) return "#F39C12";
    return "#E74C3C";
  };

  const cap = (str: string) =>
    str ? str.charAt(0).toUpperCase() + str.slice(1) : "";

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.scroll}>

      {/* ── Hero / greeting ── */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.appName}>SANDRAPP</Text>
          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push("/editProfile")}
            >
              <Text style={styles.iconBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, styles.iconBtnRed]} onPress={handleLogout}>
              <Text style={[styles.iconBtnText, styles.iconBtnRedText]}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.greeting}>Hello, {name}!</Text>
        <Text style={styles.heroSub}>
          {loadingMatches
            ? "Finding your matches…"
            : matches.length === 1
              ? "Your top match is ready"
              : matches.length > 1
                ? `Your top ${matches.length} matches are ready`
                : "Complete your profile to find matches near you"}
        </Text>
      </View>

      {/* ── Pending connection requests ── */}
      {pendingRequests.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pending Requests</Text>
          {pendingRequests.map((req) => (
            <View key={req.id} style={styles.requestCard}>
              <View style={styles.requestIdentity}>
                <Avatar name={req.from_user_name} photoUrl={req.from_user_photo} size={40} />
                <Text style={styles.requestFrom}>{req.from_user_name}</Text>
              </View>
              <Text style={styles.requestDetail}>
                {req.proposed_day} · {req.proposed_time}
              </Text>
              {!!req.message && (
                <Text style={styles.requestMessage}>"{req.message}"</Text>
              )}
              <View style={styles.requestActions}>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => respondToRequest(req.id, "accepted")}
                >
                  <Text style={styles.acceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineBtn}
                  onPress={() => respondToRequest(req.id, "rejected")}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <View style={styles.sectionGap} />
        </>
      )}

      {/* ── Connections ── */}
      {connections.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Your Connections</Text>
          {connections.map((c) => {
            const iSent = c.from_user_name === me;
            const other = iSent ? c.to_user_name : c.from_user_name;
            return (
              <TouchableOpacity
                key={c.id}
                activeOpacity={0.85}
                style={styles.connectionCard}
                onPress={() => openChat(c)}
              >
                <View style={styles.avatar}>
                  <Avatar
                    name={other}
                    photoUrl={iSent ? c.to_user_photo : c.from_user_photo}
                  />
                </View>
                <View style={styles.connectionInfo}>
                  <Text style={styles.connectionName}>{other}</Text>
                  <Text style={styles.connectionDetail}>
                    {c.proposed_day} · {c.proposed_time}
                  </Text>
                </View>
                <View style={styles.chatPill}>
                  <Text style={styles.chatPillText}>Chat</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={styles.sectionGap} />
        </>
      )}

      {loadingMatches ? (
        <View style={styles.emptyCard}>
          <ActivityIndicator size="large" color="#2F80ED" />
          <Text style={[styles.emptyText, styles.loadingText]}>
            Loading your matches…
          </Text>
        </View>
      ) : matchesError ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{matchesError}</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => loadMatches()}>
            <Text style={styles.createBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : matches.length === 0 ? (
        /* ── Empty state ── */
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No matches yet. Finish your profile and we'll find people near
            you who share your interests, values, and culture.
          </Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push("/survey")}
          >
            <Text style={styles.createBtnText}>Create Profile</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* ── Match cards ── */}
          <Text style={styles.sectionTitle}>Your Top Matches</Text>

          {matches.map((m, i) => {
            const relation = relationWith(allRequests, me, m.name);
            const badge = RELATION_BADGES[relation.status];
            return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.85}
              style={styles.matchCard}
              onPress={() =>
                router.push({
                  pathname: "/profile/MatchProfile",
                  params: {
                    match: JSON.stringify(m),
                    matchIndex: String(i),
                    matches: JSON.stringify(matches),
                    userName: me,
                  },
                })
              }
            >
              <View style={styles.matchHeader}>
                <View style={styles.matchIdentity}>
                  <Avatar name={m.name} photoUrl={m.photoUrl} size={48} />
                  <Text style={styles.matchName}>{m.name}</Text>
                </View>
                <View
                  style={[
                    styles.scoreBadge,
                    { backgroundColor: getScoreColor(m.score) },
                  ]}
                >
                  <Text style={styles.scoreText}>{m.score}%</Text>
                </View>
              </View>

              {badge && (
                <View style={[styles.relationBadge, { backgroundColor: badge.color }]}>
                  <Text style={styles.relationText}>{badge.label}</Text>
                </View>
              )}

              <Text style={styles.matchDetail}>Age: {m.age}</Text>
              <Text style={styles.matchDetail}>
                {m.location ? cap(m.location) : ""}
              </Text>

              {m.userType && (
                <Text style={styles.matchType}>
                  {m.userType === "senior" ? "Older Adult" : "Young Companion"}
                </Text>
              )}

              <View style={styles.scoreBar}>
                <View
                  style={[
                    styles.scoreBarFill,
                    {
                      width: `${m.score}%` as any,
                      backgroundColor: getScoreColor(m.score),
                    },
                  ]}
                />
              </View>
            </TouchableOpacity>
            );
          })}
        </>
      )}

      {/* ── Footer actions ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.requestsBtn}
          onPress={() =>
            router.push({
              pathname: "/profile/Requests",
              params: { userName: displayName },
            })
          }
        >
          <Text style={styles.requestsText}>My Requests</Text>
        </TouchableOpacity>

        {/* Edit and Log Out live in the header card at the top. */}
        <TouchableOpacity
          style={styles.newProfileBtn}
          onPress={() => router.push("/survey")}
        >
          <Text style={styles.newProfileText}>Retake Survey</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#EAF3FF" },
  scroll: { padding: 20, paddingBottom: 48 },

  /* Hero */
  hero: {
    backgroundColor: "#2F80ED",
    borderRadius: 20,
    padding: 22,
    marginBottom: 24,
    shadowColor: "#2F80ED",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  appName: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 2,
  },
  heroActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  iconBtnText: { fontSize: 13, color: "#fff", fontWeight: "600" },
  iconBtnRed: { backgroundColor: "rgba(255,80,80,0.25)" },
  iconBtnRedText: { color: "#FFD0D0" },
  greeting: { fontSize: 28, fontWeight: "800", color: "#fff", marginBottom: 4 },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 20 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 12,
  },

  /* Connections */
  connectionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#27AE60",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: { marginRight: 14 },
  connectionInfo: { flex: 1 },
  connectionName: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  connectionDetail: { fontSize: 14, color: "#555", marginTop: 2 },
  chatPill: {
    backgroundColor: "#2F80ED",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginLeft: 10,
  },
  chatPillText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  sectionGap: { height: 12 },

  /* Match card */
  matchCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
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
  matchIdentity: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  matchName: { fontSize: 22, fontWeight: "700", color: "#1A1A2E", flexShrink: 1 },
  scoreBadge: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12 },
  scoreText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  matchDetail: { fontSize: 15, color: "#444", marginBottom: 4 },
  matchType: { fontSize: 13, color: "#2F80ED", marginBottom: 10, fontWeight: "600" },
  relationBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  relationText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  scoreBar: {
    height: 8,
    backgroundColor: "#DDE3ED",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 8,
  },
  scoreBarFill: { height: "100%", borderRadius: 999 },

  /* Empty */
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    marginBottom: 20,
  },
  emptyText: { fontSize: 16, color: "#555", textAlign: "center", marginBottom: 18, lineHeight: 24 },
  loadingText: { marginTop: 12, marginBottom: 0 },
  createBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  createBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },

  /* Pending requests */
  requestCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#F39C12",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  requestIdentity: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  requestFrom: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  requestDetail: { fontSize: 14, color: "#555", marginBottom: 4 },
  requestMessage: { fontSize: 14, color: "#777", fontStyle: "italic", marginBottom: 10 },
  requestActions: { flexDirection: "row", gap: 10 },
  acceptBtn: {
    flex: 1,
    backgroundColor: "#27AE60",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  acceptText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  declineBtn: {
    flex: 1,
    backgroundColor: "#FFF0F0",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFAAAA",
  },
  declineText: { color: "#E74C3C", fontWeight: "600", fontSize: 15 },

  /* Footer actions */
  footer: { marginTop: 24, gap: 10 },
  requestsBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: "#2F80ED",
    alignItems: "center",
  },
  requestsText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  newProfileBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#AAC4F0",
    alignItems: "center",
  },
  newProfileText: { color: "#2F80ED", fontSize: 16, fontWeight: "500" },
});
