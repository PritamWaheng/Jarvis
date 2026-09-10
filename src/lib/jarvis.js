import {
  cancelJarvisRequest,
  pollJarvisResult,
  sendToJarvis,
} from "./n8n";

export async function runJarvisCommand(prompt, signal) {
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
      throw new Error(result.error || "JARVIS request failed.");
    }

    return result.output || "";
  } catch (error) {
    if (error.name === "AbortError") {
      await cancelJarvisRequest(requestId).catch(() => {});
    }

    throw error;
  }
}
