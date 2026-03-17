export const BASE_URL =
  (process.env.EXPO_PUBLIC_API_BASE?.trim()) ?? "http://127.0.0.1:5000";

export async function checkHealth(): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function getTopMatches(
  targetUser: Record<string, any>,
  candidates: Record<string, any>[]
): Promise<{ matches: any[]; total_candidates: number }> {
  const res = await fetch(`${BASE_URL}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUser, candidates }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Match request failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function addUser(
  userData: Record<string, any>
): Promise<{ status: string; userId: string }> {
  const res = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Add user failed (${res.status}): ${text}`);
  }
  return res.json();
}
