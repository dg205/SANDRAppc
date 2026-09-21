import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import {
  ConnectionRequest,
  getConnectRequests,
  respondToConnectRequest,
} from "../../utils/api";
import { getItem, SESSION_KEY } from "../../utils/storage";

export default function Requests() {
  const { userName: paramName } = useLocalSearchParams<{ userName?: string }>();

  const [me, setMe] = useState("");
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    let name = (paramName ?? "").trim();
    if (!name) {
      const raw = await getItem(SESSION_KEY);
      try {
        name = raw ? JSON.parse(raw)?.name ?? "" : "";
      } catch {}
    }
    if (!name) {
      setError("We couldn't tell who you are. Please log in again.");
      setLoading(false);
      return;
    }

    setMe(name);
    try {
      setError("");
      setRequests(await getConnectRequests(name, "all"));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [paramName]);

  // Reload whenever the screen comes back into view (e.g. after sending a request).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const respond = async (id: number, status: "accepted" | "rejected") => {
    setBusyId(id);
    try {
      await respondToConnectRequest(id, status);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyId(null);
    }
  };

  const received = requests.filter(
    (r) => r.to_user_name === me && r.status === "pending"
  );
  const sent = requests.filter(
    (r) => r.from_user_name === me && r.status !== "accepted"
  );
  const connected = requests.filter((r) => r.status === "accepted");
  const isEmpty = !received.length && !sent.length && !connected.length;

  const when = (r: ConnectionRequest) => `${r.proposed_day} · ${r.proposed_time}`;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.pageTitle}>My Requests</Text>

        {error !== "" && <Text style={styles.errorText}>{error}</Text>}

        {loading ? (
          <ActivityIndicator color="#2F80ED" style={{ marginTop: 40 }} />
        ) : (
          <>
            {isEmpty && error === "" && (
              <Text style={styles.emptyText}>
                No requests yet. Open one of your matches and tap "Request to
                Connect" to get started.
              </Text>
            )}

            {received.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Waiting for your answer</Text>
                {received.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <Text style={styles.cardName}>{r.from_user_name}</Text>
                    <Text style={styles.cardDetail}>{when(r)}</Text>
                    {!!r.message && (
                      <Text style={styles.cardMessage}>"{r.message}"</Text>
                    )}
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={[styles.acceptBtn, busyId === r.id && styles.btnBusy]}
                        disabled={busyId === r.id}
                        onPress={() => respond(r.id, "accepted")}
                      >
                        <Text style={styles.acceptText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.declineBtn, busyId === r.id && styles.btnBusy]}
                        disabled={busyId === r.id}
                        onPress={() => respond(r.id, "rejected")}
                      >
                        <Text style={styles.declineText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {connected.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Connected</Text>
                {connected.map((r) => {
                  const other = r.from_user_name === me ? r.to_user_name : r.from_user_name;
                  return (
                    <View key={r.id} style={styles.card}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.cardName}>{other}</Text>
                        <View style={[styles.badge, styles.badgeGreen]}>
                          <Text style={styles.badgeText}>Connected</Text>
                        </View>
                      </View>
                      <Text style={styles.cardDetail}>{when(r)}</Text>
                      <TouchableOpacity
                        style={styles.chatBtn}
                        onPress={() =>
                          router.push({
                            pathname: "/profile/Chat",
                            params: {
                              connectionId: String(r.id),
                              otherUserName: other,
                              userName: me,
                            },
                          })
                        }
                      >
                        <Text style={styles.chatBtnText}>Open Chat</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </>
            )}

            {sent.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Requests you sent</Text>
                {sent.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.cardName}>{r.to_user_name}</Text>
                      <View
                        style={[
                          styles.badge,
                          r.status === "rejected" ? styles.badgeRed : styles.badgeAmber,
                        ]}
                      >
                        <Text style={styles.badgeText}>
                          {r.status === "rejected" ? "Declined" : "Pending"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.cardDetail}>{when(r)}</Text>
                    {!!r.message && (
                      <Text style={styles.cardMessage}>"{r.message}"</Text>
                    )}
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF3FF",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  scroll: { padding: 20, paddingBottom: 48 },

  backBtn: { marginBottom: 12 },
  backText: { fontSize: 16, color: "#2F80ED", fontWeight: "600" },
  pageTitle: { fontSize: 28, fontWeight: "800", color: "#1A1A2E", marginBottom: 8 },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#666",
    marginTop: 20,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
    marginTop: 40,
  },
  errorText: {
    fontSize: 14,
    color: "#E74C3C",
    textAlign: "center",
    marginVertical: 12,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardName: { fontSize: 20, fontWeight: "700", color: "#1A1A2E" },
  cardDetail: { fontSize: 15, color: "#555", marginTop: 4 },
  cardMessage: { fontSize: 15, color: "#444", fontStyle: "italic", marginTop: 8 },

  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  acceptBtn: {
    flex: 1,
    backgroundColor: "#27AE60",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  acceptText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  declineBtn: {
    flex: 1,
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#FFAAAA",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  declineText: { color: "#E74C3C", fontSize: 16, fontWeight: "600" },
  btnBusy: { opacity: 0.5 },
  chatBtn: {
    marginTop: 14,
    backgroundColor: "#2F80ED",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  chatBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  badgeGreen: { backgroundColor: "#27AE60" },
  badgeAmber: { backgroundColor: "#F39C12" },
  badgeRed: { backgroundColor: "#E74C3C" },
  badgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
