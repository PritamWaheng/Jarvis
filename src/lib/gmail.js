import { supabase } from "./supabase";

export async function saveGoogleProviderCredentials(session, expectedUserId) {
  const providerToken = session?.provider_token;

  if (!providerToken) {
    return { saved: false };
  }

  const {
    data: { session: currentSession },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!currentSession?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (expectedUserId && user.id !== expectedUserId) {
    const error = new Error(
      "Please connect the Google account associated with this JARVIS account."
    );
    error.code = "gmail_user_mismatch";
    throw error;
  }

  const googleIdentity = user.identities?.some(
    (identity) => identity.provider === "google"
  );

  if (!googleIdentity) {
    throw new Error("Link your Google account before connecting Gmail.");
  }

  const serverUrl = import.meta.env.VITE_JARVIS_SERVER_URL?.replace(/\/$/, "");

  if (!serverUrl) {
    throw new Error("JARVIS server URL is not configured.");
  }

  const body = {
    providerToken,
  };

  if (session.provider_refresh_token) {
    body.providerRefreshToken = session.provider_refresh_token;
  }

  if (session.provider_token_expires_at || session.provider_expires_at) {
    body.expiresAt =
      session.provider_token_expires_at || session.provider_expires_at;
  }

  const response = await fetch(`${serverUrl}/api/gmail/connect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${currentSession.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    if (response.status === 403) {
      throw new Error("Link your Google account before connecting Gmail.");
    }

    if (response.status === 400) {
      throw new Error("The Gmail connection details were invalid.");
    }

    if (response.status >= 500) {
      throw new Error("The Gmail connection server is unavailable.");
    }

    throw new Error("Could not connect Gmail.");
  }

  const result = await response.json().catch(() => null);

  if (!result?.success || !result.gmailConnected) {
    throw new Error("The Gmail connection was not completed.");
  }

  return { saved: true };
}

export async function fetchGmailMessages() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.access_token) {
    const error = new Error("Your session has expired. Please sign in again.");
    error.status = 401;
    throw error;
  }

  const serverUrl = import.meta.env.VITE_JARVIS_SERVER_URL?.replace(/\/$/, "");

  if (!serverUrl) {
    throw new Error("JARVIS server URL is not configured.");
  }

  const response = await fetch(`${serverUrl}/api/gmail/messages`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    const error = new Error(
      response.status === 404
        ? "Gmail is not connected."
        : response.status === 401
          ? "Your Gmail session has expired. Please reconnect Gmail."
          : response.status === 403
            ? "Gmail access was denied."
            : "Could not load Gmail messages."
    );
    error.status = response.status;
    throw error;
  }

  const result = await response.json();

  if (!result?.success || !Array.isArray(result.messages)) {
    throw new Error("Gmail returned an invalid response.");
  }

  return result.messages;
}
