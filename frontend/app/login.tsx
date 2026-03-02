// app/login.tsx
import { View, Text, TextInput, StyleSheet, Image, TouchableOpacity } from "react-native";
import { router } from "expo-router";

export default function Login() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>

      <TextInput placeholder="Username" style={styles.input} />
      <TextInput placeholder="Password" secureTextEntry style={styles.input} />

      <TouchableOpacity onPress={() => router.push("/profile/age")}>
        <Image
          source={require("../assets/logo.png")} // replace with your logo
          style={styles.logo}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 28, marginBottom: 20 },
  input: {
    width: "80%",
    backgroundColor: "#fff",
    padding: 14,
    marginVertical: 10,
    borderRadius: 8,
    elevation: 3,
  },
  logo: { width: 120, height: 120, marginTop: 30 }
});
