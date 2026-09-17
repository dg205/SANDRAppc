import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, BackHandler, ActivityIndicator } from "react-native";
import { useProfile } from "./profileContext";
import { BASE_URL } from "../../utils/api";

export default function FinishSurvey() {
  const { profile } = useProfile();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      const responses = [
        {
          question_key: "name_age",
          structured_answer: { name: profile.name, age: profile.age },
        },
        {
          question_key: "location",
          audio_file_path: profile.locationAudioServerPath,
          transcription: profile.locationText,
          structured_answer: { location: profile.location },
        },
        {
          question_key: "hobbies",
          audio_file_path: profile.hobbiesAudioServerPath,
          transcription: profile.hobbiesText,
          structured_answer: { interests: profile.interests },
        },
        {
          question_key: "values",
          audio_file_path: profile.valuesAudioServerPath,
          transcription: profile.valuesText,
          structured_answer: { values: profile.values },
        },
        {
          question_key: "bio",
          audio_file_path: profile.bioAudioServerPath,
          transcription: profile.bio,
        },
        {
          question_key: "getting_help",
          audio_file_path: profile.gettingHelpAudioServerPath,
          transcription: profile.gettingHelpText,
          structured_answer: { helpWith: profile.helpWith },
        },
        {
          question_key: "meeting",
          audio_file_path: profile.meetingAudioServerPath,
          transcription: profile.meetingText,
          structured_answer: { connectionGoals: profile.connectionGoals },
        },
        {
          question_key: "teaching",
          audio_file_path: profile.teachingAudioServerPath,
          transcription: profile.teachingText,
        },
      ];

      const res = await fetch(`${BASE_URL}/api/survey/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: profile.name,
          user_email: profile.email,
          user_type: profile.userType,
          responses,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to save survey");
      }

      setSubmitted(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExit = () => {
    BackHandler.exitApp();
    if (typeof window !== "undefined") {
      window.close();
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/logo.png")} style={styles.logo} />

      <Text style={styles.title}>Congratulations!</Text>

      <Text style={styles.subtitle}>
        You are finished.{"\n"}
        Thank you for completing the survey 💙
      </Text>

      <View style={styles.box}>
        {!submitted ? (
          <>
            {error !== "" && (
              <Text style={styles.errorText}>{error}</Text>
            )}
            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Save My Responses</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.savedText}>Responses saved!</Text>
            <TouchableOpacity style={styles.button} onPress={handleExit}>
              <Text style={styles.buttonText}>Exit</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f8fbff",
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 25,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
    color: "#1E3A5F",
  },
  subtitle: {
    fontSize: 18,
    textAlign: "center",
    color: "#4B6FA5",
    marginBottom: 35,
    lineHeight: 28,
  },
  box: {
    width: "90%",
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 20,
    elevation: 3,
    alignItems: "center",
    gap: 12,
  },
  button: {
    backgroundColor: "#4B6FA5",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  buttonText: {
    fontSize: 18,
    textAlign: "center",
    color: "#fff",
    fontWeight: "600",
  },
  savedText: {
    fontSize: 16,
    color: "#27AE60",
    fontWeight: "600",
  },
  errorText: {
    fontSize: 14,
    color: "#E74C3C",
    textAlign: "center",
  },
});
