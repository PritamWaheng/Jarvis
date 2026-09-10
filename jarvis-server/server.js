import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { google } from "googleapis";
import {
  findGmailConnection,
  upsertGmailConnection,
  verifySupabaseAccessToken,
} from "./lib/supabaseAdmin.js";
import { decryptToken, encryptToken } from "./lib/gmailTokens.js";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";
const configuredN8nBaseUrl = process.env.N8N_BASE_URL?.trim();
const N8N_BASE_URL = (
  configuredN8nBaseUrl || (isProduction ? "" : "http://localhost:5678")
).replace(
  /\/$/,
  ""
);
const N8N_API_KEY = process.env.N8N_API_KEY;
const FRONTEND_URL = (
  process.env.FRONTEND_URL?.trim() ||
  (isProduction ? "" : "http://localhost:5173")
).replace(/\/$/, "");

if (isProduction) {
  const missingProductionVariables = [
    "N8N_API_KEY",
    "N8N_BASE_URL",
    "FRONTEND_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GMAIL_TOKEN_ENCRYPTION_KEY",
  ].filter((name) => !process.env[name]?.trim());

  if (missingProductionVariables.length > 0) {
    console.error(
      `❌ Missing production environment variables: ${missingProductionVariables.join(", ")}`
    );
    process.exit(1);
  }
}

if (!N8N_API_KEY) {
  console.error("❌ N8N_API_KEY is missing from .env");
  process.exit(1);
}

if (!N8N_BASE_URL) {
  console.error("❌ N8N_BASE_URL is required in production.");
  process.exit(1);
}

if (!FRONTEND_URL) {
  console.error("❌ FRONTEND_URL is required in production.");
  process.exit(1);
}

app.use(
  cors({
    origin: FRONTEND_URL,
  })
);

app.use(express.json());

/*
  Temporary in-memory request store.

  requestId -> {
    executionId,
    accessToken,
    createdAt
  }

  This is intentionally simple for local development.
  Later we can move this to a persistent store if needed.
*/
const requests = new Map();

function createRequestId() {
  return crypto.randomBytes(24).toString("hex");
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7);
}

function cleanupRequests() {
  const maxAge = 60 * 60 * 1000;
  const now = Date.now();

  for (const [requestId, request] of requests.entries()) {
    if (now - request.createdAt > maxAge) {
      requests.delete(requestId);
    }
  }
}

setInterval(cleanupRequests, 10 * 60 * 1000);

function parseExpiresAt(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value < 1e12 ? value * 1000 : value);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "";

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth server configuration is missing.");
  }

  return { clientId, clientSecret, redirectUri };
}

function getGoogleErrorStatus(error) {
  return error?.response?.status || error?.code || null;
}

function getSafeGoogleErrorDetails(error) {
  const apiError =
    typeof error?.response?.data?.error === "object"
      ? error.response.data.error
      : null;
  const reason = Array.isArray(apiError?.errors)
    ? apiError.errors.find((item) => typeof item?.reason === "string")?.reason
    : undefined;
  const googleCode =
    typeof apiError?.code === "number"
      ? apiError.code
      : typeof error?.response?.status === "number"
        ? error.response.status
        : null;

  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    httpStatus:
      typeof error?.response?.status === "number"
        ? error.response.status
        : null,
    googleCode,
    googleMessage:
      typeof apiError?.message === "string"
        ? apiError.message.slice(0, 240)
        : null,
    googleReason: reason || null,
  };
}

function getHeader(headers, name) {
  return (
    headers?.find((header) => header.name?.toLowerCase() === name) || null
  )?.value || "";
}

function decodeGmailBody(data) {
  if (!data) {
    return "";
  }

  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function findPlainTextPart(payload) {
  if (!payload) {
    return "";
  }

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeGmailBody(payload.body.data);
  }

  for (const part of payload.parts || []) {
    const result = findPlainTextPart(part);

    if (result) {
      return result;
    }
  }

  return "";
}

