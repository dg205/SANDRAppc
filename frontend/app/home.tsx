/**
 * home.tsx — Dashboard
 * Greets the user by name, shows top matches, and displays a location map.
 * Provides Logout and Edit Profile actions.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import MatchMap from "../components/MatchMap";
import { getItem, removeItem, SESSION_KEY } from "../utils/storage";
import { BASE_URL } from "../utils/api";

type Match = {
  name: string;
  age: number;
  location: string;
  score: number;
  userType?: string;
  [key: string]: any;
};

type PendingRequest = {
  id: number;
  from_user_name: string;
  proposed_day: string;
  proposed_time: string;
  message: string;
  status: string;
};

export default function Dashboard() {
  const { matches: matchesParam, userName: paramName } =
    useLocalSearchParams<{ matches?: string; userName?: string }>();

  const [displayName, setDisplayName] = useState<string>(
    paramName && paramName.trim() ? paramName.trim() : ""
  );
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [userCity, setUserCity] = useState<string>("");

  let matches: Match[] = [];
  try {
    matches = matchesParam ? JSON.parse(matchesParam) : [];
  } catch {
    matches = [];
  }

  // Load name from persistent storage if not passed via params
  useEffect(() => {
    if (!displayName) {
      getItem(SESSION_KEY).then((raw) => {
        if (raw) {
          try {
            const session = JSON.parse(raw);
            if (session?.name) setDisplayName(session.name);
            if (session?.location) setUserCity(session.location);
          } catch {}
        }
      });
    }
  }, []);

  // Fetch pending connection requests for this user
  useEffect(() => {
    const userName = paramName?.trim() || displayName;
    if (!userName) return;
    fetch(`${BASE_URL}/api/connect/${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((data) => {
        const pending = (data.requests ?? []).filter(
          (r: PendingRequest) => r.status === "pending"
        );
        setPendingRequests(pending);
      })
      .catch(() => {});
  }, [displayName]);

  const respondToRequest = async (id: number, status: "accepted" | "rejected") => {
    try {
      await fetch(`${BASE_URL}/api/connect/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {}
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
      router.replace("/language");
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
          {matches.length > 0
            ? "Your top 3 candidates are ready"
            : "Complete your profile to find matches near you"}
        </Text>
      </View>

      {matches.length === 0 ? (
        /* ── Empty state ── */
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No matches yet. Finish your profile and we'll find people near
            you who share your interests, values, and culture.
          </Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push("/language")}
          >
            <Text style={styles.createBtnText}>Create Profile</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* ── Match cards ── */}
          <Text style={styles.sectionTitle}>Your Top Matches</Text>

          {matches.map((m, i) => (
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
                    matches: matchesParam ?? "[]",
                    userName: displayName,
                  },
                })
              }
            >
              <View style={styles.matchHeader}>
                <Text style={styles.matchName}>{m.name}</Text>
                <View
                  style={[
                    styles.scoreBadge,
                    { backgroundColor: getScoreColor(m.score) },
                  ]}
                >
                  <Text style={styles.scoreText}>{m.score}%</Text>
                </View>
              </View>

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
          ))}

          {/* ── Map ── */}
          <MatchMap matches={matches} userLocation={userCity} />
        </>
      )}

      {/* ── Pending connection requests ── */}
      {pendingRequests.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pending Requests</Text>
          {pendingRequests.map((req) => (
            <View key={req.id} style={styles.requestCard}>
              <Text style={styles.requestFrom}>{req.from_user_name}</Text>
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
        </>
      )}

      {/* ── Footer actions ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.editProfileBtn}
          onPress={() => router.push("/editProfile")}
        >
          <Text style={styles.editProfileText}>Edit Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.newProfileBtn}
          onPress={() => router.push("/language")}
        >
          <Text style={styles.newProfileText}>Start New Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
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
  matchName: { fontSize: 22, fontWeight: "700", color: "#1A1A2E" },
  scoreBadge: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12 },
  scoreText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  matchDetail: { fontSize: 15, color: "#444", marginBottom: 4 },
  matchType: { fontSize: 13, color: "#2F80ED", marginBottom: 10, fontWeight: "600" },
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
  requestFrom: { fontSize: 18, fontWeight: "700", color: "#1A1A2E", marginBottom: 4 },
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
  editProfileBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: "#EEF4FF",
    borderWidth: 2,
    borderColor: "#2F80ED",
    alignItems: "center",
  },
  editProfileText: { color: "#2F80ED", fontSize: 16, fontWeight: "600" },
  newProfileBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#AAC4F0",
    alignItems: "center",
  },
  newProfileText: { color: "#2F80ED", fontSize: 16, fontWeight: "500" },
  logoutBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#FFAAAA",
  },
  logoutText: { color: "#E74C3C", fontSize: 16, fontWeight: "500" },
});
