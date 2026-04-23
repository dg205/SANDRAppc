import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from "react-native";
import { router } from "expo-router";

export default function Navigation() {
  const menuCards = [
    {
      icon: "💬",
      title: "Messages",
      subtitle: "",
      badge: "3 new",
      route: "/Content/Messages",
    },
    {
      icon: "🧠",
      title: "Smart Matches",
      subtitle: "AI-powered",
      route: "/smart-matches",
    },
    {
      icon: "🏥",
      title: "Services",
      subtitle: "Healthcare & support",
      route: "/Content/Services",
    },
    {
      icon: "⚙️",
      title: "Settings",
      subtitle: "Manage account",
      route: "/Content/Settings",
    },
  ];

  const tags = ["Gardening", "Cooking", "History"];

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.profileSection}>
          <View style={styles.logoWrap}>
            <Image
              source={{ uri: "https://via.placeholder.com/60" }}
              style={styles.logo}
            />
          </View>

          <View>
            <Text style={styles.greeting}>Hello, there! ✨</Text>
            <Text style={styles.age}>Age 68</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.alertButton}>
          <Text style={styles.alertIcon}>🧺</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {menuCards.map((card) => (
          <TouchableOpacity
            key={card.title}
            style={styles.menuCard}
            activeOpacity={0.85}
            onPress={() => {
              if (card.route) router.push(card.route);
            }}
          >
            <Text style={styles.menuIcon}>{card.icon}</Text>
            <Text style={styles.menuTitle}>{card.title}</Text>
            {!!card.subtitle && <Text style={styles.menuSubtitle}>{card.subtitle}</Text>}
            {!!card.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{card.badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.matchHeaderRow}>
        <View style={styles.line} />
        <Text style={styles.matchHeader}>✨ Your Best Matches</Text>
        <View style={styles.line} />
      </View>

      <View style={styles.matchCard}>
        <View style={styles.cornerAccent} />

        <View style={styles.matchTopRow}>
          <View style={styles.avatarWrap}>
            <Image
              source={{ uri: "https://via.placeholder.com/80" }}
              style={styles.avatar}
            />
            <View style={styles.onlineDot} />
          </View>

          <View style={styles.matchInfo}>
            <Text style={styles.name}>Michael, 28</Text>

            <View style={styles.matchPill}>
              <Text style={styles.matchPillText}>💚 94% Match</Text>
            </View>

            <Text style={styles.detailText}>💖 Like your grandson</Text>
            <Text style={styles.locationText}>📍 2.3 miles away</Text>
          </View>
        </View>

        <View style={styles.tagsRow}>
          {tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.messageButton}>
            <Text style={styles.messageButtonText}>💬 Message</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.profileButton}>
            <Text style={styles.profileButtonText}>👀 Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#BFDFFF",
  },

  scrollContent: {
    paddingTop: 30,
    paddingHorizontal: 16,
    paddingBottom: 30,
  },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },

  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },

  logo: {
    width: 42,
    height: 42,
    borderRadius: 21,
    resizeMode: "cover",
  },

  greeting: {
    fontSize: 24,
    fontWeight: "600",
    color: "#333",
  },

  age: {
    marginTop: 2,
    fontSize: 16,
    color: "#356AE6",
  },

  alertButton: {
    width: 56,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FF5B5B",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },

  alertIcon: {
    fontSize: 18,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },

  menuCard: {
    width: "48.5%",
    backgroundColor: "#EEF4FB",
    borderRadius: 18,
    minHeight: 118,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },

  menuIcon: {
    fontSize: 28,
    marginBottom: 8,
  },

  menuTitle: {
    fontSize: 24,
    fontWeight: "500",
    color: "#333",
    textAlign: "center",
  },

  menuSubtitle: {
    fontSize: 13,
    color: "#6A7280",
    marginTop: 4,
    textAlign: "center",
  },

  badge: {
    marginTop: 10,
    backgroundColor: "#FF3B3B",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },

  matchHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  line: {
    flex: 1,
    height: 1,
    backgroundColor: "#9EC3EA",
  },

  matchHeader: {
    fontSize: 18,
    fontWeight: "500",
    color: "#334155",
    marginHorizontal: 10,
  },

  matchCard: {
    backgroundColor: "#EAF3FB",
    borderRadius: 22,
    padding: 16,
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },

  cornerAccent: {
    position: "absolute",
    right: -8,
    top: -8,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#DDEAF7",
  },

  matchTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  avatarWrap: {
    width: 66,
    height: 66,
    borderRadius: 33,
    marginRight: 12,
    position: "relative",
  },

  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 33,
    backgroundColor: "#fff",
  },

  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#fff",
  },

  matchInfo: {
    flex: 1,
  },

  name: {
    fontSize: 28,
    fontWeight: "500",
    color: "#333",
    marginBottom: 6,
  },

  matchPill: {
    alignSelf: "flex-start",
    backgroundColor: "#22C55E",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },

  matchPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },

  detailText: {
    fontSize: 16,
    color: "#2563EB",
    marginBottom: 4,
  },

  locationText: {
    fontSize: 14,
    color: "#666",
  },

  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 18,
    marginBottom: 24,
  },

  tag: {
    backgroundColor: "#F7FAFF",
    borderColor: "#C8DCF8",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 8,
  },

  tagText: {
    fontSize: 12,
    color: "#356AE6",
  },

  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  messageButton: {
    flex: 1,
    backgroundColor: "#4E91D9",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginRight: 6,
  },

  messageButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },

  profileButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginLeft: 6,
    borderWidth: 1,
    borderColor: "#D9E4F2",
  },

  profileButtonText: {
    color: "#356AE6",
    fontSize: 16,
    fontWeight: "500",
  },
});