function normalizePreview(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function formatGmailMessage(message) {
  const headers = message.payload?.headers || [];
  const plainText = findPlainTextPart(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    from: getHeader(headers, "from"),
    to: getHeader(headers, "to"),
    subject: getHeader(headers, "subject"),
    date: getHeader(headers, "date"),
    snippet: normalizePreview(message.snippet || ""),
    preview: normalizePreview(plainText || message.snippet || ""),
  };
}

function createGmailClient(connection) {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const accessToken = decryptToken(connection.access_token_encrypted);
  const refreshToken = connection.refresh_token_encrypted
    ? decryptToken(connection.refresh_token_encrypted)
    : null;
  const expiryDate = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : undefined;

  if (!accessToken) {
    throw new Error("Stored Gmail access token is unavailable.");
  }

  if (expiryDate !== undefined && Number.isNaN(expiryDate)) {
    throw new Error("Stored Gmail token expiry is invalid.");
  }

  const auth = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  auth.setCredentials({
    access_token: accessToken,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    ...(expiryDate ? { expiry_date: expiryDate } : {}),
  });

  return { auth, refreshToken, expiryDate };
}

async function refreshGmailAccessToken(gmailClient) {
  if (!gmailClient.refreshToken) {
    return null;
  }

  const { token } = await gmailClient.auth.getAccessToken();

  return token || gmailClient.auth.credentials.access_token || null;
}

async function persistRefreshedAccessToken(userId, connection, auth) {
  const accessToken = auth.credentials.access_token;

  if (!accessToken) {
    return;
  }

  await upsertGmailConnection({
    user_id: userId,
    access_token_encrypted: encryptToken(accessToken),
    refresh_token_encrypted: connection.refresh_token_encrypted || null,
    token_expires_at: auth.credentials.expiry_date
      ? new Date(auth.credentials.expiry_date).toISOString()
      : connection.token_expires_at || null,
    created_at: connection.created_at,
    updated_at: new Date().toISOString(),
  });
}

async function listGmailMessages(
  gmail,
  retryWithRefresh,
  searchQuery,
  maxResults
) {
  try {
    const listOptions = {
      userId: "me",
      maxResults,
    };

    if (searchQuery) {
      listOptions.q = searchQuery;
    }

    const result = await gmail.users.messages.list(listOptions);

    return result.data.messages || [];
  } catch (error) {
    if (!retryWithRefresh || getGoogleErrorStatus(error) !== 401) {
      throw error;
    }

    throw Object.assign(error, { gmailTokenRefreshRequired: true });
  }
}

/*
  Store per-user Google credentials only after Supabase verifies the caller.
  The service-role credential and encrypted token values never leave this server.
*/
app.post("/api/gmail/connect", async (req, res) => {
  try {
    const accessToken = getBearerToken(req);
    const { providerToken, providerRefreshToken, expiresAt } = req.body || {};

    if (!accessToken) {
      return res.status(401).json({
        error: "Missing Supabase access token.",
      });
    }

    if (typeof providerToken !== "string" || !providerToken.trim()) {
      return res.status(400).json({
        error: "providerToken is required.",
      });
    }

    if (
      providerRefreshToken !== undefined &&
      (typeof providerRefreshToken !== "string" || !providerRefreshToken.trim())
    ) {
      return res.status(400).json({
        error: "providerRefreshToken must be a non-empty string when supplied.",
      });
    }

    const parsedExpiresAt =
      expiresAt === undefined ? null : parseExpiresAt(expiresAt);

    if (expiresAt !== undefined && !parsedExpiresAt) {
      return res.status(400).json({
        error: "expiresAt must be a valid timestamp.",
      });
    }

    const user = await verifySupabaseAccessToken(accessToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid Supabase access token.",
      });
    }

    const hasGoogleIdentity = Array.isArray(user.identities)
      ? user.identities.some((identity) => identity.provider === "google")
      : false;

    if (!hasGoogleIdentity) {
      return res.status(403).json({
        error: "A linked Google identity is required.",
      });
    }

    const existingConnection = await findGmailConnection(user.id);
    const now = new Date().toISOString();
    const connection = {
      user_id: user.id,
      access_token_encrypted: encryptToken(providerToken),
      refresh_token_encrypted:
        providerRefreshToken === undefined
          ? existingConnection?.refresh_token_encrypted || null
          : encryptToken(providerRefreshToken),
      token_expires_at: parsedExpiresAt,
      updated_at: now,
    };

    if (!existingConnection) {
      connection.created_at = now;
    } else {
      connection.created_at = existingConnection.created_at;
    }

    await upsertGmailConnection(connection);

    return res.json({
      success: true,
      gmailConnected: true,
    });
  } catch (error) {
    console.error("Gmail connection error:", error.message);

    return res.status(500).json({
      error: "Could not save the Gmail connection.",
    });
  }
});

