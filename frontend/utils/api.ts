import { Platform } from "react-native";
import { ensureFreshToken, expireSession } from "./auth";

// Priority order:
//  1. EXPO_PUBLIC_API_URL in your .env file (set this for production/cloud)
//  2. Fallback to localhost for web, or LAN IP for Android/iOS dev
const CLOUD_URL = process.env.EXPO_PUBLIC_API_URL;

// Only needed for local development (not used when EXPO_PUBLIC_API_URL is set)
const LAN_IP = process.env.EXPO_PUBLIC_LAN_IP || "192.168.86.30";

export const BASE_URL: string = CLOUD_URL
  ? CLOUD_URL
  : Platform.OS === "android" || Platform.OS === "ios"
    ? `http://${LAN_IP}:5000`
    : "http://127.0.0.1:5000";

console.log("BASE_URL ACTUALLY USED =", BASE_URL);

// Attaches a fresh Supabase access token to a backend request.
export async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await ensureFreshToken();
  if (!token) {
    throw new Error("Not signed in");
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...(options.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  // The backend only answers 401 for a missing, expired or invalid token.
  if (res.status === 401) {
    await expireSession();
  }
  return res;
}

export async function checkHealth(): Promise<{ status: string }> {
  console.log("Checking health at:", `${BASE_URL}/health`);

  const res = await fetch(`${BASE_URL}/health`);
  const text = await res.text();

  console.log("Health status =", res.status);
  console.log("Health raw body =", text);

  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status} ${text}`);
  }

  return JSON.parse(text);
}

export async function getTopMatches(
  targetUser: Record<string, any>,
  candidates: Record<string, any>[],
): Promise<{ matches: any[]; total_candidates: number }> {
  console.log("Posting matches to:", `${BASE_URL}/api/match`);

  // Matching works signed out too; signed in, the backend also leaves out
  // anyone on either side of a block.
  const token = await ensureFreshToken();
  const res = await fetch(`${BASE_URL}/api/match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ targetUser, candidates }),
  });

  const text = await res.text();

  console.log("Match status =", res.status);
  console.log("Match raw body =", text);

  if (!res.ok) {
    throw new Error(`Match request failed (${res.status}): ${text}`);
  }

  return JSON.parse(text);
}

export type Match = {
  name: string;
  age: number;
  location: string;
  score: number;
  userType?: string;
  candidate?: Record<string, any>;
  features?: Record<string, any>;
  [key: string]: any;
};

// /api/match nests each person under `candidate`; lift the fields the
// screens display to the top level.
export function normalizeMatches(raw: Record<string, any>[]): Match[] {
  return raw.map((m) => ({
    ...m,
    id: m.id ?? m.candidate?.id,
    name: m.name ?? m.candidate?.name ?? "Unknown",
    age: m.age ?? m.candidate?.age ?? 0,
    location: m.location ?? m.candidate?.location ?? "",
    score: m.score ?? 0,
    userType: m.userType ?? m.candidate?.userType ?? "",
    photoUrl: m.photoUrl ?? m.candidate?.photoUrl,
  }));
}

