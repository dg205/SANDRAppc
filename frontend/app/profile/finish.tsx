import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import LeaveSurveyButton, { markHasProfile } from "../../components/LeaveSurveyButton";
import { useProfile } from "./profileContext";
import { authFetch, addUser, getTopMatches } from "../../utils/api";
import { saveItem, SESSION_KEY } from "../../utils/storage";

export default function FinishSurvey() {
  const { profile } = useProfile();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [fetchingMatches, setFetchingMatches] = useState(false);
  const [matchesError, setMatchesError] = useState("");
  // addUser does an unconditional INSERT, so a retry after a failed match
  // fetch must not register the same person a second time.
  const userRegistered = useRef(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      // Matches Attachment 3: Voice-Based Social Profile Questions (six
      // guided voice questions), plus the non-voice name/age setup step.
      const responses = [
        {
          question_key: "name_age",
          structured_answer: { name: profile.name, age: profile.age },
        },
        {
          // Q1: Tell us a little about yourself and what you enjoy doing.
          question_key: "about_and_interests",
          audio_file_path: profile.bioAudioServerPath,
          transcription: profile.bio,
        },
        {
          // Q2: What types of social activities would you like to do with
          // another person or group?
          question_key: "social_activities",
          audio_file_path: profile.hobbiesAudioServerPath,
          transcription: profile.hobbiesText,
          structured_answer: { interests: profile.interests },
        },
        {
          // Q3: What kind of people would you enjoy connecting with?
          question_key: "connecting_with",
          audio_file_path: profile.meetingAudioServerPath,
          transcription: profile.meetingText,
          structured_answer: { connectionGoals: profile.connectionGoals },
        },
        {
          // Q4: How do you prefer to communicate with others?
          question_key: "communication_preference",
          audio_file_path: profile.commPreferenceAudioServerPath,
          transcription: profile.commPreferenceText,
          structured_answer: { talkPreferences: profile.talkPreferences },
        },
        {
          // Q5: When are you usually available for social activities or
          // conversations?
          question_key: "availability",
          audio_file_path: profile.availabilityAudioServerPath,
          transcription: profile.availabilityText,
        },
        {
          // Q6: Is there anything important we should consider when
          // suggesting possible social matches?
          question_key: "match_considerations",
          audio_file_path: profile.gettingHelpAudioServerPath,
          transcription: profile.gettingHelpText,
          structured_answer: { helpWith: profile.helpWith },
        },
      ];

      const res = await authFetch(`/api/survey/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: profile.name,
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
      return;
    } finally {
      setSubmitting(false);
    }

    await fetchAndShowMatches();
  };

  const fetchAndShowMatches = async () => {
    setFetchingMatches(true);
    setMatchesError("");

    try {
      const targetUser = { ...profile };

      // Make this user a real candidate so others can be matched with them.
      if (!userRegistered.current) {
        await addUser(targetUser);
        userRegistered.current = true;
        markHasProfile();
      }

      const result = await getTopMatches(targetUser, []);

      await saveItem(
        SESSION_KEY,
        JSON.stringify({
          name: profile.name,
          location: profile.location,
          email: profile.email,
          userType: profile.userType,
        })
      );

      router.replace({
        pathname: "/profile/MatchResults",
        params: {
          matches: JSON.stringify(result.matches),
          userName: profile.name ?? "",
        },
      });
    } catch (err) {
      setMatchesError(String(err));
    } finally {
      setFetchingMatches(false);
    }
  };

  // The dashboard loads matches on its own, so this works even if fetching
  // them here failed.
  const goToDashboard = () => router.replace("/home");

  return (
    <View style={styles.container}>
      {!submitted && <LeaveSurveyButton />}
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
            {fetchingMatches && (
              <>
                <ActivityIndicator color="#4B6FA5" />
                <Text style={styles.findingText}>Finding your matches...</Text>
              </>
            )}
            {matchesError !== "" && (
              <>
                <Text style={styles.errorText}>{matchesError}</Text>
                <TouchableOpacity style={styles.button} onPress={fetchAndShowMatches}>
                  <Text style={styles.buttonText}>Try Again</Text>
                </TouchableOpacity>
              </>
            )}
            {!fetchingMatches && (
              <TouchableOpacity
                style={[styles.button, matchesError !== "" && styles.buttonSecondary]}
                onPress={goToDashboard}
              >
                <Text style={styles.buttonText}>Go to Dashboard</Text>
              </TouchableOpacity>
            )}
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
  buttonSecondary: {
    backgroundColor: "#9CA3AF",
  },
  findingText: {
    fontSize: 15,
    color: "#4B6FA5",
    textAlign: "center",
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
