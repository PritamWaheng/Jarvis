import {
  cancelJarvisRequest,
  pollJarvisResult,
  sendToJarvis,
} from "./n8n";

export async function runCalendarCommand(prompt, signal) {
  const startResult = await sendToJarvis(prompt, signal);
  const requestId = startResult?.requestId;

  if (!requestId) {
    throw new Error("JARVIS did not return a request ID.");
  }

  try {
    let result;

    while (!signal?.aborted) {
      result = await pollJarvisResult(requestId, signal);

      if (["success", "error", "cancelled", "canceled"].includes(result?.status)) {
        break;
      }

      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(resolve, 900);

        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timeoutId);
            const error = new Error("Request cancelled.");
            error.name = "AbortError";
            reject(error);
          },
          { once: true }
        );
      });
    }

    if (signal?.aborted) {
      throw new DOMException("Request cancelled.", "AbortError");
    }

    if (!result) {
      throw new Error("JARVIS did not return a result.");
    }

    if (result.status === "cancelled" || result.status === "canceled") {
      const error = new Error("Request cancelled.");
      error.name = "AbortError";
      throw error;
    }

    if (result.status === "error") {
      throw new Error(result.error || "JARVIS calendar operation failed.");
    }

    return result.output || "";
  } catch (error) {
    if (error.name === "AbortError") {
      await cancelJarvisRequest(requestId).catch(() => {});
    }

    throw error;
  }
}

export function parseCalendarJson(output) {
  const cleaned = String(output || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const starts = [cleaned.indexOf("["), cleaned.indexOf("{")].filter(
      (index) => index >= 0
    );
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));

    if (start < 0 || end <= start) {
      throw new Error("JARVIS returned an unreadable calendar response.");
    }

    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new Error("JARVIS returned an unreadable calendar response.");
    }
  }
}

export function normalizeCalendarEvents(value) {
  const source = Array.isArray(value)
    ? value
    : value?.events || value?.items || [];

  return source
    .map((event) => {
      const start = event.start?.dateTime || event.start?.date || event.start;
      const end = event.end?.dateTime || event.end?.date || event.end;

      return {
        id: event.id || event.eventId || `${event.summary}-${start}`,
        title: event.title || event.summary || "Untitled event",
        start,
        end,
        location: event.location || "",
        description: event.description || "",
      };
    })
    .filter((event) => event.start)
    .sort((first, second) => new Date(first.start) - new Date(second.start));
}

export function createCalendarPrompt() {
  return `Use the Google Calendar tool to list the user's upcoming events starting now, ordered by start time. Return ONLY a valid JSON array, with no markdown or explanation. Each item must have this shape: {"id":"string","title":"string","start":"ISO-8601 string","end":"ISO-8601 string","location":"string","description":"string"}. Include at most 50 events.`;
}

export function createEventPrompt(event) {
  return `Use the Google Calendar tool to create this event for the authenticated user. Return ONLY a valid JSON object with {"success":true,"id":"string"}, with no markdown or explanation. Title: ${event.title}. Date: ${event.date}. Start time: ${event.startTime}. End time: ${event.endTime}. Description: ${event.description || "None"}. Location: ${event.location || "None"}.`;
}

export function updateEventPrompt(event) {
  return `Use the Google Calendar tool to update event ID ${event.id} for the authenticated user. Return ONLY a valid JSON object with {"success":true}, with no markdown or explanation. New title: ${event.title}. Date: ${event.date}. Start time: ${event.startTime}. End time: ${event.endTime}. Description: ${event.description || "None"}. Location: ${event.location || "None"}.`;
}

export function deleteEventPrompt(event) {
  return `Use the Google Calendar tool to delete event ID ${event.id} for the authenticated user. Return ONLY a valid JSON object with {"success":true}, with no markdown or explanation.`;
}