// "music", "music and gardening", "music, art and gardening"
function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// One line on why two people were matched, built from the backend's
// feature breakdown: "You both enjoy music and live near each other."
// Uses the two strongest reasons it can find; "" if there are none.
export function matchReason(m: Match): string {
  const f = m.features ?? {};
  const words = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const interests = words(f.shared_interests);
  const values = words(f.shared_values);
  // Almost everyone speaks English, so it isn't worth calling out.
  const languages = words(f.shared_languages).filter((l) => l.toLowerCase() !== "english");

  const reasons: string[] = [];
  if (interests.length) reasons.push(`both enjoy ${joinWords(interests.slice(0, 2))}`);
  if (f.same_city) reasons.push("live near each other");
  if (values.length) reasons.push(`both value ${joinWords(values.slice(0, 2))}`);
  if (languages.length) reasons.push(`both speak ${joinWords(languages.slice(0, 2).map(cap))}`);
  if (f.shared_faith) reasons.push("share the same faith");

  if (!reasons.length) return "";
  return `You ${reasons.slice(0, 2).join(" and ")}.`;
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// The signed-in user's saved profile, or null if they haven't made one yet.
export async function getMyProfile(): Promise<Record<string, any> | null> {
  const res = await authFetch(`/api/users/me`);
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Load profile failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

export async function addUser(
  userData: Record<string, any>,
): Promise<{ status: string; userId: string }> {
  console.log("Posting user to:", `${BASE_URL}/api/users`);

  const res = await authFetch(`/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });

  const text = await res.text();

  console.log("Add user status =", res.status);
  console.log("Add user raw body =", text);

  if (!res.ok) {
    throw new Error(`Add user failed (${res.status}): ${text}`);
  }

  return JSON.parse(text);
}

// People are told apart by id (two can share a name). The other_* and
// sent_by_me fields are worked out by the server relative to the caller.
export type ConnectionRequest = {
  id: number;
  from_user_id?: number;
  to_user_id?: number;
  from_user_name: string;
  to_user_name: string;
  other_user_id?: number;
  other_user_name?: string;
  other_user_photo?: string | null;
  sent_by_me?: boolean;
  proposed_day: string;
  proposed_time: string;
  message: string;
  status: "pending" | "accepted" | "rejected" | string;
  created_at: string;
  from_user_photo?: string | null;
  to_user_photo?: string | null;
  meetup?: Meetup;
};

// When and where two connected people plan to meet. `updated_by` suggested
// the current plan; the other person confirms it.
export type Meetup = {
  day: string;
  time: string;
  place: string;
  status: "proposed" | "confirmed";
  updated_by: string;
  updated_by_me?: boolean;
};

export async function getMeetup(connectionId: number): Promise<Meetup> {
  return (await sendJson(`/api/connect/${connectionId}/meetup`, "GET")).meetup;
}

export async function updateMeetup(
  connectionId: number,
  plan: { day: string; time: string; place: string },
): Promise<Meetup> {
  return (await sendJson(`/api/connect/${connectionId}/meetup`, "PUT", plan)).meetup;
}

export async function confirmMeetup(connectionId: number): Promise<Meetup> {
  return (await sendJson(`/api/connect/${connectionId}/meetup/confirm`, "POST")).meetup;
}

// "Tuesday · 2:00 PM · Library"
export function describeMeetup(m: Pick<Meetup, "day" | "time" | "place">): string {
  return [m.day, m.time, m.place].filter(Boolean).join(" · ");
}

export async function sendConnectRequest(request: {
  to_user_id?: number;
  to_user_name: string;
  proposed_day: string;
  proposed_time: string;
  message?: string;
}): Promise<{ status: string; request_id: number }> {
  console.log("Sending connect request to:", `${BASE_URL}/api/connect`);

  const res = await authFetch(`/api/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const text = await res.text();
  console.log("Send connect request status =", res.status);

  if (!res.ok) {
    throw new Error(serverErrorMessage(text));
  }

  return JSON.parse(text);
}

export type Relation =
  | { status: "connected" | "sent" | "received"; request: ConnectionRequest }
  | { status: "none" };

// The other person on one of my requests. The server works this out by id;
// comparing names is only a fallback for an older server.
export function otherPerson(
  r: ConnectionRequest,
  me: string,
): { id?: number; name: string; photo?: string | null } {
  if (r.other_user_name !== undefined) {
    return { id: r.other_user_id, name: r.other_user_name, photo: r.other_user_photo };
  }
  return r.from_user_name === me
    ? { id: r.to_user_id, name: r.to_user_name, photo: r.to_user_photo }
    : { id: r.from_user_id, name: r.from_user_name, photo: r.from_user_photo };
}

// Where I stand with the person whose candidate id is `otherId`, from a list
// of my requests (direction=all).
export function relationWith(
  requests: ConnectionRequest[],
  otherId: number | undefined,
): Relation {
  if (otherId === undefined) return { status: "none" };
  const between = requests.filter((r) => r.other_user_id === otherId);
  const accepted = between.find((r) => r.status === "accepted");
  if (accepted) return { status: "connected", request: accepted };
  const pending = between.find((r) => r.status === "pending");
  if (pending) {
    return { status: pending.sent_by_me ? "sent" : "received", request: pending };
  }
  return { status: "none" };
}

// received = requests sent to this user, sent = requests they made, all = both.
export async function getConnectRequests(
  userName: string,
  direction: "received" | "sent" | "all" = "received",
): Promise<ConnectionRequest[]> {
  const path = `/api/connect/${encodeURIComponent(userName)}?direction=${direction}`;
  console.log("Fetching connect requests from:", `${BASE_URL}${path}`);

  const res = await authFetch(path);
  const text = await res.text();
  console.log("Get connect requests status =", res.status);

  if (!res.ok) {
    throw new Error(`Load requests failed (${res.status}): ${text}`);
  }

  return JSON.parse(text).requests ?? [];
}

export type ChatMessage = {
  id: number;
  sender_id?: number;
  sender_name: string;
  mine?: boolean;
  body: string;
  created_at: string;
};

// The server replies {"error": "..."}; show just the message to the user.
function serverErrorMessage(text: string): string {
  try {
    return JSON.parse(text).error ?? text;
  } catch {
    return text;
  }
}

// sender_name is derived server-side from the caller's token, not sent here.
export async function sendMessage(
  connectionId: number,
  body: string,
): Promise<{ status: string; message_id: number; created_at: string }> {
  const res = await authFetch(`/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection_id: connectionId, body }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(serverErrorMessage(text));
  }
  return JSON.parse(text);
}

// Pass the id of the newest message you already have to fetch only newer ones.
export async function getMessages(
  connectionId: number,
  sinceId = 0,
): Promise<ChatMessage[]> {
  const res = await authFetch(
    `/api/messages/${connectionId}?since_id=${sinceId}`,
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(serverErrorMessage(text));
  }
  return JSON.parse(text).messages ?? [];
}

export async function respondToConnectRequest(
  requestId: number,
  status: "accepted" | "rejected",
): Promise<void> {
  const res = await authFetch(`/api/connect/${requestId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  console.log("Respond to connect request status =", res.status);

  if (!res.ok) {
    throw new Error(`Respond failed (${res.status}): ${await res.text()}`);
  }
}

// ── Safety ────────────────────────────────────────────────────────────────────

// Shared by the small JSON calls below: throw the server's message on failure.
async function sendJson(path: string, method: string, body?: unknown) {
  const res = await authFetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(serverErrorMessage(text));
  }
  return text ? JSON.parse(text) : {};
}

// Ends the connection for both people; either of them can send a new request later.
export async function removeConnection(connectionId: number): Promise<void> {
  await sendJson(`/api/connect/${connectionId}/remove`, "POST");
}

export type Person = { id?: number; name: string };

// Someone to block or report: by id when we have it, else by name.
function personBody(person: Person) {
  return person.id !== undefined ? { user_id: person.id } : { user_name: person.name };
}

// Also ends any connection or request between the two of you.
export async function blockUser(person: Person): Promise<void> {
  await sendJson(`/api/blocks`, "POST", personBody(person));
}

export async function unblockUser(userId: number): Promise<void> {
  await sendJson(`/api/blocks/${userId}`, "DELETE");
}

export async function getBlockedUsers(): Promise<{ id: number; name: string }[]> {
  const data = await sendJson(`/api/blocks`, "GET");
  return (data.blocks ?? []).map((b: { user_id: number; user_name: string }) => ({
    id: b.user_id,
    name: b.user_name,
  }));
}

export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate", label: "Inappropriate messages" },
  { value: "scam", label: "Asking for money or a scam" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "safety", label: "I feel unsafe" },
  { value: "other", label: "Something else" },
] as const;

// Reporting also blocks the person.
export async function reportUser(
  person: Person,
  report: { reason: string; details?: string; connection_id?: number },
): Promise<void> {
  await sendJson(`/api/reports`, "POST", { ...personBody(person), ...report });
}

// ── Account ───────────────────────────────────────────────────────────────────

// `asset` is a result from expo-image-picker. Returns the new photo's URL.
export async function uploadProfilePhoto(asset: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  file?: Blob;
}): Promise<string> {
  const type = asset.mimeType ?? "image/jpeg";
  const form = new FormData();
  if (Platform.OS === "web") {
    form.append("photo", asset.file ?? (await (await fetch(asset.uri)).blob()), asset.fileName ?? "photo");
  } else {
    form.append("photo", { uri: asset.uri, name: asset.fileName ?? "photo.jpg", type } as any);
  }
  const res = await authFetch(`/api/users/me/photo`, { method: "POST", body: form });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(serverErrorMessage(text));
  }
  return JSON.parse(text).photoUrl;
}

export async function deleteProfilePhoto(): Promise<void> {
  await sendJson(`/api/users/me/photo`, "DELETE");
}

// Permanently deletes the account and everything tied to it, including the login.
export async function deleteAccount(): Promise<void> {
  await sendJson(`/api/users/me`, "DELETE");
}