/*
  Read the authenticated user's Gmail messages.

  React -> this server -> Supabase connection row -> Gmail API
*/
app.get("/api/gmail/messages", async (req, res) => {
  let phase = "request";

  try {
    const searchQuery =
      typeof req.query.q === "string" ? req.query.q.trim() : "";
    const requestedMaxResults = req.query.maxResults;
    const maxResults =
      requestedMaxResults === undefined
        ? 10
        : Number(requestedMaxResults);

    if (
      (req.query.q !== undefined && typeof req.query.q !== "string") ||
      searchQuery.length > 200
    ) {
      return res.status(400).json({
        error: "Invalid Gmail search query.",
      });
    }

    if (
      requestedMaxResults !== undefined &&
      (typeof requestedMaxResults !== "string" ||
        !Number.isInteger(maxResults) ||
        maxResults < 1 ||
        maxResults > 20)
    ) {
      return res.status(400).json({
        error: "maxResults must be an integer between 1 and 20.",
      });
    }

    const accessToken = getBearerToken(req);

    if (!accessToken) {
      return res.status(401).json({
        error: "Missing Supabase access token.",
      });
    }

    phase = "supabase.verify";
    const user = await verifySupabaseAccessToken(accessToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid Supabase access token.",
      });
    }

    phase = "supabase.connection.lookup";
    const connection = await findGmailConnection(user.id);

    if (!connection?.access_token_encrypted) {
      return res.status(404).json({
        error: "Gmail is not connected.",
      });
    }

    phase = "gmail.oauth.client";
    const gmailClient = createGmailClient(connection);
    let accessTokenRefreshed = false;

    if (
      gmailClient.refreshToken &&
      (!gmailClient.expiryDate || gmailClient.expiryDate <= Date.now() + 60_000)
    ) {
      phase = "gmail.token.refresh";
      await refreshGmailAccessToken(gmailClient);
      accessTokenRefreshed = true;
    }

    const gmail = google.gmail({
      version: "v1",
      auth: gmailClient.auth,
    });
    let messageSummaries;

    try {
      phase = "gmail.messages.list";
      messageSummaries = await listGmailMessages(
        gmail,
        Boolean(gmailClient.refreshToken),
        searchQuery,
        maxResults
      );
    } catch (error) {
      if (!error.gmailTokenRefreshRequired) {
        throw error;
      }

      phase = "gmail.token.refresh";
      await refreshGmailAccessToken(gmailClient);
      accessTokenRefreshed = true;
      phase = "gmail.messages.list.retry";
      messageSummaries = await listGmailMessages(
        gmail,
        false,
        searchQuery,
        maxResults
      );
    }

    if (accessTokenRefreshed) {
      phase = "supabase.connection.update";
      await persistRefreshedAccessToken(user.id, connection, gmailClient.auth);
    }

    phase = "gmail.messages.get";
    const messages = await Promise.all(
      messageSummaries.map(async ({ id }) => {
        const result = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "full",
        });

        return formatGmailMessage(result.data);
      })
    );

    return res.json({
      success: true,
      messages,
    });
  } catch (error) {
    const googleStatus = getGoogleErrorStatus(error);
    const diagnostic = getSafeGoogleErrorDetails(error);

    console.error("Gmail messages diagnostic:", {
      phase,
      ...diagnostic,
      status:
        typeof googleStatus === "number" ? googleStatus : diagnostic.httpStatus,
    });

    if (googleStatus === 400 || googleStatus === 401) {
      return res.status(401).json({
        error: "Gmail authorization is invalid or expired.",
      });
    }

    if (googleStatus === 403) {
      return res.status(403).json({
        error: "Gmail access was denied.",
      });
    }

    return res.status(500).json({
      error: "Could not read Gmail messages.",
    });
  }
});

/*
  Start a JARVIS request.

  React -> this server -> n8n webhook
*/
app.post("/api/jarvis", async (req, res) => {
  try {
    const accessToken = getBearerToken(req);
    console.log(
      "[JARVIS auth] /api/jarvis bearer token present:",
      Boolean(accessToken)
    );
    const { chatInput } = req.body || {};

    if (!accessToken) {
      return res.status(401).json({
        error: "Missing Supabase access token.",
      });
    }

    if (!chatInput || typeof chatInput !== "string") {
      return res.status(400).json({
        error: "chatInput is required.",
      });
    }

    const n8nResponse = await fetch(`${N8N_BASE_URL}/webhook/JARVIS`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        chatInput,
      }),
    });

    const responseText = await n8nResponse.text();

    console.log(
      "[JARVIS auth] n8n /webhook/JARVIS response status:",
      n8nResponse.status
    );

    if (!n8nResponse.ok) {
      console.error("n8n start error status:", n8nResponse.status);

      return res.status(n8nResponse.status).json({
        error:
          n8nResponse.status === 401
            ? "n8n rejected the forwarded Supabase token."
            : "n8n webhook request failed.",
        source: "n8n",
      });
    }

    let n8nData;

    try {
      n8nData = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        error: "n8n returned invalid JSON.",
      });
    }

    const executionId = n8nData?.executionId;

    if (!executionId) {
      return res.status(502).json({
        error: "n8n did not return an executionId.",
      });
    }

    const requestId = createRequestId();

    requests.set(requestId, {
      executionId: String(executionId),
      accessToken,
      createdAt: Date.now(),
    });

    console.log(
      `▶️ Started JARVIS request ${requestId} → execution ${executionId}`
    );

    return res.json({
      requestId,
      executionId: String(executionId),
    });
  } catch (error) {
    console.error("Start JARVIS error:", error);

    return res.status(500).json({
      error: "Failed to start JARVIS.",
    });
  }
});

