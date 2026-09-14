"use client";
import { useEffect, useId, useRef, useState } from "react";
import { streamPost } from "../lib/stream";
import { Icon } from "../components/icons";
import {
  Navigation,
  Masthead,
  Sheet,
  ActivityFeed,
  ErrorNotice,
} from "../components/workspace";

const SHELVES = [
  {
    name: "Oils & fats",
    note: "The beginning of a good meal",
    items: ["ghee", "sunflower oil", "mustard oil", "groundnut oil"],
  },
  {
    name: "Everyday masalas",
    note: "A little warmth, a lot of flavour",
    items: [
      "garam masala",
      "red chilli powder",
      "turmeric powder",
      "coriander powder",
      "cumin powder",
      "chaat masala",
      "sambar powder",
    ],
  },
  {
    name: "Whole spices",
    note: "Small things. Big difference.",
    items: [
      "jeera",
      "mustard seeds",
      "bay leaf",
      "cinnamon stick",
      "cloves",
      "cardamom",
      "hing",
    ],
  },
  {
    name: "Flours & grains",
    note: "Something to bring it together",
    items: ["atta", "maida", "besan", "suji", "basmati rice", "poha"],
  },
  {
    name: "Dals & pulses",
    note: "Comfort, always in the cupboard",
    items: [
      "toor dal",
      "moong dal",
      "chana dal",
      "urad dal",
      "rajma",
      "chickpeas",
    ],
  },
  {
    name: "Jars & sauces",
    note: "The finishing touches",
    items: [
      "tomato puree",
      "soy sauce",
      "vinegar",
      "kasuri methi",
      "ginger garlic paste",
      "sugar",
    ],
  },
];

