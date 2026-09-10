import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCalendarPrompt,
  createEventPrompt,
  deleteEventPrompt,
  normalizeCalendarEvents,
  parseCalendarJson,
  runCalendarCommand,
  updateEventPrompt,
} from "../lib/calendar";

const EMPTY_FORM = {
  id: "",
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  description: "",
  location: "",
};

function dateKey(date) {
  return new Intl.DateTimeFormat("en-CA").format(date);
}

function isSameDay(first, second) {
  return dateKey(first) === dateKey(second);
}

function formatEventDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatEventTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function eventFormFromEvent(event) {
  const start = new Date(event.start);
  const end = new Date(event.end || event.start);

  return {
    id: event.id,
    title: event.title,
    date: dateKey(start),
    startTime: Number.isNaN(start.getTime()) ? "" : start.toTimeString().slice(0, 5),
    endTime: Number.isNaN(end.getTime()) ? "" : end.toTimeString().slice(0, 5),
    description: event.description || "",
    location: event.location || "",
  };
}

function CalendarForm({ form, mode, busy, onChange, onSubmit, onClose }) {
  return (
    <div className="calendar-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="calendar-modal" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="calendar-modal-header">
          <div>
            <span className="calendar-kicker">JARVIS WORKSPACE</span>
            <h2>{mode === "edit" ? "Edit event" : "Create event"}</h2>
          </div>
          <button type="button" className="calendar-icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <label>
          Title
          <input name="title" value={form.title} onChange={onChange} required />
        </label>

        <div className="calendar-form-grid">
          <label>
            Date
            <input name="date" type="date" value={form.date} onChange={onChange} required />
          </label>
          <label>
            Location
            <input name="location" value={form.location} onChange={onChange} placeholder="Optional" />
          </label>
          <label>
            Start time
            <input name="startTime" type="time" value={form.startTime} onChange={onChange} required />
          </label>
          <label>
            End time
            <input name="endTime" type="time" value={form.endTime} onChange={onChange} required />
          </label>
        </div>

        <label>
          Description
          <textarea name="description" value={form.description} onChange={onChange} rows="4" placeholder="Optional" />
        </label>

        <div className="calendar-modal-actions">
          <button type="button" className="calendar-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="feature-action-button" disabled={busy}>
            {busy ? "Saving..." : mode === "edit" ? "Save changes" : "Create event"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const output = await runCalendarCommand(createCalendarPrompt());
      setEvents(normalizeCalendarEvents(parseCalendarJson(output)));
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Could not load calendar events.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      loadEvents();
    }, 0);

    return () => clearTimeout(initialLoad);
  }, [loadEvents]);

  const groupedEvents = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    return events.reduce((groups, event) => {
      const start = new Date(event.start);
      const group = isSameDay(start, now) ? "Today" : isSameDay(start, tomorrow) ? "Tomorrow" : "Upcoming";
      groups[group].push(event);
      return groups;
    }, { Today: [], Tomorrow: [], Upcoming: [] });
  }, [events]);

  function openCreate() {
    setError("");
    setForm({ ...EMPTY_FORM, date: dateKey(new Date()) });
    setModal("create");
  }

  function openEdit(event) {
    setError("");
    setForm(eventFormFromEvent(event));
    setModal("edit");
  }

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const prompt = modal === "edit" ? updateEventPrompt(form) : createEventPrompt(form);
      await runCalendarCommand(prompt);
      setModal(null);
      await loadEvents();
    } catch (requestError) {
      if (requestError.name !== "AbortError") setError(requestError.message || "Could not save calendar event.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setBusy(true);
    setError("");

    try {
      await runCalendarCommand(deleteEventPrompt(deleteTarget));
      setDeleteTarget(null);
      await loadEvents();
    } catch (requestError) {
      if (requestError.name !== "AbortError") setError(requestError.message || "Could not delete calendar event.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="feature-page">
      <div className="feature-header">
        <div>
          <div className="header-label">JARVIS WORKSPACE</div>
          <h1>Calendar</h1>
          <p>Keep track of your schedule and upcoming events.</p>
        </div>
        <div className="calendar-header-actions">
          <button className="calendar-secondary-button" onClick={loadEvents} disabled={loading || busy}>↻ Refresh</button>
          <button className="feature-action-button" onClick={openCreate} disabled={busy}>+ Create event</button>
        </div>
      </div>

      {error && (
        <div className="calendar-error" role="alert">
          <span>{error}</span>
          <button className="text-action" onClick={loadEvents}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="calendar-list calendar-loading" aria-live="polite">
          <div className="calendar-loading-line"></div>
          <div className="calendar-loading-line short"></div>
          <div className="calendar-loading-line"></div>
        </div>
      ) : events.length === 0 && !error ? (
        <div className="calendar-empty-state">
          <div className="calendar-empty-icon">☼</div>
          <h2>No upcoming events</h2>
          <p>Your schedule is clear. Create an event to get started.</p>
          <button className="feature-action-button" onClick={openCreate}>Create event <span>→</span></button>
        </div>
      ) : (
        <div className="calendar-list">
          {Object.entries(groupedEvents).map(([group, groupEvents]) => groupEvents.length > 0 && (
            <section key={group} className="calendar-group">
              <div className="calendar-group-heading"><h2>{group}</h2><span>{groupEvents.length}</span></div>
              {groupEvents.map((event) => (
                <article className="calendar-event" key={event.id}>
                  <div className="calendar-event-time">
                    <strong>{formatEventTime(event.start)}</strong>
                    <span>{event.end ? `until ${formatEventTime(event.end)}` : ""}</span>
                  </div>
                  <div className="calendar-event-main">
                    <h3>{event.title}</h3>
                    <span className="calendar-event-date">{formatEventDate(event.start)}</span>
                    {event.location && <p>⌖ {event.location}</p>}
                    {event.description && <p>{event.description}</p>}
                  </div>
                  <div className="calendar-event-actions">
                    <button onClick={() => openEdit(event)} disabled={busy}>Edit</button>
                    <button onClick={() => setDeleteTarget(event)} disabled={busy}>Delete</button>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}

      {modal && <CalendarForm form={form} mode={modal} busy={busy} onChange={updateForm} onSubmit={handleSubmit} onClose={() => setModal(null)} />}

      {deleteTarget && (
        <div className="calendar-modal-backdrop" role="presentation">
          <div className="calendar-confirmation" role="dialog" aria-modal="true">
            <span className="calendar-kicker">CONFIRM ACTION</span>
            <h2>Delete this event?</h2>
            <p>{deleteTarget.title}</p>
            <div className="calendar-modal-actions">
              <button className="calendar-secondary-button" onClick={() => setDeleteTarget(null)} disabled={busy}>Keep event</button>
              <button className="calendar-danger-button" onClick={handleDelete} disabled={busy}>{busy ? "Deleting..." : "Delete event"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPage;