/*
  Get the current state/result of a JARVIS execution.

  React polls this endpoint.
*/
app.get("/api/jarvis/result/:requestId", async (req, res) => {
  try {
    const accessToken = getBearerToken(req);
    const request = requests.get(req.params.requestId);

    if (!accessToken) {
      return res.status(401).json({
        error: "Missing Supabase access token.",
      });
    }

    if (!request) {
      return res.status(404).json({
        error: "JARVIS request not found.",
      });
    }

    if (request.accessToken !== accessToken) {
      return res.status(403).json({
        error: "You cannot access this JARVIS request.",
      });
    }

    const response = await fetch(
      `${N8N_BASE_URL}/api/v1/executions/${encodeURIComponent(
        request.executionId
      )}?includeData=true`,
      {
        method: "GET",
        headers: {
          "X-N8N-API-KEY": N8N_API_KEY,
          Accept: "application/json",
        },
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error("n8n execution lookup error status:", response.status);

      return res.status(response.status === 401 ? 502 : response.status).json({
        error:
          response.status === 401
            ? "n8n execution API authentication failed. Check N8N_API_KEY on the server."
            : "Could not read n8n execution.",
        source: "n8n-api",
      });
    }

    const execution = JSON.parse(responseText);

    const status = execution.status;

    /*
      n8n execution statuses can include:
      new, running, success, error, canceled, waiting
    */

    if (status === "running" || status === "waiting") {
      return res.json({
        status,
        executionId: request.executionId,
      });
    }

    if (status === "canceled" || status === "cancelled") {
      requests.delete(req.params.requestId);

      return res.json({
        status: "cancelled",
        executionId: request.executionId,
      });
    }

    if (status === "error") {
      requests.delete(req.params.requestId);

      return res.json({
        status: "error",
        executionId: request.executionId,
        error: execution.data?.resultData?.error?.message || "JARVIS failed.",
      });
    }

    if (status === "success") {
      const output = findOutput(execution);

      requests.delete(req.params.requestId);

      return res.json({
        status: "success",
        executionId: request.executionId,
        output: output || "JARVIS completed without a text response.",
      });
    }

    return res.json({
      status,
      executionId: request.executionId,
    });
  } catch (error) {
    console.error("Get JARVIS result error:", error);

    return res.status(500).json({
      error: "Failed to read JARVIS result.",
    });
  }
});

/*
  Cancel a JARVIS request.

  React -> this server -> n8n API -> stop execution
*/
app.post("/api/jarvis/cancel/:requestId", async (req, res) => {
  try {
    const accessToken = getBearerToken(req);
    const request = requests.get(req.params.requestId);

    if (!accessToken) {
      return res.status(401).json({
        error: "Missing Supabase access token.",
      });
    }

    if (!request) {
      return res.status(404).json({
        error: "JARVIS request not found.",
      });
    }

    if (request.accessToken !== accessToken) {
      return res.status(403).json({
        error: "You cannot cancel this JARVIS request.",
      });
    }

    const response = await fetch(
      `${N8N_BASE_URL}/api/v1/executions/${encodeURIComponent(
        request.executionId
      )}/stop`,
      {
        method: "POST",
        headers: {
          "X-N8N-API-KEY": N8N_API_KEY,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error("n8n cancellation error status:", response.status);

      return res.status(response.status).json({
        error: "Could not cancel n8n execution.",
      });
    }

    requests.delete(req.params.requestId);

    console.log(
      `🛑 Cancelled JARVIS request ${req.params.requestId} → execution ${request.executionId}`
    );

    return res.json({
      status: "cancelled",
      executionId: request.executionId,
    });
  } catch (error) {
    console.error("Cancel JARVIS error:", error);

    return res.status(500).json({
      error: "Failed to cancel JARVIS.",
    });
  }
});

/*
  Recursively search n8n execution data for the AI Agent's
  final "output" string.
*/
function findOutput(value, depth = 0) {
  if (depth > 12 || value == null) {
    return null;
  }

  if (typeof value === "string") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findOutput(item, depth + 1);

      if (result) {
        return result;
      }
    }

    return null;
  }

  if (typeof value === "object") {
    if (typeof value.output === "string" && value.output.trim()) {
      return value.output;
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "executionData") {
        continue;
      }

      const result = findOutput(child, depth + 1);

      if (result) {
        return result;
      }
    }
  }

  return null;
}

/*
  Health check
*/
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "JARVIS server",
  });
});

app.listen(PORT, () => {
  console.log("");
  console.log("🤖 JARVIS server started");
  console.log(`   http://localhost:${PORT}`);
  console.log("");
});
