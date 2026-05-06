import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { router } from "expo-router";

export default function SettingsScreen() {
  const [profileImage, setProfileImage] = useState("https://via.placeholder.com/80");
  const [name, setName] = useState("Your Name");
  const [address, setAddress] = useState("123 Main St, Marietta, GA");
  const [phone, setPhone] = useState("(555) 123‑4567");
  const [textSize, setTextSize] = useState(20);
  const [theme, setTheme] = useState("blue");

  const themeColors = {
    blue: "#4E91D9",
    orange: "#F59E0B",
    black: "#111827",
    green: "#22C55E",
  };

  const pickImage = () => {
    alert("Image picker coming soon!");
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: "#F0F4FA" }]}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* BACK BUTTON */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        {/* HEADER */}
        <Text style={[styles.header, { fontSize: textSize + 6 }]}>
          Settings
        </Text>

        {/* PROFILE IMAGE */}
        <View style={styles.section}>
          <Text style={[styles.label, { fontSize: textSize }]}>Profile Photo</Text>

          <TouchableOpacity onPress={pickImage} style={styles.imageWrap}>
            <Image source={{ uri: profileImage }} style={styles.profileImage} />
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        {/* NAME */}
        <View style={styles.section}>
          <Text style={[styles.label, { fontSize: textSize }]}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={[styles.input, { fontSize: textSize }]}
            accessible
            accessibilityLabel="Enter your name"
          />
        </View>

        {/* ADDRESS */}
        <View style={styles.section}>
          <Text style={[styles.label, { fontSize: textSize }]}>Address</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            style={[styles.input, { fontSize: textSize }]}
            accessible
            accessibilityLabel="Enter your address"
          />
        </View>

        {/* PHONE */}
        <View style={styles.section}>
          <Text style={[styles.label, { fontSize: textSize }]}>Phone Number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            style={[styles.input, { fontSize: textSize }]}
            keyboardType="phone-pad"
            accessible
            accessibilityLabel="Enter your phone number"
          />
        </View>

        {/* TEXT SIZE */}
        <View style={styles.section}>
          <Text style={[styles.label, { fontSize: textSize }]}>Text Size</Text>

          <View style={styles.textSizeRow}>
            <TouchableOpacity
              onPress={() => setTextSize(Math.max(16, textSize - 2))}
              style={styles.sizeButtonWrap}
              accessible
              accessibilityLabel="Decrease text size"
            >
              <Text style={styles.sizeButton}>A−</Text>
            </TouchableOpacity>

            <Text style={[styles.sizeDisplay, { fontSize: textSize }]}>
              {textSize}px
            </Text>

            <TouchableOpacity
              onPress={() => setTextSize(Math.min(32, textSize + 2))}
              style={styles.sizeButtonWrap}
              accessible
              accessibilityLabel="Increase text size"
            >
              <Text style={styles.sizeButton}>A+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* THEME COLORS */}
        <View style={styles.section}>
          <Text style={[styles.label, { fontSize: textSize }]}>Theme Color</Text>

          <View style={styles.colorRow}>
            {Object.keys(themeColors).map((key) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.colorDot,
                  { backgroundColor: themeColors[key] },
                  theme === key && styles.selectedDot,
                ]}
                onPress={() => setTheme(key)}
                accessible
                accessibilityLabel={`Select ${key} theme`}
              />
            ))}
          </View>
        </View>

        {/* PREVIEW */}
        <View style={styles.previewCard}>
          <Text style={[styles.previewTitle, { fontSize: textSize + 2 }]}>
            Preview
          </Text>

          <Text style={[styles.previewText, { fontSize: textSize }]}>
            Name: {name}
          </Text>
          <Text style={[styles.previewText, { fontSize: textSize }]}>
            Address: {address}
          </Text>
          <Text style={[styles.previewText, { fontSize: textSize }]}>
            Phone: {phone}
          </Text>

          <View
            style={[
              styles.previewThemeBox,
              { backgroundColor: themeColors[theme] },
            ]}
          >
            <Text style={styles.previewThemeText}>Theme Example</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  content: {
    padding: 20,
    alignItems: "center",
  },

  backButton: {
    width: "100%",
    alignItems: "flex-start",
    marginBottom: 10,
  },

  backText: {
    fontSize: 20,
    color: "#356AE6",
    textAlign: "left",
  },


  header: {
    fontWeight: "700",
    color: "#334155",
    marginBottom: 24,
    textAlign: "center",
  },

  section: { marginBottom: 32, width: "100%", alignItems: "center" },

  label: {
    fontWeight: "600",
    color: "#334155",
    marginBottom: 10,
    textAlign: "center",
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#AAB7C8",
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: "90%",
    textAlign: "center",
  },

  imageWrap: { alignItems: "center" },

  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 8,
  },

  changePhotoText: {
    color: "#356AE6",
    fontSize: 16,
    textAlign: "center",
  },

  textSizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "80%",
    marginTop: 10,
  },

  sizeButtonWrap: {
    padding: 10,
  },

  sizeButton: {
    fontSize: 28,
    color: "#334155",
  },

  sizeDisplay: {
    fontWeight: "600",
    color: "#334155",
    marginHorizontal: 20,
  },

  colorRow: {
    flexDirection: "row",
    marginTop: 10,
  },

  colorDot: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 16,
    borderWidth: 3,
    borderColor: "transparent",
  },

  selectedDot: {
    borderColor: "#000",
  },

  previewCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8E2EF",
    marginTop: 20,
    width: "100%",
    alignItems: "center",
  },

  previewTitle: {
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },

  previewText: {
    marginBottom: 8,
    color: "#334155",
    textAlign: "center",
  },

  previewThemeBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    width: "80%",
  },

  previewThemeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
  },
});
