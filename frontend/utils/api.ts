import { Platform } from "react-native";

// Priority order:
//  1. EXPO_PUBLIC_API_URL in your .env file (set this for production/cloud)
//  2. Fallback to localhost for web, or LAN IP for Android/iOS dev
const CLOUD_URL = process.env.EXPO_PUBLIC_API_URL;

// Only needed for local development (not used when EXPO_PUBLIC_API_URL is set)
const LAN_IP = process.env.EXPO_PUBLIC_LAN_IP || "192.168.86.30";

export const BASE_URL: string =
  CLOUD_URL
    ? CLOUD_URL
    : Platform.OS === "android" || Platform.OS === "ios"
    ? `http://${LAN_IP}:5000`
    : "http://127.0.0.1:5000";

console.log("BASE_URL ACTUALLY USED =", BASE_URL);

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
  candidates: Record<string, any>[]
): Promise<{ matches: any[]; total_candidates: number }> {
  console.log("Posting matches to:", `${BASE_URL}/api/match`);

  const res = await fetch(`${BASE_URL}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

export async function addUser(
  userData: Record<string, any>
): Promise<{ status: string; userId: string }> {
  console.log("Posting user to:", `${BASE_URL}/api/users`);

  const res = await fetch(`${BASE_URL}/api/users`, {
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
};

export async function sendConnectRequest(request: {
  from_user_name: string;
  to_user_name: string;
  proposed_day: string;
  proposed_time: string;
  message?: string;
}): Promise<{ status: string; request_id: number }> {
  console.log("Sending connect request to:", `${BASE_URL}/api/connect`);

  const res = await fetch(`${BASE_URL}/api/connect`, {
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
  direction: "received" | "sent" | "all" = "received"
): Promise<ConnectionRequest[]> {
  const url = `${BASE_URL}/api/connect/${encodeURIComponent(userName)}?direction=${direction}`;
  console.log("Fetching connect requests from:", url);

  const res = await fetch(url);
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

export async function sendMessage(
  connectionId: number,
  senderName: string,
  body: string
): Promise<{ status: string; message_id: number; created_at: string }> {
  const res = await fetch(`${BASE_URL}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connection_id: connectionId,
      sender_name: senderName,
      body,
    }),
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
  userName: string,
  sinceId = 0
): Promise<ChatMessage[]> {
  const url = `${BASE_URL}/api/messages/${connectionId}?user_name=${encodeURIComponent(userName)}&since_id=${sinceId}`;

  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(serverErrorMessage(text));
  }
  return JSON.parse(text).messages ?? [];
}

export async function respondToConnectRequest(
  requestId: number,
  status: "accepted" | "rejected"
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/connect/${requestId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  console.log("Respond to connect request status =", res.status);

  if (!res.ok) {
    throw new Error(`Respond failed (${res.status}): ${await res.text()}`);
  }
}
