import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { router } from "expo-router";

export default function Family() {
  return (
    <View style={styles.container}>
      <Image source={require("../../assets/logo.png")} style={styles.logo} />

      <View style={styles.card}>
        <Text style={styles.title}>Do you want to add family members?</Text>
        <Text style={styles.subtitle}>You can skip this step or add family members who will be notified.</Text>

        <TouchableOpacity style={styles.familyBtn}>
          <Text style={styles.familyText}>Add a Family Member</Text>
        </TouchableOpacity>

        <Text style={styles.info}>
          We will contact the family members and inform them that you have added them.
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.next} onPress={() => router.push("/profile/age")}>
          <Text style={styles.nextText}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E5EEFF", alignItems: "center", paddingTop: 50 },
  logo: { width: 80, height: 80, marginBottom: 20 },
  card: {
    backgroundColor: "#fff",
    padding: 20,
    width: "90%",
    borderRadius: 18,
  },
  title: { fontSize: 22, fontWeight: "bold", textAlign: "center" },
  subtitle: { textAlign: "center", marginTop: 10, color: "#555", fontSize: 16 },
  familyBtn: {
    backgroundColor: "#EEF4FF",
    padding: 14,
    borderRadius: 10,
    marginTop: 20,
  },
  familyText: { textAlign: "center", fontSize: 18, color: "#3A74F3" },
  info: {
    marginTop: 20,
    backgroundColor: "#D8E6FF",
    padding: 12,
    borderRadius: 10,
    textAlign: "center",
  },
  footer: { flexDirection: "row", width: "90%", marginTop: 20 },
  back: {
    flex: 1,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginRight: 8,
  },
  next: {
    flex: 1,
    padding: 14,
    backgroundColor: "#3A74F3",
    borderRadius: 12,
    marginLeft: 8,
  },
  backText: { textAlign: "center", fontSize: 18, color: "#3A74F3" },
  nextText: { textAlign: "center", fontSize: 18, color: "#fff" },
});
