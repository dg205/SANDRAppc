import { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Animated,
  ActivityIndicator,
} from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { authFetch } from "../utils/api";

type RecorderFinishData = {
  audioUri: string | null;
  text: string;
  csv: string;
  csvUri: string | null;
  uploadedAudioPath?: string | null;
};

type MicrophoneRecorderProps = {
  onPartialText?: (text: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  onFinish?: (data: RecorderFinishData) => void;
};

export default function MicrophoneRecorder({
  onPartialText,
  onRecordingChange,
  onFinish,
}: MicrophoneRecorderProps) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [savedAudioUri, setSavedAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const [transcription, setTranscription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pendingResult, setPendingResult] = useState<RecorderFinishData | null>(null);

  // Browser recording: the MediaRecorder and the audio it has produced so far.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const active = recording !== null || isListening;

  // Auto-send transcript to parent as soon as transcription completes
  useEffect(() => {
    if (pendingResult && pendingResult.text && !active) {
      const finalText = pendingResult.text.trim();
      const finalCsv = buildCsv(finalText);
      onFinish?.({ ...pendingResult, text: finalText, csv: finalCsv });
    }
  }, [pendingResult]);

  function buildCsv(text: string) {
    const words = text
      .replace(/\n/g, " ")
      .split(" ")
      .map((w) => w.trim())
      .filter(Boolean);

    return ["word", ...words].join("\n");
  }

  function resetStateForNewRecording() {
    setTranscription("");
    setConfirmed(false);
    setPendingResult(null);
    setSavedAudioUri(null);
  }

  // Sends a recording to the backend, which transcribes it with Groq Whisper
  // and keeps a copy of the audio in storage.
  async function transcribe(formData: FormData) {
    // Signed-in only: each transcription costs Groq credits.
    const response = await authFetch(`/api/transcribe`, {
      method: "POST",
      body: formData,
    });

    const raw = await response.text();
    console.log("Transcribe status =", response.status);
    console.log("Transcribe raw body =", raw);

    if (!response.ok) {
      throw new Error(`Transcription failed (${response.status}): ${raw}`);
    }

    const data = JSON.parse(raw);
    return {
      text: ((data.text as string) || "").trim(),
      uploadedAudioPath: (data.saved_audio_path as string) || null,
    };
  }

  // -----------------------------
  // WEB RECORDING
  // -----------------------------
  // The browser records the audio and it's transcribed the same way as in
  // the app, rather than with the browser's own speech recognition, which
  // differs from browser to browser (and repeats words on Android Chrome).

  // Formats browsers can record in, best first. Chrome and Firefox record
  // WebM or Ogg, Safari records MP4. Whisper accepts all of them.
  const WEB_AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

  async function startWebRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      window.alert("This browser can't record audio. You can type your answer instead.");
      return false;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      window.alert("Microphone access is needed to record your answer.");
      return false;
    }

    resetStateForNewRecording();

    const mimeType = WEB_AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsListening(true);
    return true;
  }

  async function stopWebRecording() {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    setIsListening(false);
    if (!recorder) return;

    setIsProcessing(true);

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      recorder.stop();
    });
    // Release the microphone so the browser stops showing it as in use.
    recorder.stream.getTracks().forEach((t) => t.stop());

    const audioUri = URL.createObjectURL(blob);
    setSavedAudioUri(audioUri);

    let result: RecorderFinishData = {
      audioUri,
      text: "",
      csv: buildCsv(""),
      csvUri: null,
      uploadedAudioPath: null,
    };

    try {
      if (blob.size > 0) {
        // The server picks the format from the file extension, so match it.
        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        const formData = new FormData();
        formData.append("audio", blob, `recording.${ext}`);

        const { text, uploadedAudioPath } = await transcribe(formData);
        result = { ...result, text, csv: buildCsv(text), uploadedAudioPath };
        setTranscription(text);
        onPartialText?.(text);
      }
    } catch (err) {
      console.warn("Transcription/upload error:", err);
      const overLimit = String(err).includes("(429)");
      window.alert(
        overLimit
          ? "You've recorded a lot in the last hour. Please type your answer, or try again later."
          : "Your answer couldn't be turned into text. Tap the microphone to try again, or type your answer."
      );
    } finally {
      setIsProcessing(false);
    }

    setPendingResult(result);
    // Nothing came back: still tell the screen, so it can ask them to try
    // again or type instead. (Results with text are passed on above.)
    if (!result.text) onFinish?.(result);
  }

  // -----------------------------
  // NATIVE RECORDING
  // -----------------------------
  async function startNativeRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission Required", "Microphone access is needed.");
        return;
      }

      resetStateForNewRecording();

      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
    } catch (err) {
      Alert.alert("Recording Error", String(err));
    }
  }

  async function stopNativeRecording() {
    if (!recording) return;

    setIsProcessing(true);

    let uri: string | null = null;

    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
    } catch (err) {
      console.warn("Failed to stop recording:", err);
      Alert.alert("Recording Error", "Could not stop recording properly.");
    } finally {
      setRecording(null);

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          staysActiveInBackground: false,
          playThroughEarpieceAndroid: false,
        });
      } catch (modeErr) {
        console.warn("Audio mode reset error:", modeErr);
      }
    }

    if (!uri) {
      setIsProcessing(false);
      return;
    }

    let savedAudioPath: string | null = null;
    let savedCsvPath: string | null = null;

    try {
      const folder = FileSystem.documentDirectory + "recordings/";
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

      const timestamp = Date.now();
      savedAudioPath = `${folder}audio_${timestamp}.m4a`;
      savedCsvPath = `${folder}transcript_${timestamp}.csv`;

      await FileSystem.copyAsync({
        from: uri,
        to: savedAudioPath,
      });

      setSavedAudioUri(savedAudioPath);

      const emptyCsv = buildCsv("");
      await FileSystem.writeAsStringAsync(savedCsvPath, emptyCsv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (err) {
      console.warn("Local save error:", err);
    }

    // IMPORTANT:
    // Create pendingResult immediately so Confirm button appears on mobile.
    const immediateResult: RecorderFinishData = {
      audioUri: savedAudioPath || uri,
      text: "",
      csv: buildCsv(""),
      csvUri: savedCsvPath,
      uploadedAudioPath: null,
    };

    setPendingResult(immediateResult);
    setConfirmed(false);

    // Continue transcription in background of this function
    try {
      const formData = new FormData();

      formData.append(
        "audio",
        {
          uri,
          name: "recording.m4a",
          type: "audio/m4a",
        } as any
      );

      const { text, uploadedAudioPath } = await transcribe(formData);
      const csvContent = buildCsv(text);

      setTranscription(text);
      onPartialText?.(text);

      if (savedCsvPath) {
        try {
          await FileSystem.writeAsStringAsync(savedCsvPath, csvContent, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        } catch (csvErr) {
          console.warn("CSV rewrite error:", csvErr);
        }
      }

      const result = {
        audioUri: savedAudioPath || uri,
        text,
        csv: csvContent,
        csvUri: savedCsvPath,
        uploadedAudioPath,
      };
      setPendingResult(result);
      // Same as on web: an empty transcript still gets reported.
      if (!text) onFinish?.(result);
    } catch (err) {
      console.warn("Transcription/upload error:", err);

      // Keep pendingResult so the confirm button still shows
      Alert.alert(
        "Transcription Issue",
        "Recording was saved, but transcription could not be completed. You can still confirm and continue."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  // -----------------------------
  // PLAYBACK
  // -----------------------------
  async function playSavedAudio() {
    try {
      const audioToPlay = savedAudioUri || pendingResult?.audioUri;

      if (!audioToPlay) {
        Alert.alert("No Audio", "Record audio first.");
        return;
      }

      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioToPlay },
        { shouldPlay: true }
      );

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;

        setIsPlaying(status.isPlaying);

        if (status.didJustFinish) {
          setIsPlaying(false);
        }
      });

      setSound(newSound);
    } catch (err) {
      Alert.alert("Playback Error", String(err));
    }
  }

  async function stopPlayback() {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
    }
    setIsPlaying(false);
  }

  // -----------------------------
  // HANDLERS
  // -----------------------------
  async function handleStart() {
    if (isProcessing || active) return;

    if (Platform.OS === "web") {
      if (!(await startWebRecording())) return;
    } else {
      startNativeRecording();
    }

    onRecordingChange?.(true);
  }

  async function handleStop() {
    if (Platform.OS === "web") {
      await stopWebRecording();
    } else {
      await stopNativeRecording();
    }

    onRecordingChange?.(false);
  }

  function handleConfirm() {
    if (!pendingResult) return;

    const finalText = transcription.trim() || pendingResult.text || "";
    const finalCsv = buildCsv(finalText);

    const finalPayload: RecorderFinishData = {
      ...pendingResult,
      text: finalText,
      csv: finalCsv,
    };

    setPendingResult(finalPayload);
    setConfirmed(true);

    onFinish?.(finalPayload);
  }

  // -----------------------------
  // VISUALIZER
  // -----------------------------
  const BAR_COUNT = 7;
  const barAnims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    if (active) {
      const animations = barAnims.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 80),
            Animated.timing(anim, {
              toValue: 1,
              duration: 300 + i * 40,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.2,
              duration: 300 + i * 40,
              useNativeDriver: true,
            }),
          ])
        )
      );

      animations.forEach((a) => a.start());
      return () => animations.forEach((a) => a.stop());
    } else {
      barAnims.forEach((anim) => anim.setValue(0.3));
    }
  }, [active, barAnims]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  // Leaving the screen mid-recording in a browser: let go of the microphone.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        mediaRecorderRef.current = null;
        recorder.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      {!active ? (
        <>
          <TouchableOpacity
            style={[styles.micButton, isProcessing && styles.disabledButton]}
            onPress={handleStart}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color="#FFFFFF" />
            ) : (
              <Text style={styles.micIcon}>🎤</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helperText}>
            {isProcessing ? "Processing recording..." : "Tap to start recording"}
          </Text>
        </>
      ) : (
        <>
          <View style={styles.waveformContainer}>
            {barAnims.map((anim, i) => (
              <Animated.View
                key={i}
                style={[styles.bar, { transform: [{ scaleY: anim }] }]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
            <Text style={styles.stopIcon}>⏹</Text>
          </TouchableOpacity>

          <Text style={styles.helperText}>Tap to stop recording</Text>
        </>
      )}

      {!!(savedAudioUri || pendingResult?.audioUri) && !isPlaying && !active && (
        <TouchableOpacity style={styles.playButton} onPress={playSavedAudio}>
          <Text style={styles.playText}>▶ Play Saved Audio</Text>
        </TouchableOpacity>
      )}

      {isPlaying && (
        <TouchableOpacity style={styles.playButton} onPress={stopPlayback}>
          <Text style={styles.playText}>⏹ Stop Audio</Text>
        </TouchableOpacity>
      )}

      <View style={styles.transcriptionBox}>
        <Text style={styles.transcriptionText}>
          {transcription || pendingResult?.text || "Tap the microphone to start recording your answer"}
        </Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  micButton: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#F7A531",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    marginBottom: 12,
  },
  disabledButton: {
    opacity: 0.7,
  },
  micIcon: {
    fontSize: 42,
    color: "#FFFFFF",
  },
  stopButton: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#E74C3C",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    marginBottom: 12,
  },
  stopIcon: {
    fontSize: 38,
    color: "#FFFFFF",
  },
  helperText: {
    fontSize: 16,
    color: "#2F5BD2",
    textAlign: "center",
  },
  playButton: {
    marginTop: 12,
    backgroundColor: "#2F80ED",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  playText: {
    color: "#fff",
    fontWeight: "600",
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 60,
    gap: 5,
    marginBottom: 16,
  },
  bar: {
    width: 5,
    height: 50,
    borderRadius: 4,
    backgroundColor: "#E74C3C",
  },
  transcriptionBox: {
    width: "100%",
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B7CBF5",
    backgroundColor: "#F4F8FF",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 20,
  },
  transcriptionText: {
    textAlign: "center",
    color: "#6B7280",
    fontSize: 15,
  },
  confirmButton: {
    width: "100%",
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  confirmButtonDone: {
    backgroundColor: "#059669",
  },
  confirmButtonText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
