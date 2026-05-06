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
  const [textSize, setTextSize] = useState(18);
  const [theme, setTheme] = useState("blue");

  const themeColors = {
    blue: "#4E91D9",
    orange: "#F59E0B",
    black: "#111827",
    green: "#22C55E",
  };

  const pickImage = () => {
    // Hook up Expo ImagePicker here
    alert("Image picker coming soon!");
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: "#F0F4FA" }]}>
      <ScrollView contentContainerStyle={styles.content}>

        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={[styles.header, { fontSize: textSize + 4 }]}>
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
          />
        </View>

        {/* ADDRESS */}
        <View style={styles.section}>
          <Text style={[styles.label, { fontSize: textSize }]}>Address</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            style={[styles.input, { fontSize: textSize }]}
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
          />
        </View>

        {/* TEXT SIZE */}
        <View style={styles.section}>
          <Text style={[styles.label, { fontSize: textSize }]}>Text Size</Text>

          <View style={styles.textSizeRow}>
            <TouchableOpacity onPress={() => setTextSize(Math.max(14, textSize - 2))}>
              <Text style={styles.sizeButton}>A−</Text>
            </TouchableOpacity>

            <Text style={[styles.sizeDisplay, { fontSize: textSize }]}>
              {textSize}px
            </Text>

            <TouchableOpacity onPress={() => setTextSize(Math.min(30, textSize + 2))}>
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
  content: { padding: 20 },
  backButton: { marginBottom: 10 },
  backText: { fontSize: 18, color: "#356AE6" },

  header: {
    fontWeight: "600",
    color: "#334155",
    marginBottom: 20,
  },

  section: { marginBottom: 24 },

  label: {
    fontWeight: "500",
    color: "#334155",
    marginBottom: 6,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D5E5",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  imageWrap: { alignItems: "center" },

  profileImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 8,
  },

  changePhotoText: {
    color: "#356AE6",
    fontSize: 14,
  },

  textSizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: 160,
  },

  sizeButton: {
    fontSize: 22,
    paddingHorizontal: 10,
    color: "#334155",
  },

  sizeDisplay: {
    fontWeight: "500",
    color: "#334155",
  },

  colorRow: {
    flexDirection: "row",
    marginTop: 10,
  },

  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },

  selectedDot: {
    borderColor: "#000",
    borderWidth: 3,
  },

  previewCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D8E2EF",
    marginTop: 20,
  },

  previewTitle: {
    fontWeight: "600",
    marginBottom: 10,
  },

  previewText: {
    marginBottom: 6,
    color: "#334155",
  },

  previewThemeBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
  },

  previewThemeText: {
    color: "#FFFFFF",
    fontWeight: "600",
    textAlign: "center",
  },
});
