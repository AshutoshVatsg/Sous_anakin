"use client";
import { useState, useCallback, useRef } from "react";
import { streamPost } from "../lib/stream";
import { detectExtension, fillViaExtension } from "../lib/extension";

export const budgetLabel = (value, mode) =>
  value ? `${mode === "under" ? "under" : "around"} ₹${value}` : "Any budget";

/** The existing find → cook → basket contracts, isolated from presentation. */
export function useCooking() {
  const [input, setInput] = useState("");
  const [pantry, setPantry] = useState(["onion", "tomato", "oil", "salt"]);
  const [serves, setServes] = useState(2);
  const [budget, setBudget] = useState(0);
  const [budgetMode, setBudgetMode] = useState("around");
  const [budgetPinned, setBudgetPinned] = useState(false);
  const [proteinGoal, setProteinGoal] = useState(null);
  const [dishes, setDishes] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [plan, setPlan] = useState(null);
  const [cart, setCart] = useState(null);
  const [events, setEvents] = useState([]);
  const [itemState, setItemState] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [request, setRequest] = useState("");
  const [notice, setNotice] = useState(null);
  const [completed, setCompleted] = useState(false);
  const lock = useRef(false);
  const push = (event) => setEvents((previous) => [...previous, event]);
  const togglePantry = (item) =>
    setPantry((previous) =>
      previous.includes(item)
        ? previous.filter((value) => value !== item)
        : [...previous, item],
    );

  const findDishes = useCallback(
    async (craving) => {
      if (lock.current || !craving.trim()) return;
      lock.current = true;
      setBusy("finding");
      setError(null);
      setEvents([]);
      setDishes([]);
      setChosen(null);
      setPlan(null);
      setCart(null);
      setItemState({});
      setProteinGoal(null);
      setCompleted(false);
      setRequest(craving);
      setInput("");
      const asked = budgetPinned ? budget : 0;
      if (!budgetPinned && budget) setBudget(0);
      setNotice({
        title: "Finding your kind of dinner.",
        detail:
          "Searching recipe sites and checking what is already in your kitchen.",
      });
      let fit = null,
        protein = null;
      try {
        await streamPost(
          "/api/find",
          { craving, pantry, pages: 16, want: 5, budget: asked, budgetMode },
          (event) => {
            if (event.type === "protein" && event.data) {
              protein = event.data;
              if (protein.goal) setProteinGoal(protein.goal);
              push(event);
            } else if (event.type === "budget" && event.data) {
              setBudget(event.data.budget);
              setBudgetMode(event.data.mode);
              if (event.data.within !== undefined) fit = event.data;
              push(event);
            } else if (event.type === "dishes") {
              const found = event.data.dishes || [];
              setDishes(found);
              const sites = new Set(found.map((dish) => dish.host)).size;
              const title = protein?.best
                ? `Up to ${protein.best} g protein per serving.`
                : fit
                  ? fit.within
                    ? `${fit.within} of ${found.length} dishes cook for ${fit.mode} ₹${fit.budget}.`
                    : `No exact budget match. Here are the closest options.`
                  : found.length
                    ? `${found.length} ways to make dinner yours.`
                    : "No usable recipes this time.";
              setNotice({
                title,
                detail: found.length
                  ? `Recipes from ${sites} ${sites === 1 ? "source" : "sources"} · ranked for your kitchen${event.data.seconds != null ? ` · ${event.data.seconds}s` : ""}`
                  : "Try another ingredient or the name of a dish.",
              });
              push({
                ...event,
                message: `${found.length} recipes shortlisted from ${sites} sources`,
              });
            } else if (event.type === "error") {
              setError(event.message);
              push(event);
            } else push(event);
          },
        );
      } catch (failure) {
        setError(failure.message);
      } finally {
        setBusy(null);
        lock.current = false;
      }
    },
    [pantry, budget, budgetMode, budgetPinned],
  );

  const planDish = useCallback(
    async (dish) => {
      if (lock.current) return;
      lock.current = true;
      setBusy("planning");
      setError(null);
      setChosen(dish);
      setPlan(null);
      setCart(null);
      setEvents([]);
      setItemState({});
      setCompleted(false);
      setNotice({
        title: "A closer look at your kitchen.",
        detail: "Reading the recipe and reasoning through each ingredient.",
      });
      try {
        await streamPost(
          "/api/cook",
          { dish: dish.title, url: dish.url, pantry, serves },
          (event) => {
            if (event.type === "plan") {
              setPlan(event.data);
              const count = event.data.buy.length;
              setNotice({
                title: count
                  ? `${count} things to pick up. The rest is covered.`
                  : "Everything you need is already in your kitchen.",
                detail:
                  "Every ingredient checked against this recipe and your pantry.",
              });
              push({
                ...event,
                message: `Kitchen checked: ${event.data.have.length} covered, ${count} to buy`,
              });
            } else if (event.type === "error") {
              setError(event.message);
              push(event);
            } else push(event);
          },
        );
      } catch (failure) {
        setError(failure.message);
      } finally {
        setBusy(null);
        lock.current = false;
      }
    },
    [pantry, serves],
  );

  const fillBasket = useCallback(async () => {
    if (lock.current || !plan?.buy?.length) return;
    lock.current = true;
    setBusy("filling");
    setError(null);
    setEvents([]);
    setItemState({});
    setCompleted(false);
    setNotice({
      title: "Checking the shelf. Filling your basket.",
      detail:
        "Stock first, then the click. Each addition is checked against the real cart.",
    });
    try {
      // Where the adding happens depends on where this is running.
      //
      // Locally the server drives a Chrome you started on a debug port. Deployed it
      // cannot: there is no browser on the server, and nobody should hand it their
      // Flipkart login. So if the handover extension is installed, the adding runs
      // in the visitor's OWN browser and their credentials never leave the machine.
      // Same events either way, so the feed below does not care which path ran.
      const ext = await detectExtension();
      // Localhost normally keeps the server-driven fallback, because that is how
      // the agent is developed. Add ?extonly to the URL to drop it and behave
      // exactly like the deployed site — the only honest way to test the handover,
      // since the fallback otherwise fills the cart anyway and hides a dead bridge.
      const local =
        typeof window !== "undefined" &&
        /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) &&
        !new URLSearchParams(window.location.search).has("extonly");

      // Hosted, with no extension: say the true thing rather than the local one.
      // Falling through to /api/basket here tells a visitor to start Chrome with a
      // debug port, which is advice about OUR laptop and useless on theirs.
      if (!ext && !local) {
        setError({
          tone: "guide",
          title: "One 30-second step, and the cart is yours.",
          body:
            "Filling a cart happens inside your own browser, so your Flipkart " +
            "login never reaches us and we can never pay for you.",
          steps: [
            "Download the extension below and unzip it.",
            "Open chrome://extensions and turn on Developer mode.",
            "Choose Load unpacked and pick the unzipped folder.",
            "Be signed in to Flipkart with a Minutes delivery address set.",
            "Come back and press Add groceries again.",
          ],
          action: { label: "Download the Sous extension", href: "/sous-extension.zip" },
        });
        setNotice({
          title: "The shopping list is ready. The cart is yours to fill.",
          detail:
            "Install the handover extension to add these to your own Flipkart cart.",
        });
        push({ type: "warn", message: "no Sous extension detected in this browser" });
        return;
      }

      const run = ext
        ? (onEvent) => fillViaExtension(plan.buy, onEvent)
        : (onEvent) => streamPost("/api/basket", { items: plan.buy }, onEvent);

      if (ext) {
        push({
          type: "wire",
          message: `handing over to your browser via the Sous extension v${ext.version}`,
        });
      }

      await run((event) => {
        if (event.type === "item" && event.data?.name) {
          setItemState((previous) => ({
            ...previous,
            [event.data.name]: event.data,
          }));
          push(event);
        } else if (event.type === "done") {
          if (event.data?.cart) setCart(event.data.cart);
          setCompleted(true);
          setNotice({
            title: `${event.data.added} of ${event.data.asked} added. Payment is yours.`,
            detail:
              "Review your actual Flipkart cart, including any delivery charges, before paying.",
          });
          push(event);
        } else if (event.type === "cart") {
          // Defensive: an event from the extension is a different transport to the
          // SSE route, and a missing field should never take the page down.
          if (event.data?.cart) setCart(event.data.cart);
          push(event);
        } else if (event.type === "error") {
          setError(event.message);
          push(event);
        } else push(event);
      });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }, [plan]);

  return {
    input,
    setInput,
    pantry,
    togglePantry,
    serves,
    setServes,
    budget,
    setBudget,
    budgetMode,
    setBudgetMode,
    setBudgetPinned,
    proteinGoal,
    dishes,
    chosen,
    plan,
    cart,
    events,
    itemState,
    busy,
    error,
    request,
    notice,
    completed,
    findDishes,
    planDish,
    fillBasket,
  };
}
