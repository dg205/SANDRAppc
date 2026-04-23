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

export default function MatchProfile() {
  const { match: matchParam, matches, userName } = useLocalSearchParams<{
    match: string;
    matches?: string;
    userName?: string;
  }>();

  const match = matchParam ? JSON.parse(matchParam) : {};
  const candidate = match.candidate ?? {};
  const features = match.features ?? {};

  const name = match.name ?? candidate.name ?? "Unknown";
  const age = match.age ?? candidate.age ?? "";
  const location = match.location ?? candidate.location ?? "";
  const score = match.score ?? 0;
  const userType = match.userType ?? candidate.userType ?? "";
  const faith = candidate.faith ?? "";

  const sharedInterests: string[] = features.shared_interests ?? [];
  const sharedValues: string[] = features.shared_values ?? [];
  const sharedLanguages: string[] = features.shared_languages ?? [];

  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

  const getScoreColor = (s: number) => {
    if (s >= 80) return "#27AE60";
    if (s >= 65) return "#F39C12";
    return "#E74C3C";
  };

  const Tag = ({ label }: { label: string }) => (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{cap(label)}</Text>
    </View>
  );

  const hasCommon =
    sharedInterests.length > 0 ||
    sharedValues.length > 0 ||
    sharedLanguages.length > 0 ||
    !!faith;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.profileName}>{name}</Text>
              {!!age && <Text style={styles.profileDetail}>Age: {age}</Text>}
              {!!location && (
                <Text style={styles.profileDetail}>{cap(location)}</Text>
              )}
              {!!userType && (
                <Text style={styles.profileType}>
                  {userType === "senior" ? "Older Adult" : "Young Companion"}
                </Text>
              )}
            </View>
            <View
              style={[
                styles.scoreBadge,
                { backgroundColor: getScoreColor(score) },
              ]}
            >
              <Text style={styles.scoreNum}>{score}%</Text>
              <Text style={styles.scoreLabel}>Match</Text>
            </View>
          </View>

          <View style={styles.scoreBar}>
            <View
              style={[
                styles.scoreBarFill,
                {
                  width: `${score}%` as any,
                  backgroundColor: getScoreColor(score),
                },
              ]}
            />
          </View>
        </View>

        {/* Things in common */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Things You Have in Common</Text>

          {sharedInterests.length > 0 && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Shared Interests</Text>
              <View style={styles.tagRow}>
                {sharedInterests.map((item, i) => (
                  <Tag key={i} label={item} />
                ))}
              </View>
            </View>
          )}

          {sharedValues.length > 0 && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Shared Values</Text>
              <View style={styles.tagRow}>
                {sharedValues.map((item, i) => (
                  <Tag key={i} label={item} />
                ))}
              </View>
            </View>
          )}

          {sharedLanguages.length > 0 && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Shared Languages</Text>
              <View style={styles.tagRow}>
                {sharedLanguages.map((item, i) => (
                  <Tag key={i} label={item} />
                ))}
              </View>
            </View>
          )}

          {!!faith && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Faith</Text>
              <View style={styles.tagRow}>
                <Tag label={faith} />
              </View>
            </View>
          )}

          {!hasCommon && (
            <Text style={styles.noCommon}>
              Complete your profile for a detailed breakdown.
            </Text>
          )}
        </View>

        {/* Connect button */}
        <TouchableOpacity
          style={styles.connectBtn}
          onPress={() =>
            router.push({
              pathname: "/profile/ConnectRequest",
              params: {
                matchName: name,
                fromUserName: userName ?? "",
              },
            })
          }
        >
          <Text style={styles.connectBtnText}>Request to Connect</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EAF3FF" },
  scroll: { padding: 20, paddingBottom: 48 },

  backBtn: { marginBottom: 16 },
  backText: { fontSize: 16, color: "#2F80ED", fontWeight: "600" },

  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  profileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  profileName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1A1A2E",
    marginBottom: 4,
  },
  profileDetail: { fontSize: 15, color: "#555", marginBottom: 2 },
  profileType: {
    fontSize: 13,
    color: "#2F80ED",
    fontWeight: "600",
    marginTop: 4,
  },
  scoreBadge: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    minWidth: 64,
  },
  scoreNum: { color: "#fff", fontWeight: "800", fontSize: 20 },
  scoreLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  scoreBar: {
    height: 8,
    backgroundColor: "#DDE3ED",
    borderRadius: 999,
    overflow: "hidden",
  },
  scoreBarFill: { height: "100%", borderRadius: 999 },

  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 16,
  },
  subsection: { marginBottom: 16 },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    backgroundColor: "#EEF4FF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#B0C8F0",
  },
  tagText: { fontSize: 14, color: "#2F80ED", fontWeight: "500" },
  noCommon: {
    fontSize: 15,
    color: "#888",
    textAlign: "center",
    lineHeight: 22,
  },

  connectBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    shadowColor: "#2F80ED",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  connectBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
