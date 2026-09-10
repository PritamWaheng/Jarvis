import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function withoutProviderTokens(value) {
  if (!value) {
    return value;
  }

  try {
    const session = JSON.parse(value);

    if (session && typeof session === "object") {
      delete session.provider_token;
      delete session.provider_refresh_token;
      return JSON.stringify(session);
    }
  } catch {
    return value;
  }

  return value;
}

const authStorage = {
  getItem(key) {
    const value = window.localStorage.getItem(key);
    const sanitizedValue = withoutProviderTokens(value);

    if (value !== sanitizedValue && sanitizedValue !== null) {
      window.localStorage.setItem(key, sanitizedValue);
    }

    return sanitizedValue;
  },

  setItem(key, value) {
    window.localStorage.setItem(key, withoutProviderTokens(value));
  },

  removeItem(key) {
    window.localStorage.removeItem(key);
  },
};

export const supabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey
);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: authStorage,
      },
    })
  : null;
