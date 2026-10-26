/**
 * home.tsx — Dashboard
 * Greets the user, then shows what needs their attention (requests), their
 * connections, their next meetup and two recommended matches. The other
 * screens are a tap away in the bottom bar.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getItem, SESSION_KEY } from "../utils/storage";
import {
  ConnectionRequest,
  Match,
  describeMeetup,
  getConnectRequests,
  otherPerson,
  matchHighlight,
  relationWith,
  loadMyMatches,
  normalizeMatches,
} from "../utils/api";
import Avatar from "../components/Avatar";
import BottomNav from "../components/BottomNav";
import { markHasProfile } from "../components/LeaveSurveyButton";

// Home keeps to the best two; the Matches tab has the rest.
const HOME_MATCH_COUNT = 2;
const HOME_CONNECTION_COUNT = 3;

// Shown on a match card when you already have something going with them.
const RELATION_BADGES: Record<string, string | undefined> = {
  connected: "Connected",
  sent: "Request sent",
  received: "Wants to connect",
};

export default function Dashboard() {
  const { matches: matchesParam, userName: paramName } =
    useLocalSearchParams<{ matches?: string; userName?: string }>();

  const [displayName, setDisplayName] = useState<string>(
    paramName && paramName.trim() ? paramName.trim() : ""
  );
  const [pendingRequests, setPendingRequests] = useState<ConnectionRequest[]>([]);
  const [connections, setConnections] = useState<ConnectionRequest[]>([]);
  const [allRequests, setAllRequests] = useState<ConnectionRequest[]>([]);
  const [requestsError, setRequestsError] = useState("");

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
      const { profile, matches: found } = await loadMyMatches();
      if (profile) {
        markHasProfile();
        if (profile.name) setDisplayName((prev) => prev || profile.name);
      }
      setMatches(found);
    } catch {
      if (!quiet) setMatchesError("We couldn't load your matches. Check your connection and try again.");
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
      setRequestsError("");
      setAllRequests(requests);
      setConnections(requests.filter((r) => r.status === "accepted"));
      setPendingRequests(
        requests.filter((r) => !(r.sent_by_me ?? r.from_user_name === me) && r.status === "pending")
      );
    } catch {
      setRequestsError("We couldn't load your requests and connections.");
    }
  }, [me]);

  // Reload whenever the dashboard comes back into view, so a request accepted
  // elsewhere shows up here as a connection.
  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests])
  );

  const openChat = (c: ConnectionRequest) => {
    const other = otherPerson(c, me);
    router.push({
      pathname: "/profile/Chat",
      params: {
        connectionId: String(c.id),
        otherUserName: other.name,
        otherUserId: other.id !== undefined ? String(other.id) : "",
        userName: me,
      },
    });
  };

  const openMatch = (m: Match, i: number) =>
    router.push({
      pathname: "/profile/MatchProfile",
      params: {
        match: JSON.stringify(m),
        matchIndex: String(i),
        matches: JSON.stringify(matches),
        userName: me,
      },
    });

  const goToMessages = () => router.replace("/profile/Requests");
  const goToMatches = () => router.replace("/profile/MatchResults");
  const goToProfile = () =>
    router.replace({ pathname: "/profile/ProfileSummary", params: { from: "tab" } });

  // The meetup to show: a confirmed one first, otherwise one still being
  // agreed on.
  const withMeetup = connections.filter((c) => c.meetup);
  const nextMeetup =
    withMeetup.find((c) => c.meetup?.status === "confirmed") ?? withMeetup[0];

  const name = displayName || "Friend";
  const pendingCount = pendingRequests.length;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.bg} contentContainerStyle={styles.scroll}>
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Image
              source={require("../assets/logo-mark.png")}
              style={styles.brandIcon}
              accessibilityIgnoresInvertColors
              accessible={false}
            />
            <Text style={styles.brandName} accessibilityRole="header">
              SANDRAPP
            </Text>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={goToProfile}
            accessibilityRole="button"
            accessibilityLabel="My profile"
          >
            <Ionicons name="person-outline" size={20} color="#2F80ED" />
          </TouchableOpacity>
        </View>

        {/* ── Greeting ── */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>WELCOME BACK</Text>
          <Text style={styles.greeting} accessibilityRole="header">
            Hello, {name}!
          </Text>
          <Text style={styles.heroSub}>
            Your next meaningful connection could be just a hello away.
          </Text>
        </View>

        {requestsError !== "" && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={20} color="#B42318" />
            <Text style={styles.errorBannerText}>{requestsError}</Text>
            <TouchableOpacity
              onPress={loadRequests}
              accessibilityRole="button"
              accessibilityLabel="Try loading requests again"
              hitSlop={10}
            >
              <Text style={styles.errorBannerAction}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Requests waiting for an answer ── */}
        {pendingCount > 0 && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="notifications-outline" size={20} color="#1A1A2E" />
              <Text style={styles.cardTitle}>Needs Your Attention</Text>
            </View>
            <Text style={styles.cardSub}>
              {pendingCount === 1
                ? "1 person wants to connect with you."
                : `${pendingCount} people want to connect with you.`}
            </Text>
            {pendingRequests.slice(0, 2).map((req) => (
              <View key={req.id} style={styles.requestRow}>
                <Text style={styles.requestText} numberOfLines={1}>
                  {req.from_user_name} sent a request
                </Text>
                <TouchableOpacity
                  style={styles.smallBtn}
                  onPress={goToMessages}
                  accessibilityRole="button"
                  accessibilityLabel={`Review request from ${req.from_user_name}`}
                >
                  <Text style={styles.smallBtnText}>Review</Text>
                </TouchableOpacity>
              </View>
            ))}
            {pendingCount > 2 && (
              <TouchableOpacity onPress={goToMessages} accessibilityRole="link">
                <Text style={styles.link}>See all {pendingCount} requests</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Connections ── */}
        {connections.length > 0 && (
          <>
            <SectionHeader title="Your Connections" action="See All" onAction={goToMessages} />
            {connections.slice(0, HOME_CONNECTION_COUNT).map((c) => {
              const other = otherPerson(c, me);
              return (
                <View key={c.id} style={[styles.card, styles.personRow]}>
                  <Avatar name={other.name} photoUrl={other.photo} size={48} />
                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{other.name}</Text>
                    <Text style={styles.personDetail}>Connected</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => openChat(c)}
                    accessibilityRole="button"
                    accessibilityLabel={`Chat with ${other.name}`}
                  >
                    <Text style={styles.smallBtnText}>Chat</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        {/* ── Next meetup ── */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="calendar-outline" size={20} color="#1A1A2E" />
            <Text style={styles.cardTitle}>Upcoming Meetup</Text>
          </View>
          {nextMeetup?.meetup ? (
            <>
              <Text style={styles.meetupWith}>
                With {otherPerson(nextMeetup, me).name}
              </Text>
              <Text style={styles.cardSub}>{describeMeetup(nextMeetup.meetup)}</Text>
              <Text
                style={[
                  styles.meetupStatus,
                  nextMeetup.meetup.status === "confirmed" && styles.meetupConfirmed,
                ]}
              >
                {nextMeetup.meetup.status === "confirmed"
                  ? "✓ Confirmed by both of you"
                  : nextMeetup.meetup.updated_by_me
                    ? `Waiting for ${otherPerson(nextMeetup, me).name} to confirm`
                    : "Waiting for you to confirm"}
              </Text>
              <TouchableOpacity onPress={() => openChat(nextMeetup)} accessibilityRole="link">
                <Text style={styles.link}>Open chat to change or confirm</Text>
              </TouchableOpacity>
            </>
          ) : connections.length > 0 ? (
            <>
              <Text style={styles.cardSub}>No upcoming meetups scheduled.</Text>
              <TouchableOpacity onPress={() => openChat(connections[0])} accessibilityRole="link">
                <Text style={styles.link}>Plan a meetup with a connection</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.cardSub}>
                No upcoming meetups yet. Connect with a match to plan one.
              </Text>
              <TouchableOpacity onPress={goToMatches} accessibilityRole="link">
                <Text style={styles.link}>Browse your matches</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Recommended matches ── */}
        <SectionHeader
          title="Recommended for You"
          action={matches.length > HOME_MATCH_COUNT ? "View All" : undefined}
          onAction={goToMatches}
        />
        {loadingMatches ? (
          <View style={[styles.card, styles.center]}>
            <ActivityIndicator size="large" color="#2F80ED" />
            <Text style={[styles.cardSub, styles.loadingText]}>Finding your matches…</Text>
          </View>
        ) : matchesError ? (
          <View style={[styles.card, styles.center]} accessibilityRole="alert">
            <Text style={styles.emptyText}>{matchesError}</Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => loadMatches()}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : matches.length === 0 ? (
          <View style={[styles.card, styles.center]}>
            <Text style={styles.emptyText}>
              No matches yet. Finish your profile and we'll find people near
              you who share your interests, values, and culture.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/survey")}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Create Profile</Text>
            </TouchableOpacity>
          </View>
        ) : (
          matches.slice(0, HOME_MATCH_COUNT).map((m, i) => {
            const badge = RELATION_BADGES[relationWith(allRequests, m.id).status];
            const highlight = matchHighlight(m);
            return (
              <View key={m.id ?? i} style={styles.card}>
                <View style={styles.personRow}>
                  <Avatar name={m.name} photoUrl={m.photoUrl} size={48} />
                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{m.name}</Text>
                    {!!m.age && <Text style={styles.personDetail}>Age {m.age}</Text>}
                  </View>
                  <View
                    style={styles.scorePill}
                    accessibilityLabel={`${m.score} percent match`}
                  >
                    <Text style={styles.scoreText}>{m.score}% match</Text>
                  </View>
                </View>
                {!!badge && <Text style={styles.relation}>{badge}</Text>}
                {!!highlight && <Text style={styles.highlight}>{highlight}</Text>}
                <TouchableOpacity
                  style={styles.outlineBtn}
                  onPress={() => openMatch(m, i)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${m.name}'s profile`}
                >
                  <Text style={styles.outlineBtnText}>View Profile</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
      <BottomNav active="home" />
    </View>
  );
}

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {!!action && (
        <TouchableOpacity
          onPress={onAction}
          hitSlop={12}
          accessibilityRole="link"
          accessibilityLabel={`${action}: ${title}`}
        >
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EAF3FF",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  bg: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 24 },

  /* Top bar */
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 40, height: 40 },
  brandName: { fontSize: 20, fontWeight: "800", color: "#1A1A2E", letterSpacing: 1 },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Greeting */
  hero: {
    backgroundColor: "#2F80ED",
    borderRadius: 18,
    padding: 20,
    marginBottom: 14,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 1,
    marginBottom: 6,
  },
  greeting: { fontSize: 28, fontWeight: "800", color: "#fff", marginBottom: 6 },
  heroSub: { fontSize: 16, color: "#fff", lineHeight: 22 },

  /* Error banner */
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3F2",
    borderColor: "#FDA29B",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorBannerText: { flex: 1, fontSize: 15, color: "#B42318" },
  errorBannerAction: { fontSize: 15, fontWeight: "700", color: "#B42318" },

  /* Cards */
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
  center: { alignItems: "center" },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  cardSub: { fontSize: 15, color: "#4B5563", lineHeight: 21 },
  link: { fontSize: 15, fontWeight: "700", color: "#2F80ED", marginTop: 10 },

  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 10,
  },
  requestText: { flex: 1, fontSize: 16, fontWeight: "600", color: "#1A1A2E" },

  smallBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 12,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: "center",
  },
  smallBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  /* Section headers */
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 19, fontWeight: "700", color: "#1A1A2E" },
  sectionAction: { fontSize: 15, fontWeight: "700", color: "#2F80ED" },

  /* People (connections and matches) */
  personRow: { flexDirection: "row", alignItems: "center" },
  personInfo: { flex: 1, marginLeft: 12 },
  personName: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  personDetail: { fontSize: 14, color: "#4B5563", marginTop: 2 },

  /* Meetup */
  meetupWith: { fontSize: 16, fontWeight: "700", color: "#1A1A2E", marginBottom: 2 },
  meetupStatus: { fontSize: 14, color: "#B54708", marginTop: 6, fontWeight: "600" },
  meetupConfirmed: { color: "#067647" },

  /* Match cards */
  scorePill: {
    backgroundColor: "#EAF3FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  scoreText: { color: "#1D5FBF", fontSize: 13, fontWeight: "700" },
  relation: { fontSize: 14, color: "#067647", fontWeight: "700", marginTop: 10 },
  highlight: { fontSize: 15, color: "#374151", marginTop: 10, lineHeight: 21 },
  outlineBtn: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: "#2F80ED",
    borderRadius: 12,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtnText: { color: "#2F80ED", fontSize: 16, fontWeight: "700" },

  /* Empty / loading / error */
  emptyText: { fontSize: 16, color: "#4B5563", textAlign: "center", marginBottom: 16, lineHeight: 24 },
  loadingText: { marginTop: 12 },
  primaryBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 28,
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
