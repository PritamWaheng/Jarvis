import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase, supabaseConfigured } from "./lib/supabase";
import {
  fetchGmailMessages,
  saveGoogleProviderCredentials,
} from "./lib/gmail";
import {
  cancelJarvisRequest,
  pollJarvisResult,
  sendToJarvis,
} from "./lib/n8n";
import Login from "./pages/Login";
import CalendarPage from "./pages/Calendar";
import WebSearchPage from "./pages/WebSearch";
import "./App.css";

const GMAIL_PENDING_USER_ID_KEY = "jarvis.gmail.pendingUserId";

/* =========================================================
   CHAT PAGE
   ========================================================= */

function ChatPage({
  messages,
  message,
  setMessage,
  sending,
  cancelled,
  copiedId,
  inputRef,
  messagesEndRef,
  handleSend,
  handleCancel,
  handleKeyDown,
  copyMessage,
  applySuggestion,
  formatTime,
}) {
  return (
    <>
      <header className="header">
        <div className="header-content">
          <div className="header-label">PERSONAL AI ASSISTANT</div>

          <h1>
            {messages.length === 0 ? "Good morning." : "JARVIS"}
          </h1>

          <p>
            {messages.length === 0
              ? "How can I assist you today?"
              : "Your personal AI assistant"}
          </p>
        </div>

        <div className="header-status">
          <span className="online-dot"></span>
          Online
        </div>
      </header>

      <section className="chat">
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="jarvis-orb">
              <div className="orb-ring ring-one"></div>
              <div className="orb-ring ring-two"></div>

              <span>J</span>
            </div>

            <h2>How can I help?</h2>

            <p>
              Ask me anything. I can search the web, manage emails,
              find jobs, perform calculations and more.
            </p>

            <div className="suggestion-grid">
              <button
                className="suggestion-card"
                onClick={() =>
                    applySuggestion("Find software engineering jobs")
                }
              >
                <div className="suggestion-icon jobs">💼</div>

                <div className="suggestion-content">
                  <strong>Find jobs</strong>
                  <small>Search current openings</small>
                </div>

                <span className="suggestion-arrow">›</span>
              </button>

              <button
                className="suggestion-card"
                onClick={() =>
                    applySuggestion("Summarize my recent emails")
                }
              >
                <div className="suggestion-icon email">📧</div>

                <div className="suggestion-content">
                  <strong>Check email</strong>
                  <small>Summarize recent messages</small>
                </div>

                <span className="suggestion-arrow">›</span>
              </button>

              <button
                className="suggestion-card"
                onClick={() =>
                    applySuggestion("Search the web for today's AI news")
                }
              >
                <div className="suggestion-icon search">🔎</div>

                <div className="suggestion-content">
                  <strong>Search the web</strong>
                  <small>Find current information</small>
                </div>

                <span className="suggestion-arrow">›</span>
              </button>

              <button
                className="suggestion-card"
                onClick={() =>
                    applySuggestion("Calculate 1250 * 48")
                }
              >
                <div className="suggestion-icon calculate">🧮</div>

                <div className="suggestion-content">
                  <strong>Calculate</strong>
                  <small>Perform a calculation</small>
                </div>

                <span className="suggestion-arrow">›</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="messages">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message-row ${
                  msg.role === "user"
                    ? "user-message-row"
                    : "jarvis-message-row"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="message-avatar">J</div>
                )}

                <div className="message-wrapper">
                  <div
                    className={`message ${
                      msg.role === "user"
                        ? "user-message"
                        : "jarvis-message"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <ReactMarkdown
                        components={{
                          a: (props) => (
                            <a
                              {...props}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          ),

                          code: ({ inline, className, children, ...props }) =>
                            inline ? (
                              <code
                                className="inline-code"
                                {...props}
                              >
                                {children}
                              </code>
                            ) : (
                              <pre className="code-block">
                                <code
                                  className={className}
                                  {...props}
                                >
                                  {children}
                                </code>
                              </pre>
                            ),

                          table: (props) => (
                            <div className="table-wrapper">
                              <table {...props} />
                            </div>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>

                  <div className="message-meta">
                    <span>{formatTime(msg.time)}</span>

                    {msg.role === "assistant" && (
                      <button
                        className="copy-button"
                        onClick={() =>
                          copyMessage(msg.content, msg.id)
                        }
                        title="Copy response"
                      >
                        {copiedId === msg.id
                          ? "✓ Copied"
                          : "⧉ Copy"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {sending && (
              <div className="message-row jarvis-message-row">
                <div className="message-avatar">J</div>

                <div className="message-wrapper">
                  <div className="message jarvis-message typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>

                  <div className="thinking-text">
                    JARVIS is thinking...

                    <button
                      className="cancel-search-button"
                      onClick={handleCancel}
                    >
                      Cancel Search
                    </button>
                  </div>
                </div>
              </div>
            )}

            {cancelled && !sending && (
              <div className="cancelled-message">
                Search cancelled.
              </div>
            )}

            <div ref={messagesEndRef}></div>
          </div>
        )}
      </section>

      <div className="composer-container">
        <div className="composer">
          <div className="composer-icon">＋</div>

          <input
            ref={inputRef}
            type="text"
            placeholder="Ask JARVIS anything..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            autoComplete="off"
          />

          <button
            className="send-button"
            onClick={handleSend}
            disabled={sending || !message.trim()}
            title="Send message"
          >
            {sending ? "..." : "➤"}
          </button>
        </div>

        <div className="composer-hint">
          <span>↵</span>
          Enter to send

          <span className="hint-dot">•</span>

          JARVIS can make mistakes. Verify important information.
        </div>
      </div>
    </>
  );
}

/* =========================================================
   GMAIL PAGE
   ========================================================= */

function GmailPage({ setActivePage, setMessage, inputRef }) {
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [messagesError, setMessagesError] = useState("");
  const [gmailNotConnected, setGmailNotConnected] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetchGmailMessages()
      .then((nextMessages) => {
        if (!mounted) return;

        setMessages(nextMessages);
        setMessagesError("");
        setGmailNotConnected(false);
      })
      .catch((error) => {
        if (!mounted) return;

        setMessagesError(error.message || "Could not load Gmail messages.");
        setGmailNotConnected(error.status === 404);
      })
      .finally(() => {
        if (mounted) {
          setLoadingMessages(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  function goToChat(text) {
    setActivePage("Chat");
    setMessage(text);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  return (
    <div className="feature-page">
      <div className="feature-header">
        <div>
          <div className="header-label">JARVIS WORKSPACE</div>

          <h1>Gmail</h1>

          <p>
            Manage and summarize your emails with JARVIS.
          </p>
        </div>

        <div className="feature-icon-large">📧</div>
      </div>

      <div className="gmail-dashboard">
        <div className="gmail-card gmail-main-card">
          <div className="gmail-card-icon">📬</div>

          <h2>Your inbox, simplified.</h2>

          <p>
            Ask JARVIS to summarize recent emails, find messages,
            or help you understand what's important.
          </p>

          <button
            className="feature-action-button"
            onClick={() =>
              goToChat("Summarize my recent emails")
            }
          >
            Ask JARVIS
            <span>→</span>
          </button>
        </div>

        <div className="gmail-card">
          <span className="gmail-card-label">QUICK ACTION</span>

          <h3>Recent emails</h3>

          <p>
            Get a summary of your latest messages.
          </p>

          <button
            className="text-action"
            onClick={() =>
              goToChat("Summarize my recent emails")
            }
          >
            Summarize inbox →
          </button>
        </div>

        <div className="gmail-card">
          <span className="gmail-card-label">QUICK ACTION</span>

          <h3>Find an email</h3>

          <p>
            Ask JARVIS to search your Gmail.
          </p>

          <button
            className="text-action"
            onClick={() =>
              goToChat("Find an email in my Gmail")
            }
          >
            Search Gmail →
          </button>
        </div>
      </div>

      <section className="gmail-inbox-panel" aria-live="polite">
        <div className="gmail-inbox-header">
          <div>
            <span className="gmail-card-label">CONNECTED INBOX</span>
            <h2>Recent messages</h2>
          </div>

          {!loadingMessages && !gmailNotConnected && !messagesError && (
            <span className="gmail-message-count">
              {messages.length} {messages.length === 1 ? "message" : "messages"}
            </span>
          )}
        </div>

        {loadingMessages && (
          <div className="gmail-inbox-state">Loading your Gmail messages...</div>
        )}

        {!loadingMessages && gmailNotConnected && (
          <div className="gmail-inbox-state">
            Connect Gmail to view your recent messages.
          </div>
        )}

        {!loadingMessages && !gmailNotConnected && messagesError && (
          <div className="gmail-inbox-state gmail-inbox-error" role="alert">
            {messagesError}
          </div>
        )}

        {!loadingMessages && !gmailNotConnected && !messagesError && messages.length === 0 && (
          <div className="gmail-inbox-state">
            Gmail is connected, but there are no recent messages.
          </div>
        )}

        {!loadingMessages && !messagesError && messages.length > 0 && (
          <div className="gmail-message-list">
            {messages.map((email) => (
              <article className="gmail-message" key={email.id}>
                <div className="gmail-message-topline">
                  <strong>{email.from || "Unknown sender"}</strong>
                  <time>{email.date || "Date unavailable"}</time>
                </div>

                <h3>{email.subject || "No subject"}</h3>
                <p>{email.preview || "No preview available."}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="feature-note">
        <span>✦</span>

        Gmail integration is powered by your JARVIS n8n workflow.
      </div>
    </div>
  );
}

/* =========================================================
   JOBS PAGE
   ========================================================= */

function JobsPage({
  jobDescription,
  setJobDescription,
  jobInputRef,
  searchJobs,
  handleJobKeyDown,
  quickJobSearch,
}) {
  return (
    <div className="feature-page">
      <div className="feature-header">
        <div>
          <div className="header-label">JARVIS WORKSPACE</div>

          <h1>Job Search</h1>

          <p>
            Tell JARVIS what kind of opportunity you're looking for.
          </p>
        </div>

        <div className="feature-icon-large">💼</div>
      </div>

      <div className="jobs-search-card">
        <div className="jobs-search-title">
          <div className="jobs-search-icon">✦</div>

          <div>
            <h2>Describe your ideal job</h2>

            <p>
              Use natural language. JARVIS will understand the details.
            </p>
          </div>
        </div>

        <div className="job-description-field">
          <label>JOB DESCRIPTION</label>

          <textarea
            ref={jobInputRef}
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            onKeyDown={handleJobKeyDown}
            placeholder="Example: I'm looking for a Python Developer job in Bangalore. I'm a fresher and prefer remote or hybrid roles. I'm looking for companies offering at least ₹6 LPA."
            rows={6}
          />

          <div className="job-input-footer">
            <span>
              {jobDescription.length} characters
            </span>

            <span>⌘ + Enter to search</span>
          </div>
        </div>

        <button
          className="job-search-button job-search-full"
          onClick={searchJobs}
          disabled={!jobDescription.trim()}
        >
          <span>🔎</span>
          Search with JARVIS
        </button>
      </div>

      <div className="job-quick-section">
        <div className="section-heading">
          <div>
            <span>QUICK SEARCH</span>

            <h3>Start with an example</h3>
          </div>
        </div>

        <div className="job-quick-grid">
          <button
            className="job-quick-card"
            onClick={() =>
              quickJobSearch(
                "Find 5 Software Engineer jobs in Bangalore for a fresher. Prefer companies hiring for Python, JavaScript, React or SQL skills."
              )
            }
          >
            <span>💻</span>

            <div>
              <strong>Software Engineer</strong>
              <small>Bangalore · Fresher</small>
            </div>

            <b>→</b>
          </button>

          <button
            className="job-quick-card"
            onClick={() =>
              quickJobSearch(
                "Find 5 Python Developer jobs that are remote or hybrid in India. Include fresher-friendly opportunities."
              )
            }
          >
            <span>🐍</span>

            <div>
              <strong>Python Developer</strong>
              <small>India · Remote / Hybrid</small>
            </div>

            <b>→</b>
          </button>

          <button
            className="job-quick-card"
            onClick={() =>
              quickJobSearch(
                "Find 5 Full Stack Developer jobs in India using React, Node.js and SQL. Include entry-level opportunities."
              )
            }
          >
            <span>⚡</span>

            <div>
              <strong>Full Stack Developer</strong>
              <small>India · Entry Level</small>
            </div>

            <b>→</b>
          </button>
        </div>
      </div>

      <div className="job-info-banner">
        <div className="job-info-icon">✦</div>

        <div>
          <strong>
            Powered by JARVIS Job Search Agent
          </strong>

          <p>
            Your request will be passed to JARVIS, which can use
            the n8n + Tavily job-search workflow.
          </p>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN APP
   ========================================================= */

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailProviderReady, setGmailProviderReady] = useState(false);
  const [gmailLinking, setGmailLinking] = useState(false);
  const [gmailError, setGmailError] = useState("");
  const [authError, setAuthError] = useState("");

  const [activePage, setActivePage] = useState("Chat");
  const [jobDescription, setJobDescription] = useState("");

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const jobInputRef = useRef(null);

  const abortControllerRef = useRef(null);
  const activeRequestIdRef = useRef(null);
  const gmailConnectionInFlightRef = useRef(false);
  const gmailOAuthHandledRef = useRef(false);

  function sanitizeSession(currentSession) {
    if (!currentSession) {
      return null;
    }

    const sanitizedSession = { ...currentSession };

    delete sanitizedSession.provider_token;
    delete sanitizedSession.provider_refresh_token;

    return sanitizedSession;
  }

  function clearOAuthCallbackUrl() {
    if (!window.location.hash) {
      return;
    }

    window.history.replaceState(
      window.history.state,
      document.title,
      `${window.location.pathname}${window.location.search}`
    );
  }

  function googleOAuthOptions() {
    return {
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
        redirectTo: window.location.origin,
      },
    };
  }

  function isIdentityAlreadyExistsError(error) {
    return (
      error?.code === "identity_already_exists" ||
      error?.message?.toLowerCase().includes("identity_already_exists")
    );
  }

  async function handleConnectGmail() {
    if (gmailConnected || gmailLinking) {
      return;
    }

    gmailOAuthHandledRef.current = false;
    setGmailLinking(true);
    setGmailError("");

    try {
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !currentSession?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      window.sessionStorage.setItem(GMAIL_PENDING_USER_ID_KEY, user.id);

      const googleIdentityLinked = user.identities?.some(
        (identity) => identity.provider === "google"
      );

      let result = googleIdentityLinked
        ? await supabase.auth.signInWithOAuth(googleOAuthOptions())
        : await supabase.auth.linkIdentity(googleOAuthOptions());

      if (
        result.error &&
        !googleIdentityLinked &&
        isIdentityAlreadyExistsError(result.error)
      ) {
        result = await supabase.auth.signInWithOAuth(googleOAuthOptions());
      }

      const { error } = result;

      if (error) {
        window.sessionStorage.removeItem(GMAIL_PENDING_USER_ID_KEY);
        setGmailError(error.message || "Could not connect Gmail.");
      }
    } catch (error) {
      window.sessionStorage.removeItem(GMAIL_PENDING_USER_ID_KEY);
      setGmailError(error.message || "Could not connect Gmail.");
    } finally {
      setGmailLinking(false);
    }
  }

  function processAuthenticatedSession(currentSession) {
    setSession(sanitizeSession(currentSession));
    setLoading(false);

    if (!currentSession) {
      window.sessionStorage.removeItem(GMAIL_PENDING_USER_ID_KEY);
      gmailOAuthHandledRef.current = false;
      gmailConnectionInFlightRef.current = false;
      setGmailConnected(false);
      setGmailProviderReady(false);
      setGmailError("");
      return;
    }

    setAuthError("");

    const providerCredentialsAvailable = Boolean(currentSession.provider_token);
    const expectedUserId = window.sessionStorage.getItem(
      GMAIL_PENDING_USER_ID_KEY
    );
    setGmailProviderReady(providerCredentialsAvailable);

    if (
      !providerCredentialsAvailable ||
      !expectedUserId ||
      gmailOAuthHandledRef.current ||
      gmailConnectionInFlightRef.current
    ) {
      return;
    }

    gmailOAuthHandledRef.current = true;
    gmailConnectionInFlightRef.current = true;
    setGmailLinking(true);
    setGmailError("");

    setTimeout(async () => {
      try {
        const result = await saveGoogleProviderCredentials(
          currentSession,
          expectedUserId
        );

        if (result.saved) {
          setGmailConnected(true);
        }
      } catch (error) {
        setGmailConnected(false);

        if (error.code === "gmail_user_mismatch") {
          setAuthError(error.message);
          await supabase.auth.signOut({ scope: "local" });
        } else {
          setGmailError(error.message || "Could not connect Gmail.");
        }
      } finally {
        window.sessionStorage.removeItem(GMAIL_PENDING_USER_ID_KEY);
        gmailConnectionInFlightRef.current = false;
        setGmailLinking(false);
      }
    }, 0);
  }

  /* =======================================================
     AUTHENTICATION
     ======================================================= */

  useEffect(() => {
    if (!supabaseConfigured) {
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;

      clearOAuthCallbackUrl();
      processAuthenticatedSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setGmailError("");
        processAuthenticatedSession(currentSession);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /* =======================================================
     AUTO SCROLL
     ======================================================= */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, sending]);

  /* =======================================================
     SEND MESSAGE
     ======================================================= */

  async function handleSend() {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || sending) {
      return;
    }

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: trimmedMessage,
      time: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setSending(true);
    setCancelled(false);

    const controller = new AbortController();

    abortControllerRef.current = controller;

    try {
      const startResult = await sendToJarvis(
        trimmedMessage,
        controller.signal
      );

      if (controller.signal.aborted) {
        if (startResult?.requestId) {
          await cancelJarvisRequest(startResult.requestId).catch(() => {});
        }
        return;
      }

      const requestId = startResult?.requestId;

      if (!requestId) {
        throw new Error("JARVIS did not return a request ID.");
      }

      activeRequestIdRef.current = requestId;
      setActiveRequestId(requestId);

      let result;

      while (!controller.signal.aborted) {
        result = await pollJarvisResult(requestId, controller.signal);

        if (["success", "error", "cancelled", "canceled"].includes(result?.status)) {
          break;
        }

        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, 1000);

          controller.signal.addEventListener(
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

      if (controller.signal.aborted || !result) {
        return;
      }

      if (result.status === "cancelled" || result.status === "canceled") {
        setCancelled(true);
        return;
      }

      if (result.status === "error") {
        throw new Error(result.error || "JARVIS execution failed.");
      }

      const jarvisReply = result.output || "JARVIS completed without a text response.";

      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: jarvisReply,
        time: new Date(),
      };

      setMessages((prev) => [
        ...prev,
        assistantMessage,
      ]);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      console.error("JARVIS error:", error);

      let errorMessage =
        error.message || "I couldn't connect to JARVIS right now.";

      if (error.serverSource === "n8n-api") {
        errorMessage =
          "The JARVIS server cannot authenticate with the n8n execution API. Check N8N_API_KEY on the server.";
      } else if (error.status === 401) {
        errorMessage = error.serverSource === "n8n"
          ? "n8n rejected the forwarded Supabase session."
          : "Your session has expired. Please sign in again.";
      } else if (error.status === 404) {
        errorMessage = "This JARVIS request could not be found.";
      } else if (error.status >= 500) {
        errorMessage = "JARVIS is having trouble processing the request.";
      } else if (error.message === "Failed to fetch") {
        errorMessage = "Couldn't connect to the JARVIS server.";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: errorMessage,
          time: new Date(),
        },
      ]);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }

      if (activeRequestIdRef.current) {
        activeRequestIdRef.current = null;
        setActiveRequestId(null);
      }

      setSending(false);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }

  /* =======================================================
     CANCEL SEARCH
     ======================================================= */

  async function handleCancel() {
    const requestId = activeRequestIdRef.current || activeRequestId;

    if (!abortControllerRef.current && !requestId) {
      return;
    }

    abortControllerRef.current?.abort();

    abortControllerRef.current = null;
    activeRequestIdRef.current = null;
    setActiveRequestId(null);

    setSending(false);
    setCancelled(true);

    if (requestId) {
      try {
        await cancelJarvisRequest(requestId);
      } catch (error) {
        console.error("JARVIS cancellation error:", error);
      }
    }

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  async function stopActiveRequest() {
    const requestId = activeRequestIdRef.current || activeRequestId;

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRequestIdRef.current = null;
    setActiveRequestId(null);
    setSending(false);

    if (requestId) {
      try {
        await cancelJarvisRequest(requestId);
      } catch (error) {
        console.error("JARVIS cancellation error:", error);
      }
    }
  }

  /* =======================================================
     ENTER TO SEND
     ======================================================= */

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  /* =======================================================
     JOB KEYBOARD
     ======================================================= */

  function handleJobKeyDown(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      searchJobs();
    }
  }

  /* =======================================================
     FORMAT TIME
     ======================================================= */

  function formatTime(date) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  /* =======================================================
     COPY MESSAGE
     ======================================================= */

  async function copyMessage(content, id) {
    try {
      await navigator.clipboard.writeText(content);

      setCopiedId(id);

      setTimeout(() => {
        setCopiedId(null);
      }, 1500);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }

  /* =======================================================
     NEW CHAT
     ======================================================= */

  function startNewChat() {
    void stopActiveRequest();

    setActivePage("Chat");
    setMessages([]);
    setMessage("");
    setSending(false);
    setCancelled(false);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  /* =======================================================
     NAVIGATION
     ======================================================= */

  function handleNavigation(page) {
    setActivePage(page);

    if (page === "Chat") {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }

    if (page === "Jobs") {
      setTimeout(() => {
        jobInputRef.current?.focus();
      }, 50);
    }
  }

  /* =======================================================
     SUGGESTIONS
     ======================================================= */

  function applySuggestion(text) {
    setActivePage("Chat");
    setMessage(text);
    setCancelled(false);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  /* =======================================================
     JOB SEARCH
     ======================================================= */

  function searchJobs() {
    const trimmedDescription = jobDescription.trim();

    if (!trimmedDescription) {
      jobInputRef.current?.focus();
      return;
    }

    const jobRequest = `Find jobs based on this request: ${trimmedDescription}

Search current job openings and return relevant jobs with:
- Job title
- Company
- Location
- Job type
- Experience level
- Key skills
- Salary if available
- Posting date if available
- Direct application link

Prioritize recent and currently available jobs and avoid duplicate or expired listings.`;

    setActivePage("Chat");
    setMessage(jobRequest);
    setCancelled(false);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  /* =======================================================
     QUICK JOB SEARCH
     ======================================================= */

  function quickJobSearch(text) {
    setJobDescription(text);

    setTimeout(() => {
      jobInputRef.current?.focus();
    }, 50);
  }

  /* =======================================================
     SIGN OUT
     ======================================================= */

  async function handleSignOut() {
    await stopActiveRequest();

    await supabase.auth.signOut();

    setSession(null);
    setMessages([]);
    setMessage("");
    setSending(false);
    setCancelled(false);
    setActiveRequestId(null);
    setActivePage("Chat");
    setGmailConnected(false);
    setGmailProviderReady(false);
    setGmailError("");
  }

  /* =======================================================
     USER INFO
     ======================================================= */

  const userEmail = session?.user?.email || "JARVIS User";

  const userInitial = userEmail.charAt(0).toUpperCase();

  /* =======================================================
     NAVIGATION ITEMS
     ======================================================= */

  const navigationItems = [
    {
      name: "Chat",
      icon: "💬",
    },
    {
      name: "Gmail",
      icon: "📧",
    },
    {
      name: "Calendar",
      icon: "📅",
    },
    {
      name: "Jobs",
      icon: "💼",
    },
    {
      name: "Web Search",
      icon: "🔎",
    },
  ];

  /* =======================================================
     LOADING
     ======================================================= */

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-orb">J</div>

        <div className="loading-title">JARVIS</div>

        <div className="loading-text">
          Initializing personal AI assistant...
        </div>
      </div>
    );
  }

  if (!supabaseConfigured) {
    return (
      <div className="loading-screen">
        <div className="loading-orb">J</div>

        <div className="loading-title">JARVIS</div>

        <div className="loading-text">
          Supabase configuration is missing. Add the required VITE_SUPABASE_* values to the frontend .env.
        </div>
      </div>
    );
  }

  /* =======================================================
     LOGIN
     ======================================================= */

  if (!session) {
    return <Login onLogin={(currentSession) =>
      processAuthenticatedSession(currentSession)
    } initialError={authError} />;
  }

  /* =======================================================
     PAGE CONTENT
     ======================================================= */

  let pageContent;

  switch (activePage) {
    case "Gmail":
      pageContent = (
        <GmailPage
          setActivePage={setActivePage}
          setMessage={setMessage}
          inputRef={inputRef}
        />
      );
      break;

    case "Jobs":
      pageContent = (
        <JobsPage
          jobDescription={jobDescription}
          setJobDescription={setJobDescription}
          jobInputRef={jobInputRef}
          searchJobs={searchJobs}
          handleJobKeyDown={handleJobKeyDown}
          quickJobSearch={quickJobSearch}
        />
      );
      break;

    case "Calendar":
      pageContent = <CalendarPage />;
      break;

    case "Web Search":
      pageContent = <WebSearchPage />;
      break;

    case "Chat":
    default:
      pageContent = (
        <ChatPage
          messages={messages}
          message={message}
          setMessage={setMessage}
          sending={sending}
          cancelled={cancelled}
          copiedId={copiedId}
          inputRef={inputRef}
          messagesEndRef={messagesEndRef}
          handleSend={handleSend}
          handleCancel={handleCancel}
          handleKeyDown={handleKeyDown}
          copyMessage={copyMessage}
          applySuggestion={applySuggestion}
          formatTime={formatTime}
        />
      );
      break;
  }

  /* =======================================================
     MAIN APP
     ======================================================= */

  return (
    <div className="jarvis-app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-orb">J</div>

          <div className="brand-text">
            <h2>JARVIS</h2>

            <span>AI ASSISTANT</span>
          </div>
        </div>

        <button
          className="new-chat-button"
          onClick={startNewChat}
        >
          <span className="new-chat-icon">＋</span>

          <span>New Chat</span>
        </button>

        <nav className="nav">
          {navigationItems.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${
                activePage === item.name ? "active" : ""
              }`}
              onClick={() =>
                handleNavigation(item.name)
              }
            >
              <span className="nav-icon">
                {item.icon}
              </span>

              <span>{item.name}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="online-status">
            <span className="online-dot"></span>

            <span>JARVIS Online</span>
          </div>

          <div className="sidebar-divider"></div>

          <div className="user-profile">
            <div className="user-avatar">
              {userInitial}
            </div>

            <div className="user-info">
              <strong>
                {userEmail.split("@")[0]}
              </strong>

              <span>{userEmail}</span>
            </div>
          </div>

          <button
            className="sign-out"
            onClick={handleConnectGmail}
            disabled={gmailLinking || gmailConnected}
            title={gmailConnected ? "Gmail connected" : "Connect Gmail"}
            data-provider-ready={gmailProviderReady}
          >
            <span>✉</span>

            <span>
              {gmailLinking
                ? "Connecting Gmail..."
                : gmailConnected
                  ? "Gmail connected"
                  : "Connect Gmail"}
            </span>
          </button>

          {gmailError && (
            <div className="online-status" role="status">
              {gmailError}
            </div>
          )}

          <button
            className="sign-out"
            onClick={handleSignOut}
          >
            <span>↪</span>

            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="main">{pageContent}</main>
    </div>
  );
}

export default App;
