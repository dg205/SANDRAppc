import React, { useState } from "react";
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from "react-native";

// A password box with a Show/Hide button, so people can check what they
// typed. A word rather than an eye icon, which is clearer for older users.
export default function PasswordInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#999"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
      >
        <Text style={styles.toggleText}>{visible ? "Hide" : "Show"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F9FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D8F0",
    marginBottom: 20,
  },
  input: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: "#1A1A2E",
  },
  toggle: { paddingHorizontal: 14, paddingVertical: 10 },
  toggleText: { fontSize: 15, color: "#2F80ED", fontWeight: "700" },
});
