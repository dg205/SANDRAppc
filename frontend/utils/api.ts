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
    name: m.name ?? m.candidate?.name ?? "Unknown",
    age: m.age ?? m.candidate?.age ?? 0,
    location: m.location ?? m.candidate?.location ?? "",
    score: m.score ?? 0,
    userType: m.userType ?? m.candidate?.userType ?? "",
    photoUrl: m.photoUrl ?? m.candidate?.photoUrl,
  }));
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

export type ConnectionRequest = {
  id: number;
  from_user_name: string;
  to_user_name: string;
  proposed_day: string;
  proposed_time: string;
  message: string;
  status: "pending" | "accepted" | "rejected" | string;
  created_at: string;
  from_user_photo?: string | null;
  to_user_photo?: string | null;
};

export async function sendConnectRequest(request: {
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
    throw new Error(`Send request failed (${res.status}): ${text}`);
  }

  return JSON.parse(text);
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
  sender_name: string;
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

// Also ends any connection or request between the two of you.
export async function blockUser(userName: string): Promise<void> {
  await sendJson(`/api/blocks`, "POST", { user_name: userName });
}

export async function unblockUser(userName: string): Promise<void> {
  await sendJson(`/api/blocks/${encodeURIComponent(userName)}`, "DELETE");
}

export async function getBlockedUsers(): Promise<string[]> {
  const data = await sendJson(`/api/blocks`, "GET");
  return (data.blocks ?? []).map((b: { user_name: string }) => b.user_name);
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
export async function reportUser(report: {
  user_name: string;
  reason: string;
  details?: string;
  connection_id?: number;
}): Promise<void> {
  await sendJson(`/api/reports`, "POST", report);
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
