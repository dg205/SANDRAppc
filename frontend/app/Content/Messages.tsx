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

export default function Messages() {
  const [message, setMessage] = useState("");

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Text style={styles.iconButtonText}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerIcon}>💬</Text>
          <Text style={styles.headerTitle}>Messages</Text>
        </View>

        <View style={styles.topRightButtons}>
          <TouchableOpacity style={[styles.topActionButton, styles.greenButton]}>
            <Text style={styles.topActionText}>🗺️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topActionButton, styles.redButton]}>
            <Text style={styles.topActionText}>🧺</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.chatCard}>
        <View style={styles.chatHeader}>
          <TouchableOpacity style={styles.smallBackButton} onPress={() => router.back()}>
            <Text style={styles.iconButtonText}>←</Text>
          </TouchableOpacity>

          <Image
            source={{ uri: "https://via.placeholder.com/52" }}
            style={styles.avatar}
          />

          <View style={styles.headerTextWrap}>
            <Text style={styles.name}>Michael</Text>
            <Text style={styles.status}>🟢 ✅ Online now</Text>
          </View>
        </View>

        <ScrollView
          style={styles.messagesArea}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.messageBubble, styles.receivedBubble]}>
            <Text style={styles.receivedText}>
              Good afternoon! How has your day been?
            </Text>
            <Text style={styles.timeText}>2:30 PM</Text>
          </View>

          <View style={[styles.messageBubble, styles.sentBubble]}>
            <Text style={styles.sentText}>
              Hello Michael! It&apos;s been lovely. I spent some time in my garden this
              morning.
            </Text>
            <Text style={styles.sentTimeText}>2:35 PM</Text>
          </View>

          <View style={[styles.messageBubble, styles.receivedBubble]}>
            <Text style={styles.receivedText}>
              That sounds wonderful! What are you growing this season?
            </Text>
            <Text style={styles.timeText}>2:40 PM</Text>
          </View>
        </ScrollView>

        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.pinButton}>
            <Text style={styles.pinText}>📍</Text>
          </TouchableOpacity>

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Type your message..."
            placeholderTextColor="#6B7280"
            style={styles.input}
          />

          <TouchableOpacity style={styles.sendButton}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 16,
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

  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: 10,
  },

  headerIcon: {
    fontSize: 18,
    marginRight: 6,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#2F3A4A",
  },

  topRightButtons: {
    flexDirection: "row",
    marginLeft: 10,
  },

  topActionButton: {
    width: 44,
    height: 38,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 4,
  },

  greenButton: {
    backgroundColor: "#38C172",
  },

  redButton: {
    backgroundColor: "#FF5B5B",
  },

  topActionText: {
    fontSize: 16,
  },

  chatCard: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#F4F5F7",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D8E2EF",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },

  chatHeader: {
    backgroundColor: "#9ED1F3",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  smallBackButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#E8F1FB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  headerTextWrap: {
    flex: 1,
  },

  name: {
    fontSize: 16,
    fontWeight: "500",
    color: "#2F3A4A",
    marginBottom: 2,
  },

  status: {
    fontSize: 13,
    color: "#356AE6",
  },

  messagesArea: {
    flex: 1,
  },

  messagesContent: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },

  messageBubble: {
    maxWidth: "74%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },

  receivedBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
  },

  sentBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#5B9BE6",
  },

  receivedText: {
    fontSize: 15,
    color: "#2F3A4A",
    lineHeight: 22,
    marginBottom: 8,
  },

  sentText: {
    fontSize: 15,
    color: "#FFFFFF",
    lineHeight: 22,
    marginBottom: 8,
  },

  timeText: {
    fontSize: 13,
    color: "#8A8F98",
  },

  sentTimeText: {
    fontSize: 13,
    color: "#E8F1FF",
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#D8E2EF",
    backgroundColor: "#F4F5F7",
  },

  pinButton: {
    width: 48,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
    borderWidth: 1,
    borderColor: "#8AB4FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },

  pinText: {
    fontSize: 16,
  },

  input: {
    flex: 1,
    height: 40,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#8AB4FF",
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#2F3A4A",
    marginRight: 8,
  },

  sendButton: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#5B9BE6",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  sendButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#FFFFFF",
  },
});
