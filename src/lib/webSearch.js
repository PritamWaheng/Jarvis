function cleanUrl(url) {
  return url.replace(/[),.;]+$/, "");
}

function sourceFromUrl(url, title = "Web result", description = "") {
  try {
    return {
      title,
      url,
      domain: new URL(url).hostname.replace(/^www\./, ""),
      description,
    };
  } catch {
    return null;
  }
}

function structuredSources(value) {
  const results = Array.isArray(value) ? value : value?.results || value?.sources || [];

  if (!Array.isArray(results)) return [];

  return results
    .map((result) => {
      const url = typeof result?.url === "string" ? result.url : "";
      return url.startsWith("http")
        ? sourceFromUrl(url, result.title || result.name || "Web result", result.description || result.snippet || "")
        : null;
    })
    .filter(Boolean);
}

export function parseSearchResponse(output) {
  const answer = String(output || "").trim();
  let sources = [];

  try {
    const parsed = JSON.parse(answer.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
    sources = structuredSources(parsed);
  } catch {
    const markdownLinks = [...answer.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)];
    sources = markdownLinks
      .map((match) => sourceFromUrl(cleanUrl(match[2]), match[1]))
      .filter(Boolean);
  }

  if (sources.length === 0) {
    const urls = [...answer.matchAll(/https?:\/\/[^\s<]+/g)].map((match) => cleanUrl(match[0]));
    sources = [...new Set(urls)].map((url) => sourceFromUrl(url)).filter(Boolean);
  }

  return { answer, sources };
}
