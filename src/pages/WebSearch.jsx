import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { parseSearchResponse } from "../lib/webSearch";
import { runJarvisCommand } from "../lib/jarvis";

const HISTORY_KEY = "jarvis.webSearch.history";
const QUICK_SEARCHES = [
  "Latest AI developments this week",
  "Best Python resources",
  "Latest technology news",
  "Current software engineering trends",
];

function readHistory() {
  try {
    const value = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveHistory(query, history) {
  const nextHistory = [query, ...history.filter((item) => item !== query)].slice(0, 8);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
  return nextHistory;
}

function WebSearchPage() {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState(readHistory);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastQuery, setLastQuery] = useState("");

  async function executeSearch(searchQuery = query) {
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery || loading) return;

    setQuery(trimmedQuery);
    setLoading(true);
    setError("");
    setAnswer("");
    setSources([]);
    setLastQuery(trimmedQuery);

    const nextHistory = saveHistory(trimmedQuery, history);
    setHistory(nextHistory);

    try {
      const output = await runJarvisCommand(
        `Search the web for: ${trimmedQuery}. Use the Tavily search tool when appropriate. Return a concise answer with factual details and preserve any source links returned by the search. Do not invent URLs, dates, or sources.`
      );
      const parsed = parseSearchResponse(output);
      setAnswer(parsed.answer);
      setSources(parsed.sources);
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Could not complete the web search.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    executeSearch();
  }

  function clearSearch() {
    setQuery("");
    setAnswer("");
    setSources([]);
    setError("");
    setLastQuery("");
  }

  const hasResults = useMemo(() => Boolean(answer || sources.length), [answer, sources]);

  return (
    <div className="feature-page web-search-page">
      <div className="feature-header">
        <div>
          <div className="header-label">JARVIS WORKSPACE</div>
          <h1>Web Search</h1>
          <p>Bring current information from across the web into JARVIS.</p>
        </div>
        <div className="feature-icon-large">🔎</div>
      </div>

      <section className="web-search-hero">
        <form className="web-search-form" onSubmit={handleSubmit}>
          <label htmlFor="web-search-input">Search the web</label>
          <div className="web-search-input-row">
            <input
              id="web-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the web..."
              autoComplete="off"
            />
            <button type="submit" className="feature-action-button" disabled={loading || !query.trim()}>
              {loading ? "Searching..." : "Search"}
            </button>
            {(query || hasResults) && (
              <button type="button" className="web-search-clear" onClick={clearSearch} disabled={loading} aria-label="Clear search">×</button>
            )}
          </div>
          <span className="web-search-hint">Press Enter to search with JARVIS and Tavily.</span>
        </form>

        <div className="web-search-quick-searches">
          <span>Try a search</span>
          <div>
            {QUICK_SEARCHES.map((example) => (
              <button key={example} onClick={() => executeSearch(example)} disabled={loading}>
                {example}
              </button>
            ))}
          </div>
        </div>
      </section>

      {history.length > 0 && (
        <section className="web-search-history">
          <div className="web-search-section-heading">
            <h2>Recent searches</h2>
            <button className="text-action" onClick={() => { window.localStorage.removeItem(HISTORY_KEY); setHistory([]); }}>Clear history</button>
          </div>
          <div className="web-search-history-list">
            {history.map((item) => <button key={item} onClick={() => executeSearch(item)} disabled={loading}>{item}</button>)}
          </div>
        </section>
      )}

      {loading && (
        <section className="web-search-result-panel web-search-loading" aria-live="polite">
          <div className="web-search-spinner">✦</div>
          <h2>JARVIS is searching the web...</h2>
          <p>Gathering current information and relevant sources.</p>
        </section>
      )}

      {error && !loading && (
        <section className="web-search-error" role="alert">
          <div>
            <strong>Search could not be completed</strong>
            <p>{error}</p>
          </div>
          <button className="feature-action-button" onClick={() => executeSearch(lastQuery)} disabled={!lastQuery}>Retry</button>
        </section>
      )}

      {!loading && !error && hasResults && (
        <section className="web-search-result-panel">
          <div className="web-search-section-heading">
            <div>
              <span className="web-search-kicker">JARVIS ANSWER</span>
              <h2>{lastQuery}</h2>
            </div>
          </div>
          <div className="web-search-answer"><ReactMarkdown>{answer}</ReactMarkdown></div>

          {sources.length > 0 && (
            <div className="web-search-sources">
              <h3>Sources</h3>
              <div className="web-search-source-grid">
                {sources.map((source) => (
                  <a className="web-search-source-card" href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                    <strong>{source.title}</strong>
                    <span>{source.domain}</span>
                    {source.description && <p>{source.description}</p>}
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default WebSearchPage;
