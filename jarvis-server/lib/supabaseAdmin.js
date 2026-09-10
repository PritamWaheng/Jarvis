function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    throw new Error("Server-side Supabase configuration is missing.");
  }

  return { url, serviceRoleKey };
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function verifySupabaseAccessToken(accessToken) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Supabase user verification failed.");
  }

  const user = await parseJsonResponse(response);

  if (!user?.id) {
    return null;
  }

  return user;
}

export async function findGmailConnection(userId) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
    select:
      "user_id,access_token_encrypted,refresh_token_encrypted,token_expires_at,created_at,updated_at",
    limit: "1",
  });
  const response = await fetch(
    `${url}/rest/v1/gmail_connections?${query.toString()}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Could not read the Gmail connection.");
  }

  const rows = await parseJsonResponse(response);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function upsertGmailConnection(connection) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/gmail_connections?on_conflict=user_id`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(connection),
    }
  );

  if (!response.ok) {
    throw new Error("Could not save the Gmail connection.");
  }
}
