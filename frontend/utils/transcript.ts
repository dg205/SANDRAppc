// Phrases speech-to-text is known to produce from a silent or very short
// recording, rather than from anything the person said.
const SILENCE_PHRASES = new Set([
  "thank you",
  "thanks",
  "thanks for watching",
  "thank you for watching",
  "you",
  "bye",
  "okay",
  "ok",
]);

// Whether a voice answer came back too thin to use, so the person should
// record again (or type their answer). Real answers are kept even if short,
// like "Phone calls." or "Weekends".
export function needsRetry(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^a-z' ]/g, " ")
    .split(/\s+/)
    .filter((w) => /[a-z]/.test(w));
  if (words.length === 0) return true;
  if (SILENCE_PHRASES.has(words.join(" "))) return true;
  // "No" is a fair answer to "Is there anything else we should consider?"
  return words.length === 1 && words[0].length < 3 && words[0] !== "no";
}

export const RETRY_MESSAGE =
  "We didn't catch that. Tap the microphone and try again, or type your answer in the box.";
