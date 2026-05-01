import { View, Text, TouchableOpacity, StyleSheet, Image, SafeAreaView } from "react-native";
import { router } from "expo-router";

export default function Services() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Text style={styles.iconButtonText}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Emergency</Text>
          <Text style={styles.headerSubtitle}>Call for Help</Text>
        </View>

        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push("/profile")}
        >
          <Image
            source={{ uri: "https://via.placeholder.com/44" }}
            style={styles.profileImage}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.alertCard}>
        <Text style={styles.alertIcon}>❗</Text>
        <Text style={styles.alertTitle}>Alert</Text>
      </View>

      <Text style={styles.helperText}>This is for your safety</Text>

      <View style={styles.buttonsWrap}>
        <TouchableOpacity
          style={[styles.actionButton, styles.contactsButton]}
          activeOpacity={0.85}
        >
          <Text style={styles.contactsButtonText}>Emergency Contacts</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.helpButton]}
          activeOpacity={0.85}
        >
          <Text style={styles.helpButtonText}>Call for Help</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.medicalButton]}
          activeOpacity={0.85}
        >
          <Text style={styles.medicalButtonText}>Medical Status</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#BFDFFF",
    paddingTop: 8,
    paddingHorizontal: 16,
  },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#E8F1FB",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#B7D3F7",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },

  iconButtonText: {
    fontSize: 18,
    color: "#3B4A5A",
    fontWeight: "500",
  },

  headerTextWrap: {
    flex: 1,
    marginLeft: 12,
  },

  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },

  headerSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },

  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },

  profileImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E5E7EB",
  },

  alertCard: {
    backgroundColor: "#EAF3FB",
    borderRadius: 22,
    minHeight: 190,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },

  alertIcon: {
    fontSize: 44,
    marginBottom: 8,
  },

  alertTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827",
  },

  helperText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 16,
  },

  buttonsWrap: {
    marginTop: 4,
  },

  actionButton: {
    borderRadius: 18,
    minHeight: 56,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
  },

  contactsButton: {
    backgroundColor: "#FF7A00",
  },

  helpButton: {
    backgroundColor: "#E11D1D",
  },

  medicalButton: {
    backgroundColor: "#72F12B",
  },

  contactsButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },

  helpButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  medicalButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
});