export default function Pantry() {
  const [picked, setPicked] = useState([]);
  const [events, setEvents] = useState([]);
  const [itemState, setItemState] = useState({});
  const [credits, setCredits] = useState(0);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [auth, setAuth] = useState({
    connected: false,
    signedIn: false,
    awaitingOtp: false,
  });
  const [sheet, setSheet] = useState(null);
  const [phase, setPhase] = useState(null);
  const contentRef = useRef(null);
  const lock = useRef(false);

  useEffect(() => {
    fetch("/api/pantry/signin")
      .then((response) => response.json())
      .then(setAuth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (auth.awaitingOtp || summary)
      contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [auth.awaitingOtp, summary]);
  const toggle = (item) =>
    setPicked((previous) =>
      previous.includes(item)
        ? previous.filter((value) => value !== item)
        : [...previous, item],
    );

  async function startSignIn() {
    if (!/^\d{10}$/.test(phone) || lock.current || !picked.length) return;
    lock.current = true;
    setBusy(true);
    setPhase("finding");
    setError(null);
    setEvents([]);
    setItemState({});
    setCredits(0);
    setSummary(null);
    let signedIn = false;
    try {
      // Preserve the existing overlap: shelf research runs while the user enters the OTP.
      await streamPost(
        "/api/pantry/signin",
        { phone, items: picked },
        (event) => {
          if (typeof event.credits === "number") setCredits(event.credits);
          if (event.type === "done") signedIn = Boolean(event.data?.signedIn);
          if (event.type === "otp") {
            setAuth((previous) => ({
              ...previous,
              awaitingOtp: true,
              connected: true,
            }));
            setSheet("signin");
          }
          if (event.type === "done") {
            setAuth({ ...event.data, awaitingOtp: false });
            setSheet(null);
          }
          if (event.type === "error") setError(event.message);
          setEvents((previous) => [...previous, event]);
        },
      );
    } catch (failure) {
      setError(failure.message);
    }
    const live = await fetch("/api/pantry/signin")
      .then((response) => response.json())
      .catch(() => null);
    if (live) setAuth(live);
    lock.current = false;
    if ((signedIn || live?.signedIn) && picked.length) {
      setSheet(null);
      await stockUp({ keepLog: true });
    } else {
      setBusy(false);
      setPhase(null);
    }
  }

  async function sendOtp() {
    if (otpSending || otp.length < 4) return;
    setOtpSending(true);
    setError(null);
    try {
      const response = await fetch("/api/pantry/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      if (!response.ok)
        throw new Error(
          "That code was not accepted. Check the code and try again while the session is open.",
        );
      setOtp("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setOtpSending(false);
    }
  }

  async function stockUp({ keepLog = false } = {}) {
    if (!picked.length || lock.current) return;
    lock.current = true;
    setBusy(true);
    setPhase("filling");
    setError(null);
    setSummary(null);
    if (!keepLog) {
      setEvents([]);
      setItemState({});
      setCredits(0);
    }
    try {
      await streamPost("/api/pantry", { items: picked }, (event) => {
        if (typeof event.credits === "number") setCredits(event.credits);
        if (event.type === "item" && event.data?.name)
          setItemState((previous) => ({
            ...previous,
            [event.data.name]: event.data,
          }));
        else if (event.type === "done") setSummary(event.data);
        else if (event.type === "error") setError(event.message);
        setEvents((previous) => [...previous, event]);
      });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
      setPhase(null);
      lock.current = false;
    }
  }

  const done = Object.values(itemState).filter((item) =>
    ["added", "already"].includes(item.state),
  ).length;
  const signIn = (
    <SignIn
      phone={phone}
      setPhone={setPhone}
      otp={otp}
      setOtp={setOtp}
      auth={auth}
      busy={busy}
      sending={otpSending}
      hasItems={!!picked.length}
      onSignIn={startSignIn}
      onOtp={sendOtp}
    />
  );
  const selection = (
    <section className="selected-panel">
      <header>
        <h2>Your cupboard list</h2>
        <span>{picked.length} selected</span>
      </header>
      {picked.length ? (
        <div className="selection-tags">
          {picked.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : (
        <p className="small-note">
          Pick the staples you&apos;re running low on.
        </p>
      )}
      {summary && (
        <a
          className="button button-primary full-width"
          href="https://www.flipkart.com/viewcart"
          target="_blank"
          rel="noreferrer"
        >
          {summary.added} of {summary.asked} added
          <Icon name="external" size={15} />
        </a>
      )}
      <p className="small-note">
        Added to your regular Flipkart cart. You review the packs, final prices,
        and delivery.
      </p>
    </section>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#cupboard-content">
        Skip to cupboard
      </a>
      <Navigation
        active="pantry"
        busy={busy}
        onActivity={() => setSheet("activity")}
        onBasket={() => setSheet("selection")}
        basketCount={done}
      />
      <div className="app-body">
        <Masthead active="pantry">
          <span className="quiet-promise">
            <Icon name="shield" size={15} />
            You always make the final call.
          </span>
        </Masthead>
        <div className="workspace-grid">
          <main className="cooking-workspace" id="cupboard-content">
            <div className="workspace-scroll" ref={contentRef}>
              <section className="cupboard-heading">
                <div>
                  <span className="eyebrow">FOR THE MEALS STILL TO COME</span>
                  <h1>
                    A well-stocked
                    <br />
                    <em>kind of kitchen.</em>
                  </h1>
                  <p>
                    The ghee, the good masala, the bag of dal. Pick what&apos;s
                    running low and I&apos;ll find the rest.
                  </p>
                </div>
                <div className="cupboard-stamp" aria-hidden="true">
                  <span>THE EVERYDAY</span>
                  <Icon name="jar" />
                  <span>ESSENTIALS</span>
                </div>
              </section>
              <ErrorNotice message={error} />
              {summary && (
                <section className="pantry-result" role="status">
                  <h2>
                    <Icon name="shield" />
                    {summary.added} of {summary.asked} added to your cart.
                  </h2>
                  <p>
                    {summary.cart
                      ? "Cart readback received. Review the contents below and confirm final prices on Flipkart."
                      : "Cart readback was unavailable. The additions above were reported by the agent; confirm the actual contents on Flipkart before paying."}
                  </p>
                  {summary.cart && (
                    <div className="pantry-readback">
                      <h3>Read back from your cart</h3>
                      {summary.cart.items?.length ? (
                        <ul>
                          {summary.cart.items.map((item, index) => (
                            <li key={`${item.name}-${index}`}>
                              <span>{item.name}</span>
                              <span>
                                {item.price > 0
                                  ? `₹${item.price}`
                                  : "Price not available"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          No cart items were returned. Check Flipkart before
                          relying on the reported additions.
                        </p>
                      )}
                      <p>
                        Delivery charges and the final total are confirmed at
                        checkout.
                      </p>
                    </div>
                  )}
                  <a
                    className="button button-primary"
                    href="https://www.flipkart.com/viewcart"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Review your Flipkart cart
                    <Icon name="external" size={16} />
                  </a>
                </section>
              )}
              <div className="mobile-signin">{signIn}</div>
              <div className="section-heading shelf-intro">
                <h2>What&apos;s missing from the shelf?</h2>
                <span>
                  {picked.length
                    ? `${picked.length} selected`
                    : "A few staples go a long way"}
                </span>
              </div>
              <fieldset className="shelf-selection" disabled={busy}>
                <legend className="sr-only">Choose cupboard staples</legend>
                {SHELVES.map((shelf, index) => (
                  <section className="shelf" key={shelf.name}>
                    <div className="shelf-label">
                      <span>0{index + 1}</span>
                      <div>
                        <h3>{shelf.name}</h3>
                        <p>{shelf.note}</p>
                      </div>
                    </div>
                    <div className="ingredient-chips">
                      {shelf.items.map((item) => (
                        <button
                          key={item}
                          className={`ingredient-chip ${picked.includes(item) ? "is-selected" : ""}`}
                          aria-pressed={picked.includes(item)}
                          onClick={() => toggle(item)}
                        >
                          <Icon
                            name={picked.includes(item) ? "check" : "plus"}
                            size={13}
                          />
                          {item}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </fieldset>
              <p className="cupboard-footnote">
                <Icon name="pantry" size={18} />
                This is your cupboard shop, through regular Flipkart. For
                tonight&apos;s fresh ingredients, head back to Cook.
              </p>
              {Object.keys(itemState).length > 0 && (
                <section className="pantry-item-results">
                  <h2>Every item, accounted for.</h2>
                  {Object.entries(itemState).map(([name, item]) => (
                    <article
                      key={name}
                      className={`pantry-item ${item.state === "failed" ? "is-failed" : ["added", "already"].includes(item.state) ? "is-added" : ""}`}
                    >
                      <strong>
                        <Icon
                          name={
                            item.state === "failed"
                              ? "alert"
                              : ["added", "already"].includes(item.state)
                                ? "check"
                                : "search"
                          }
                          size={16}
                        />
                        {name}
                      </strong>
                      <p>
                        {item.state === "working"
                          ? "Checking the shelf…"
                          : item.state === "failed"
                            ? `Unavailable: ${item.why || "No suitable match was found."}`
                            : `${item.state === "already" ? "Already in the cart" : item.substituted ? "Alternative added" : "Added"}${item.product ? ` · ${item.product}` : ""}${item.pack ? ` · ${item.pack}` : ""}${item.priceUnknown || item.price == null ? " · Price not available" : ` · ₹${item.price}`}`}
                      </p>
                    </article>
                  ))}
                </section>
              )}
            </div>
            <div className="composer-wrap pantry-composer">
              <div>
                <strong>
                  {busy
                    ? `${done} of ${picked.length} in the cart`
                    : `${picked.length} ${picked.length === 1 ? "staple" : "staples"} on your list`}
                </strong>
                <p>
                  {auth.awaitingOtp
                    ? "Your sign-in is waiting for a code."
                    : busy
                      ? "Every choice is recorded in the notebook."
                      : "Stock checked. Cart verified. You pay."}
                </p>
              </div>
              <button
                className={`button ${auth.awaitingOtp ? "button-action" : "button-primary"}`}
                disabled={!picked.length || (busy && !auth.awaitingOtp)}
                onClick={() =>
                  auth.awaitingOtp || !auth.signedIn
                    ? setSheet("signin")
                    : stockUp()
                }
              >
                {auth.awaitingOtp
                  ? "Enter your code"
                  : busy
                    ? "Working…"
                    : auth.signedIn
                      ? "Stock my cupboard"
                      : "Continue"}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </main>
          <aside className="workspace-aside pantry-aside">
            {signIn}
            <ActivityFeed
              events={events}
              busy={busy}
              phase={phase}
              credits={credits}
            />
          </aside>
        </div>
      </div>
      <Sheet
        open={sheet === "signin"}
        onClose={() => setSheet(null)}
        title={
          auth.awaitingOtp
            ? "One quick kitchen handover."
            : "Connect your Flipkart account"
        }
      >
        {signIn}
        <ErrorNotice message={error} />
      </Sheet>
      <Sheet
        open={sheet === "activity"}
        onClose={() => setSheet(null)}
        title="Live activity"
        className="activity-sheet"
      >
        <ActivityFeed
          events={events}
          busy={busy}
          phase={phase}
          credits={credits}
        />
      </Sheet>
      <Sheet
        open={sheet === "selection"}
        onClose={() => setSheet(null)}
        title="Your cupboard list"
      >
        {selection}
      </Sheet>
    </div>
  );
}

function SignIn({
  phone,
  setPhone,
  otp,
  setOtp,
  auth,
  busy,
  sending,
  hasItems,
  onSignIn,
  onOtp,
}) {
  const id = useId();
  return (
    <section className={`signin-panel ${auth.awaitingOtp ? "otp-panel" : ""}`}>
      <header className="signin-heading">
        <span>
          <Icon name={auth.signedIn ? "shield" : "phone"} size={19} />
        </span>
        <div>
          <span className="eyebrow">
            {auth.signedIn
              ? "CONNECTED TO FLIPKART"
              : auth.awaitingOtp
                ? "YOUR SESSION IS OPEN"
                : "A QUICK HANDOVER"}
          </span>
          <h2>
            {auth.signedIn
              ? "Ready when you are."
              : auth.awaitingOtp
                ? "Your phone. Your permission."
                : "Let’s connect your cart."}
          </h2>
        </div>
      </header>
      {auth.awaitingOtp ? (
        <>
          <p>
            Enter the code sent to{" "}
            {phone ? `••••••${phone.slice(-4)}` : "your phone"}. I&apos;ll
            continue with your selected groceries.
          </p>
          <span className="session-live">
            <i />A live sign-in is waiting. Keep this page open.
          </span>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onOtp();
            }}
          >
            <label htmlFor={`otp-${id}`}>Flipkart verification code</label>
            <input
              id={`otp-${id}`}
              className="otp-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              maxLength={8}
              placeholder="· · · · · ·"
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))
              }
              disabled={sending}
            />
            <button
              className="button button-action full-width"
              type="submit"
              disabled={otp.length < 4 || sending}
            >
              {sending ? "Sending code…" : "Verify & continue"}
              <Icon name="arrow" size={16} />
            </button>
          </form>
          <p className="small-note">
            The sign-in is short-lived. No payment will be made.
          </p>
        </>
      ) : auth.signedIn ? (
        <p>
          Your account is connected for this session. I&apos;ll find your
          staples and check the actual cart after adding them.
        </p>
      ) : (
        <>
          <p>
            Your selected groceries go into your own Flipkart cart. Sign in with
            your phone to get started.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSignIn();
            }}
          >
            <label htmlFor={`phone-${id}`}>Flipkart phone number</label>
            <div className="phone-field">
              <span>+91</span>
              <input
                id={`phone-${id}`}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                placeholder="10-digit mobile number"
                onChange={(event) =>
                  setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
                }
                disabled={busy}
              />
            </div>
            <button
              className="button button-primary full-width"
              disabled={phone.length !== 10 || busy || !hasItems}
              type="submit"
            >
              {busy ? "Opening your sign-in…" : "Send verification code"}
              <Icon name="arrow" size={16} />
            </button>
          </form>
          <p className="small-note">
            {!hasItems
              ? "Select your staples first, then sign in."
              : "After verification, I’ll start adding your selected staples."}
          </p>
        </>
      )}
    </section>
  );
}
