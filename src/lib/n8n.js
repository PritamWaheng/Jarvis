import { supabase } from "./supabase";

const configuredServerUrl = import.meta.env.VITE_JARVIS_SERVER_URL?.trim();
const JARVIS_SERVER_URL = (
  configuredServerUrl || (import.meta.env.DEV ? "http://localhost:3001" : "")
).replace(/\/$/, "");

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  console.debug("[JARVIS auth] session present:", Boolean(session));
  console.debug(
    "[JARVIS auth] access token present:",
    Boolean(session?.access_token)
  );

  if (!session) {
    const error = new Error("You are not logged in.");
    error.status = 401;
    throw error;
  }

  return session.access_token;
}

async function requestJarvis(path, options = {}) {
  if (!JARVIS_SERVER_URL) {
    throw new Error("VITE_JARVIS_SERVER_URL is not configured.");
  }

  const accessToken = await getAccessToken();
  console.debug("[JARVIS request]", options.method || "GET", path, "auth: present");

  const response = await fetch(`${JARVIS_SERVER_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    const error = new Error(responseBody?.error || `JARVIS server returned ${response.status}`);
    error.status = response.status;
    error.serverSource = responseBody?.source;
    throw error;
  }

  return response.json();
}

export async function sendToJarvis(message, signal) {
  return requestJarvis("/api/jarvis", {
    method: "POST",
    body: JSON.stringify({
      chatInput: message,
    }),
    signal,
  });
}

export async function pollJarvisResult(requestId, signal) {
  return requestJarvis(
    `/api/jarvis/result/${encodeURIComponent(requestId)}`,
    { method: "GET", signal }
  );
}

export async function cancelJarvisRequest(requestId, signal) {
  return requestJarvis(
    `/api/jarvis/cancel/${encodeURIComponent(requestId)}`,
    { method: "POST", signal }
  );
}
