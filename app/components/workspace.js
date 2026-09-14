"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";

export function ThemeButton() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () =>
      setDark(document.documentElement.dataset.theme === "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  function toggle() {
    const next = document.documentElement.dataset.theme !== "dark";
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("sous-theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable */
    }
  }
  return (
    <button
      className="icon-button theme-button"
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      onClick={toggle}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

export function Navigation({
  active = "cook",
  busy = false,
  onActivity,
  onBasket,
  basketCount = 0,
}) {
  return (
    <nav className="navigation" aria-label="Main navigation">
      <Link
        href="/"
        className="nav-brand"
        aria-label="Sous home"
        onClick={(event) => busy && event.preventDefault()}
        aria-disabled={busy || undefined}
      >
        <Icon name="bowl" size={29} />
        <span>sous.</span>
      </Link>
      <div className="nav-links">
        <Link
          href="/"
          className={`nav-item ${active === "cook" ? "is-active" : ""}`}
          aria-current={active === "cook" ? "page" : undefined}
          onClick={(e) => busy && e.preventDefault()}
          aria-disabled={busy || undefined}
        >
          <Icon name="bowl" />
          <span>Cook</span>
        </Link>
        <Link
          href="/pantry"
          className={`nav-item ${active === "pantry" ? "is-active" : ""}`}
          aria-current={active === "pantry" ? "page" : undefined}
          onClick={(e) => busy && e.preventDefault()}
          aria-disabled={busy || undefined}
        >
          <Icon name="pantry" />
          <span>Cupboard</span>
        </Link>
        {onActivity && (
          <button className="nav-item mobile-nav-item" onClick={onActivity}>
            <Icon name="activity" />
            <span>Activity</span>
            {busy && <i className="nav-dot" />}
          </button>
        )}
        {onBasket && (
          <button
            className="nav-item mobile-nav-item"
            onClick={onBasket}
            aria-label="Basket"
          >
            <Icon name="basket" />
            <span>Basket</span>
            {basketCount > 0 && (
              <i className="nav-count" aria-hidden="true">
                {basketCount}
              </i>
            )}
          </button>
        )}
      </div>
      <div className="nav-bottom">
        <span className="vertical-label">A LITTLE HELP IN THE KITCHEN</span>
        <ThemeButton />
      </div>
    </nav>
  );
}

export function Masthead({ active = "cook", children }) {
  return (
    <header className="masthead">
      <div className="masthead-title">
        <span className="mobile-wordmark">sous.</span>
        <span className="desktop-masthead">YOUR EVERYDAY SOUS CHEF</span>
        <span className="masthead-divider" />
        <span>{active === "cook" ? "The dinner desk" : "The cupboard"}</span>
      </div>
      <div className="masthead-actions">
        {children}
        <span className="mobile-theme">
          <ThemeButton />
        </span>
      </div>
    </header>
  );
}

export function Sheet({ open, onClose, title, children, className = "" }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector("input:not(:disabled)")?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      className={`sheet ${className}`}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function FoodPhoto({ src, className = "", alt = "", priority = false }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    setStage(0);
  }, [src]);
  const photo =
    src && stage < 2
      ? stage === 0 || src.startsWith("/")
        ? src
        : `/api/photo?u=${encodeURIComponent(src)}`
      : null;
  return (
    <div
      className={`food-photo ${!photo ? "photo-fallback" : ""} ${className}`}
    >
      {photo ? (
        <img
          key={`${src}-${stage}`}
          src={photo}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          onError={() =>
            setStage((value) => (src.startsWith("/") ? 2 : value + 1))
          }
        />
      ) : (
        <>
          <Icon name="bowl" size={46} />
          <span>Good things are cooking.</span>
        </>
      )}
    </div>
  );
}

const eventKinds = {
  search: ["search", "search"],
  read: ["book", "read"],
  think: ["sliders", "reason"],
  check: ["check", "check"],
  covered: ["check", "covered"],
  added: ["check", "added"],
  already: ["check", "in cart"],
  substitute: ["swap", "swap"],
  warn: ["alert", "notice"],
  error: ["close", "error"],
  failed: ["close", "failed"],
  reject: ["minus", "skip"],
  oos: ["minus", "no stock"],
  option: ["search", "option"],
  budget: ["sliders", "budget"],
  protein: ["leaf", "protein"],
  card: ["book", "recipe"],
  dishes: ["check", "shortlist"],
  plan: ["check", "plan"],
  done: ["shield", "verified"],
  cart: ["basket", "cart"],
  item: ["basket", "item"],
  wire: ["search", "search"],
};

export function ActivityFeed({ events, busy, phase = null, credits }) {
  const feedRef = useRef(null);
  const following = useRef(true);
  useEffect(() => {
    if (following.current && feedRef.current)
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events]);
  const phaseIndex =
    phase === "finding"
      ? 0
      : phase === "planning"
        ? 1
        : phase === "filling"
          ? 2
          : -1;
  return (
    <section className="activity-panel" aria-label="Agent activity">
      <header className="activity-heading">
        <div>
          <span className="eyebrow">BEHIND YOUR DINNER</span>
          <h2>The agent&apos;s notebook</h2>
        </div>
        <span className={`live-state ${busy ? "is-live" : ""}`}>
          <i />
          {busy ? "Live" : events.length ? "Recorded" : "Ready"}
        </span>
      </header>
      <div className="activity-phases">
        {["Browse", "Think", "Act"].map((label, i) => (
          <span key={label} className={phaseIndex === i ? "current" : ""}>
            <b>0{i + 1}</b>
            {label}
          </span>
        ))}
      </div>
      <div
        ref={feedRef}
        className="activity-log"
        role="log"
        aria-live="off"
        aria-label="Timestamped agent events"
        onScroll={() => {
          const element = feedRef.current;
          following.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            60;
        }}
      >
        {events.length === 0 ? (
          <div className="activity-empty">
            <span className="terminal-cursor">_</span>
            <h3>
              Nothing hidden.
              <br />
              Nothing made up.
            </h3>
            <p>
              Recipe sources, kitchen checks, stock decisions. You&apos;ll see
              the work here as it happens.
            </p>
            <span className="activity-waiting">
              Waiting for your first ingredient
            </span>
          </div>
        ) : (
          events.map((event, i) => {
            const [icon, label] = eventKinds[event.type] || [
              "arrow",
              event.type || "step",
            ];
            return (
              <div key={i} className={`event-row event-${event.type}`}>
                <time>{event.t != null ? `${event.t}s` : "—"}</time>
                <Icon name={icon} size={14} />
                <div>
                  <span className="event-label">{label}</span>
                  <p>
                    {event.message || event.data?.name || "Update received"}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <footer className="activity-footer">
        <Icon name="activity" size={14} />
        <span>
          {events.length
            ? `${events.length} recorded events`
            : "Powered by Anakin"}
          {credits != null ? ` · ${credits} credits` : ""}
        </span>
        <span className="activity-end">{busy ? "REC" : "SSE"}</span>
      </footer>
    </section>
  );
}

export function ErrorNotice({ message }) {
  if (!message) return null;
  return (
    <div className="error-notice" role="alert">
      <Icon name="alert" />
      <div>
        <strong>That step needs another try.</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}
