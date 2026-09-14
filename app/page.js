"use client";
import { useEffect, useRef, useState } from "react";
import { useCooking, budgetLabel } from "./hooks/use-cooking";
import { Icon } from "./components/icons";
import {
  Navigation,
  Masthead,
  Sheet,
  FoodPhoto,
  ActivityFeed,
  ErrorNotice,
} from "./components/workspace";

const PANTRY = [
  "onion",
  "tomato",
  "oil",
  "salt",
  "ginger",
  "garlic",
  "garam masala",
  "turmeric",
  "cumin",
  "chilli powder",
  "butter",
  "curd",
  "rice",
  "atta",
  "paneer",
  "potato",
  "green chilli",
  "coriander",
];
const CRAVINGS = ["paneer", "chole", "dal", "rajma", "aloo", "biryani"];
const INSPIRATION = [
  {
    name: "Paneer Butter Masala",
    note: "Rich, creamy comfort",
    photo: "/food/paneer.jpg",
    tone: "peach",
  },
  {
    name: "Palak Paneer",
    note: "A little more green",
    photo: "/food/palak.jpg",
    tone: "sage",
  },
  {
    name: "Chole Masala",
    note: "Made for a hungry evening",
    photo: "/food/chole.jpg",
    tone: "butter",
  },
];
const STYLE = {
  dry: "Dry sabzi",
  gravy: "Gravy",
  grilled: "Grilled",
  rice: "Rice",
  snack: "Starter",
  bread: "Bread",
  drink: "Drink",
  sweet: "Sweet",
};
const amount = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? `₹${Math.round(value).toLocaleString("en-IN")}`
    : "—";

export default function Home() {
  const cooking = useCooking();
  const {
    pantry,
    serves,
    budget,
    budgetMode,
    dishes,
    chosen,
    plan,
    cart,
    busy,
    events,
    request,
    notice,
    error,
    itemState,
    completed,
  } = cooking;
  const [sheet, setSheet] = useState(null);
  const [showChoices, setShowChoices] = useState(false);
  const contentRef = useRef(null);
  const empty = !request && !busy;
  const cartCount = cart?.items?.length || 0;
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
    setShowChoices(false);
  }, [chosen, request]);
  useEffect(() => {
    if (!plan || !contentRef.current) return;
    const viewport = contentRef.current;
    const panel = viewport.querySelector(".plan-panel");
    if (panel)
      viewport.scrollTop +=
        panel.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        18;
  }, [plan]);
  function submit(event) {
    event.preventDefault();
    cooking.findDishes(cooking.input);
  }
  const basket = (
    <Basket
      cart={cart}
      plan={plan}
      busy={busy}
      completed={completed}
      itemState={itemState}
      onFill={cooking.fillBasket}
    />
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#dinner-content">
        Skip to dinner
      </a>
      <Navigation
        busy={!!busy}
        onActivity={() => setSheet("activity")}
        onBasket={() => setSheet("basket")}
        basketCount={cartCount}
      />
      <div className="app-body">
        <Masthead>
          <span className="quiet-promise">
            <Icon name="shield" size={15} />
            Your kitchen. Your call.
          </span>
        </Masthead>
        <div className="workspace-grid">
          <main className="cooking-workspace" id="dinner-content">
            <div className="workspace-scroll" ref={contentRef}>
              {empty ? (
                <Welcome
                  onPick={cooking.findDishes}
                  pantry={pantry}
                  onKitchen={() => setSheet("kitchen")}
                />
              ) : (
                <>
                  <div className="request-line">
                    <span className="eyebrow">ON THE MENU</span>
                    <p>{request}</p>
                    <span className="request-serves">
                      <Icon name="people" size={16} />
                      {serves}
                    </span>
                  </div>
                  <Workflow
                    busy={busy}
                    chosen={chosen}
                    plan={plan}
                    completed={completed}
                  />
                  <div className="result-intro" role="status">
                    <span className="eyebrow">
                      {completed
                        ? "THE HANDOVER"
                        : chosen
                          ? "YOUR DINNER, WORKED OUT"
                          : "FOUND FOR YOUR KITCHEN"}
                    </span>
                    <h1>{notice?.title}</h1>
                    <p>{notice?.detail}</p>
                  </div>
                  <ErrorNotice message={error} />
                  {busy === "finding" && (
                    <WorkingState
                      events={events}
                      stage="Searching the recipe shelves"
                    />
                  )}
                  {busy === "planning" && (
                    <WorkingState
                      events={events}
                      stage={`Checking ${chosen?.title || "your recipe"}`}
                    />
                  )}
                  {chosen && dishes.length > 0 && (
                    <button
                      className="text-button change-dish"
                      disabled={!!busy}
                      onClick={() => setShowChoices((value) => !value)}
                    >
                      <Icon name={showChoices ? "close" : "back"} size={16} />
                      {showChoices
                        ? "Keep this dish"
                        : "Choose a different dish"}
                      <span>{dishes.length} options</span>
                    </button>
                  )}
                  {dishes.length > 0 && (!chosen || showChoices) && (
                    <section
                      aria-label="Recipe options"
                      className="recipe-section"
                    >
                      <div className="section-heading">
                        <h2>Your shortlist</h2>
                        <span>
                          {budget
                            ? budgetLabel(budget, budgetMode)
                            : "Ranked by your pantry"}
                        </span>
                      </div>
                      <div className="dish-grid">
                        {dishes.map((dish, index) => (
                          <DishCard
                            key={dish.url}
                            dish={dish}
                            index={index}
                            active={chosen?.url === dish.url}
                            disabled={!!busy}
                            budget={budget}
                            budgetMode={budgetMode}
                            goal={cooking.proteinGoal}
                            onPick={() => cooking.planDish(dish)}
                          />
                        ))}
                      </div>
                      <p className="source-note">
                        <Icon name="book" size={15} />
                        Real recipes from the web. Prices are estimates unless
                        marked as observed.
                      </p>
                    </section>
                  )}
                  {plan && (
                    <PlanPanel
                      key={plan.recipe.url}
                      plan={plan}
                      busy={busy}
                      completed={completed}
                      itemState={itemState}
                      onFill={cooking.fillBasket}
                    />
                  )}
                  {chosen && error && !plan && !busy && (
                    <button
                      className="button button-primary"
                      onClick={() => cooking.planDish(chosen)}
                    >
                      Retry kitchen check
                      <Icon name="arrow" size={17} />
                    </button>
                  )}
                </>
              )}
            </div>
            <Composer
              cooking={cooking}
              onSubmit={submit}
              onKitchen={() => setSheet("kitchen")}
            />
          </main>
          <aside
            className="workspace-aside"
            aria-label="Basket and agent activity"
          >
            {basket}
            <ActivityFeed events={events} busy={!!busy} phase={busy} />
          </aside>
        </div>
      </div>
      <Sheet
        open={sheet === "kitchen"}
        onClose={() => setSheet(null)}
        title="A little about your kitchen"
      >
        <Kitchen cooking={cooking} onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet
        open={sheet === "activity"}
        onClose={() => setSheet(null)}
        title="Live activity"
        className="activity-sheet"
      >
        <ActivityFeed events={events} busy={!!busy} phase={busy} />
      </Sheet>
      <Sheet
        open={sheet === "basket"}
        onClose={() => setSheet(null)}
        title="Your dinner basket"
        className="basket-sheet"
      >
        {basket}
      </Sheet>
    </div>
  );
}

function Welcome({ onPick, pantry, onKitchen }) {
  return (
    <div className="welcome">
      <section className="welcome-intro">
        <div className="welcome-copy">
          <span className="eyebrow">
            <span className="tiny-line" /> LESS PLANNING. MORE COOKING.
          </span>
          <h1>
            What sounds
            <br />
            good <em>tonight?</em>
          </h1>
          <p>
            You bring the craving. I&apos;ll find the recipe,
            <br className="desktop-break" /> check your kitchen, and shop for
            what&apos;s missing.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="plate-orbit" />
          <FoodPhoto src="/food/paneer.jpg" priority />
          <span className="photo-label">
            <Icon name="leaf" size={15} />
            Made for your kitchen
          </span>
          <span className="art-caption">a little inspiration</span>
        </div>
      </section>
      <section className="kitchen-strip" aria-label="Current pantry">
        <div className="kitchen-strip-icon">
          <Icon name="pantry" size={22} />
        </div>
        <div>
          <span className="eyebrow">ALREADY IN YOUR KITCHEN</span>
          <p>
            {pantry.length
              ? pantry.slice(0, 5).join(" · ")
              : "Tell me what you have"}
            {pantry.length > 5 ? ` + ${pantry.length - 5} more` : ""}
          </p>
        </div>
        <button className="text-button" onClick={onKitchen}>
          Edit
          <Icon name="sliders" size={15} />
        </button>
      </section>
      <section className="inspiration-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A STARTING POINT</span>
            <h2>A few good cravings.</h2>
          </div>
          <span>Pick one. Make it yours.</span>
        </div>
        <div className="inspiration-grid">
          {INSPIRATION.map((dish) => (
            <button
              className={`inspiration-card tint-${dish.tone}`}
              key={dish.name}
              onClick={() => onPick(dish.name)}
            >
              <FoodPhoto src={dish.photo} priority />
              <div className="inspiration-caption">
                <div>
                  <h3>{dish.name}</h3>
                  <p>{dish.note}</p>
                </div>
                <span className="round-arrow">
                  <Icon name="arrow" size={18} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="how-sous-works" aria-label="How Sous helps">
        <div>
          <span>01</span>
          <p>
            <strong>Find something worth cooking.</strong>Recipes from the real
            web.
          </p>
        </div>
        <div>
          <span>02</span>
          <p>
            <strong>Make the most of what you have.</strong>A reason for every
            ingredient.
          </p>
        </div>
        <div>
          <span>03</span>
          <p>
            <strong>Let me handle the groceries.</strong>You review the cart and
            pay.
          </p>
        </div>
      </section>
    </div>
  );
}

function Workflow({ busy, chosen, plan, completed }) {
  const current = completed || busy === "filling" ? 2 : chosen ? 1 : 0;
  return (
    <ol className="workflow" aria-label="Dinner progress">
      {[
        ["Find a dish", "search"],
        ["Check the kitchen", "pantry"],
        ["Fill the basket", "basket"],
      ].map(([label, icon], index) => (
        <li
          key={label}
          className={`${index === current ? "current" : ""} ${index < current || completed ? "complete" : ""}`}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="workflow-icon">
            <Icon
              name={index < current || completed ? "check" : icon}
              size={16}
            />
          </span>
          <span>{label}</span>
          {index === 1 && plan && (
            <span className="workflow-count">{plan.buy.length} to buy</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function WorkingState({ events, stage }) {
  const recent = events.filter((event) => event.message).slice(-3);
  return (
    <section className="working-state" aria-label={stage}>
      <div className="working-symbol">
        <Icon name="search" size={26} />
      </div>
      <h2>{stage}</h2>
      <p>The notebook is filling up as the work happens.</p>
      <div className="working-events">
        {recent.length ? (
          recent.map((event, index) => (
            <div key={`${event.type}-${index}`}>
              <span>{event.t != null ? `${event.t}s` : "…"}</span>
              <p>{event.message}</p>
            </div>
          ))
        ) : (
          <div>
            <span>…</span>
            <p>Connecting to the recipe search.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function DishCard({
  dish,
  index,
  onPick,
  disabled,
  active,
  budget,
  budgetMode,
  goal,
}) {
  const cost = dish.cost;
  const over =
    budget > 0 &&
    cost?.priced > 0 &&
    cost.meal > budget * (budgetMode === "under" ? 1.02 : 1.15);
  return (
    <button
      className={`dish-card ${active ? "is-selected" : ""}`}
      onClick={onPick}
      disabled={disabled}
      aria-label={`Plan ${dish.title}`}
      aria-pressed={active}
    >
      <div className="dish-image">
        <FoodPhoto src={dish.image} />
        <span className="dish-index">0{index + 1}</span>
        <div className="photo-badges">
          {dish.minutes != null && (
            <span>
              <Icon name="clock" size={13} />
              {dish.minutes} min
            </span>
          )}
          {dish.rating != null && (
            <span>
              <Icon name="star" size={13} />
              {Number(dish.rating).toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <div className="dish-body">
        <p className="dish-source">
          {dish.host || "Recipe source"}
          {dish.cuisine ? ` · ${dish.cuisine}` : ""}
        </p>
        <h3>{dish.title}</h3>
        <div className="dish-tags">
          {STYLE[dish.kind] && <span>{STYLE[dish.kind]}</span>}
          {dish.light && (
            <span className="tag-green" title={dish.light}>
              Lighter
            </span>
          )}
          {dish.protein != null ? (
            <span className="tag-green">
              {dish.protein} g protein
              {goal
                ? ` · ${Math.round((dish.protein / goal) * 100)}% of goal`
                : ""}
            </span>
          ) : goal ? (
            <span>Protein not published</span>
          ) : null}
          {over && <span className="tag-warm">Over budget</span>}
        </div>
        <div className="dish-cost">
          {cost?.priced > 0 ? (
            <>
              <div>
                <strong>
                  {cost.source === "live" ? "" : "≈ "}
                  {amount(cost.keeps > 0 ? cost.meal : cost.total)}
                </strong>
                <span>{cost.keeps > 0 ? "to cook" : "to shop"}</span>
              </div>
              <div className="first-shop">
                {cost.keeps > 0 ? (
                  <>
                    <strong>{amount(cost.total)}</strong>
                    <span>first shop</span>
                  </>
                ) : (
                  <span>
                    {cost.unpriced?.length
                      ? `${cost.priced}/${cost.count} priced`
                      : cost.source === "live"
                        ? "Observed prices"
                        : "Estimate"}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="price-unknown">Price not yet available</span>
          )}
        </div>
        <Coverage
          have={dish.haveCount}
          total={dish.totalIngredients}
          need={dish.needCount}
        />
        <span className="dish-pick">
          {active ? "Your chosen dish" : "Make a plan"}
          <Icon name={active ? "check" : "arrow"} size={16} />
        </span>
      </div>
    </button>
  );
}

function Coverage({ have = 0, total = 0, need }) {
  const percent = total
    ? Math.max(0, Math.min(100, Math.round((have / total) * 100)))
    : 0;
  return (
    <div className="coverage">
      <div>
        <span>
          <Icon name="pantry" size={15} />
          You have{" "}
          <strong>
            {have}
            <small>/{total}</small>
          </strong>
        </span>
        <span>{need ?? Math.max(0, total - have)} to buy</span>
      </div>
      <div
        className="coverage-track"
        role="meter"
        aria-label="Ingredients in your kitchen"
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuenow={have}
        aria-valuetext={`${have} of ${total} ingredients in your kitchen`}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function PlanPanel({ plan, busy, completed, itemState, onFill }) {
  const { recipe, have = [], buy = [], cost } = plan;
  const [method, setMethod] = useState(false);
  useEffect(() => {
    if (completed || !buy.length) setMethod(true);
  }, [completed, buy.length]);
  const done = Object.values(itemState).filter((item) =>
    ["added", "already"].includes(item.state),
  ).length;
  const failed = Object.values(itemState).filter(
    (item) => item.state === "failed",
  ).length;
  return (
    <section className="plan-panel" aria-label="Your dinner plan">
      <header className="plan-heading">
        <FoodPhoto src={recipe.image} />
        <div>
          <span className="eyebrow">TONIGHT&apos;S RECIPE</span>
          <h2>{recipe.title}</h2>
          <div className="recipe-meta">
            <span>
              <Icon name="people" size={15} />
              Serves {plan.serves}
            </span>
            {recipe.minutes != null && (
              <span>
                <Icon name="clock" size={15} />
                {recipe.minutes} min
              </span>
            )}
            <a href={recipe.url} target="_blank" rel="noreferrer">
              {recipe.host}
              <Icon name="external" size={13} />
            </a>
          </div>
        </div>
      </header>
      <div className="plan-summary">
        <Coverage
          have={have.length}
          total={have.length + buy.length}
          need={buy.length}
        />
        <div>
          <Icon name="shield" size={19} />
          <p>
            {plan.reasoned
              ? "Reasoned through, ingredient by ingredient."
              : "Checked against your pantry."}
            <span>Only what this recipe actually needs.</span>
          </p>
        </div>
      </div>
      <section className="covered-section">
        <div className="section-heading">
          <h3>
            <span className="status-circle">
              <Icon name="check" size={15} />
            </span>
            Already covered <span className="count-label">{have.length}</span>
          </h3>
        </div>
        <div className="covered-grid">
          {have.map((item, index) => (
            <div key={index}>
              <Icon name="check" size={15} />
              <p>
                <strong>{item.name}</strong>
                {item.reason && <span>{item.reason}</span>}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="buy-section">
        <div className="section-heading">
          <h3>
            <span className="status-circle warm">
              <Icon name="basket" size={15} />
            </span>
            The little shopping list{" "}
            <span className="count-label">{buy.length}</span>
          </h3>
          {done > 0 && <span className="positive-text">{done} in cart</span>}
        </div>
        {buy.length ? (
          <div className="buy-list">
            {buy.map((item, index) => (
              <BuyRow
                key={`${item.name}-${index}`}
                item={item}
                state={itemState[item.name]}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="all-covered">
            <Icon name="leaf" size={25} />
            <p>No groceries needed. You&apos;re ready to cook.</p>
          </div>
        )}
      </section>
      {recipe.steps?.length > 0 && (
        <section className="method-section">
          <button
            className="method-toggle"
            onClick={() => setMethod((value) => !value)}
            aria-expanded={method}
            aria-controls="cooking-method"
          >
            <span>
              <Icon name="book" size={19} />
              <strong>Let&apos;s cook.</strong>
              <span>{recipe.steps.length} steps</span>
            </span>
            <Icon name="down" size={17} className={method ? "rotated" : ""} />
          </button>
          {method && (
            <ol id="cooking-method" className="method-steps">
              {recipe.steps.map((step, index) => (
                <li key={index}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      {buy.length > 0 && (
        <footer className="plan-footer">
          <div>
            {cost?.priced > 0 ? (
              <>
                <span className="eyebrow">
                  {cost.source === "live"
                    ? "OBSERVED ITEM PRICES"
                    : "ESTIMATED FIRST SHOP"}
                </span>
                <p className="plan-price">
                  {cost.source === "live" ? "" : "≈ "}
                  {amount(cost.total)}
                  {cost.keeps > 0 && (
                    <span>{amount(cost.keeps)} is pantry stock you keep</span>
                  )}
                </p>
                <p className="small-note">
                  {cost.unpriced?.length
                    ? `${cost.priced} of ${cost.count} items priced. `
                    : ""}
                  Delivery fees are confirmed by Flipkart.
                </p>
              </>
            ) : (
              <p>Prices confirmed when we check the shelf.</p>
            )}
          </div>
          {completed ? (
            <a
              className="button button-primary"
              href="https://www.flipkart.com/viewcart"
              target="_blank"
              rel="noreferrer"
            >
              Review your cart
              <Icon name="external" size={16} />
            </a>
          ) : (
            <button
              className="button button-action"
              onClick={onFill}
              disabled={!!busy}
            >
              {busy === "filling"
                ? `Adding · ${done}/${buy.length}`
                : `Add ${buy.length} to Flipkart Minutes`}
              <Icon name="arrow" size={17} />
            </button>
          )}
          <p className="plan-promise">
            <Icon name="shield" size={14} />
            {completed
              ? `${done} in the cart${failed ? ` · ${failed} unavailable` : ""}. I’ve stopped here. Payment is yours.`
              : "I check stock, add the groceries, and stop before payment."}
          </p>
        </footer>
      )}
    </section>
  );
}

function BuyRow({ item, state, index = 0 }) {
  const landed = ["added", "already"].includes(state?.state);
  const failed = state?.state === "failed";
  const working = state?.state === "working";
  return (
    <article
      className={`buy-row ${landed ? "is-added" : failed ? "is-failed" : working ? "is-working" : ""}`}
    >
      <span className="buy-number">
        {landed ? (
          <Icon name="check" size={18} />
        ) : failed ? (
          <Icon name="close" size={18} />
        ) : (
          String(index + 1).padStart(2, "0")
        )}
      </span>
      <div className="buy-detail">
        <div className="buy-title">
          <h4>{item.name}</h4>
          {item.qty && <span>{item.qty}</span>}
          {item.optional && <small>Optional</small>}
        </div>
        {item.asWritten && (
          <span className="as-written">Recipe calls it {item.asWritten}</span>
        )}
        {item.reason && <p className="ingredient-reason">{item.reason}</p>}
        {working && (
          <p className="item-update">
            <span className="live-dot" />
            Checking stock and the best match…
          </p>
        )}
        {landed && (
          <p className="item-update">
            <Icon name={state.substituted ? "swap" : "check"} size={15} />
            <span>
              {state.substituted
                ? "Alternative added: "
                : state.state === "already"
                  ? "Already in cart: "
                  : "Added: "}
              {state.product || item.name}
              {state.pack ? ` · ${state.pack}` : ""}
              {state.price != null ? ` · ${amount(state.price)}` : ""}
            </span>
          </p>
        )}
        {failed && (
          <p className="item-update">
            <Icon name="alert" size={15} />
            <span>
              Unavailable: {state.why || "No suitable product found."}
            </span>
          </p>
        )}
      </div>
    </article>
  );
}

function Basket({ cart, plan, busy, completed, itemState, onFill }) {
  const actualItems = cart?.items || [];
  const planned = plan?.buy || [];
  const hasCart = !!cart;
  const count = hasCart ? actualItems.length : planned.length;
  return (
    <section className="basket-panel">
      <header className="basket-heading">
        <span className="basket-heading-icon">
          <Icon name="basket" size={21} />
        </span>
        <div>
          <span className="eyebrow">
            {completed && hasCart
              ? "CHECKED IN FLIPKART"
              : completed
                ? "READBACK UNAVAILABLE"
                : hasCart
                  ? "FROM YOUR REAL CART"
                  : "JUST THE MISSING BITS"}
          </span>
          <h2>Your dinner basket</h2>
        </div>
        <span className="basket-count">{count}</span>
      </header>
      <div className="basket-items">
        {!count ? (
          <div className="basket-empty">
            <div className="basket-sketch">
              <Icon name="basket" size={40} />
              <Icon name="leaf" size={24} />
            </div>
            <h3>A good dinner starts here.</h3>
            <p>
              Choose a recipe. I&apos;ll work out
              <br />
              the little shopping list.
            </p>
          </div>
        ) : (
          <>
            <div className="basket-list-label">
              <span>{hasCart ? "Cart readback" : "Planned shopping list"}</span>
              {cart?.address && (
                <span title={cart.address}>{cart.address}</span>
              )}
            </div>
            {hasCart
              ? actualItems.map((item, index) => (
                  <div
                    className={`basket-item ${item.outOfStock ? "unavailable" : ""}`}
                    key={index}
                  >
                    <span className="basket-item-icon">
                      <Icon
                        name={item.outOfStock ? "alert" : "check"}
                        size={15}
                      />
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {item.pack || "Pack not reported"}
                        {item.qty != null ? ` · qty ${item.qty}` : ""}
                        {item.outOfStock ? " · out of stock" : ""}
                      </span>
                    </div>
                    <b>{amount(item.price)}</b>
                  </div>
                ))
              : planned.map((item, index) => (
                  <div className="basket-item" key={index}>
                    <span className="basket-item-icon">
                      <Icon
                        name={
                          ["added", "already"].includes(
                            itemState[item.name]?.state,
                          )
                            ? "check"
                            : "plus"
                        }
                        size={14}
                      />
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.qty || "Pack to be checked"}</span>
                    </div>
                  </div>
                ))}
          </>
        )}
      </div>
      <footer className="basket-footer">
        <div className="basket-total">
          <span>
            {hasCart
              ? "Cart subtotal"
              : planned.length
                ? "Estimated first shop"
                : "Your shopping list"}
            <small>
              {hasCart
                ? "Fees confirmed at checkout"
                : planned.length
                  ? "Before delivery fees"
                  : "Only what you need"}
            </small>
          </span>
          <strong>
            {hasCart
              ? amount(cart.total)
              : plan?.cost?.priced
                ? `${plan.cost.source === "live" ? "" : "≈ "}${amount(plan.cost.total)}`
                : "—"}
          </strong>
        </div>
        {completed || (hasCart && !busy) ? (
          <a
            className="button button-primary full-width"
            href="https://www.flipkart.com/viewcart"
            target="_blank"
            rel="noreferrer"
          >
            Review on Flipkart
            <Icon name="external" size={16} />
          </a>
        ) : (
          <button
            className="button button-action full-width"
            disabled={!!busy || !planned.length}
            onClick={onFill}
          >
            {busy === "filling"
              ? "Filling your basket…"
              : planned.length
                ? `Add ${planned.length} groceries`
                : "Choose a dish to begin"}
            <Icon name="arrow" size={16} />
          </button>
        )}
        <p className="checkout-promise">
          <Icon name="shield" size={13} />
          {completed
            ? "I stopped here. Payment is yours."
            : "You always review and pay."}
        </p>
      </footer>
    </section>
  );
}

function Composer({ cooking, onSubmit, onKitchen }) {
  return (
    <div className="composer-wrap">
      <div className="composer-settings">
        <button className="setting-button" onClick={onKitchen}>
          <Icon name="pantry" size={16} />
          My kitchen<span>{cooking.pantry.length}</span>
        </button>
        <button className="setting-button" onClick={onKitchen}>
          <Icon name="people" size={16} />
          Serves {cooking.serves}
        </button>
        <button
          className={`setting-button budget-setting ${cooking.budget ? "has-budget" : ""}`}
          onClick={onKitchen}
        >
          <Icon name="sliders" size={15} />
          {budgetLabel(cooking.budget, cooking.budgetMode)}
        </button>
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <span className="composer-mark">
          <Icon name="bowl" size={23} />
        </span>
        <label className="sr-only" htmlFor="craving">
          What do you feel like cooking?
        </label>
        <input
          id="craving"
          value={cooking.input}
          onChange={(event) => cooking.setInput(event.target.value)}
          disabled={!!cooking.busy}
          placeholder="Something with paneer, around ₹200…"
          autoComplete="off"
        />
        <button
          className="composer-submit"
          disabled={!!cooking.busy || !cooking.input.trim()}
          type="submit"
        >
          <span>{cooking.busy ? "Working" : "Find dinner"}</span>
          <Icon name="arrow" size={19} />
        </button>
      </form>
      <div className="composer-bottom">
        <span>Or start with</span>
        <div>
          {CRAVINGS.map((craving) => (
            <button
              key={craving}
              disabled={!!cooking.busy}
              onClick={() => cooking.findDishes(`something with ${craving}`)}
            >
              {craving}
            </button>
          ))}
        </div>
        <span className="composer-enter">Enter ↵</span>
      </div>
    </div>
  );
}

function Kitchen({ cooking, onDone }) {
  const [custom, setCustom] = useState("");
  const ingredients = [...new Set([...PANTRY, ...cooking.pantry])];
  return (
    <div className="kitchen-settings">
      <p className="settings-intro">
        A few ingredients can change the whole plan. Tell me what&apos;s already
        on your shelves.
      </p>
      <fieldset disabled={!!cooking.busy}>
        <legend>What do you have?</legend>
        <div className="ingredient-chips">
          {ingredients.map((item) => (
            <button
              key={item}
              className={`ingredient-chip ${cooking.pantry.includes(item) ? "is-selected" : ""}`}
              aria-pressed={cooking.pantry.includes(item)}
              onClick={() => cooking.togglePantry(item)}
            >
              <Icon
                name={cooking.pantry.includes(item) ? "check" : "plus"}
                size={14}
              />
              {item}
            </button>
          ))}
        </div>
        <form
          className="add-ingredient"
          onSubmit={(event) => {
            event.preventDefault();
            const value = custom.trim().toLowerCase();
            if (value && !cooking.pantry.includes(value))
              cooking.togglePantry(value);
            setCustom("");
          }}
        >
          <label className="sr-only" htmlFor="custom-ingredient">
            Add another ingredient
          </label>
          <input
            id="custom-ingredient"
            placeholder="Something else on your shelf?"
            value={custom}
            maxLength={60}
            onChange={(event) => setCustom(event.target.value)}
          />
          <button
            className="icon-button"
            aria-label="Add ingredient"
            type="submit"
            disabled={!custom.trim()}
          >
            <Icon name="plus" />
          </button>
        </form>
        <div className="servings-setting">
          <div>
            <strong>Who&apos;s coming to dinner?</strong>
            <span>We&apos;ll scale the recipe for you.</span>
          </div>
          <div className="stepper">
            <button
              aria-label="Fewer servings"
              disabled={cooking.serves <= 1}
              onClick={() => cooking.setServes((value) => value - 1)}
            >
              <Icon name="minus" size={17} />
            </button>
            <output>{cooking.serves}</output>
            <button
              aria-label="More servings"
              disabled={cooking.serves >= 8}
              onClick={() => cooking.setServes((value) => value + 1)}
            >
              <Icon name="plus" size={17} />
            </button>
          </div>
        </div>
        <div className="budget-controls">
          <div>
            <label htmlFor="budget">A budget in mind?</label>
            <output htmlFor="budget">
              {budgetLabel(cooking.budget, cooking.budgetMode)}
            </output>
          </div>
          <input
            id="budget"
            className="budget-range"
            type="range"
            min={0}
            max={2000}
            step={50}
            value={Math.min(cooking.budget, 2000)}
            onChange={(event) => {
              const value = Number(event.target.value);
              cooking.setBudget(value);
              cooking.setBudgetPinned(value > 0);
            }}
          />
          <div className="budget-endpoints">
            <span>No budget</span>
            <span>₹2,000</span>
          </div>
          <div className="budget-modes">
            {["around", "under"].map((mode) => (
              <button
                className={cooking.budgetMode === mode ? "is-selected" : ""}
                key={mode}
                aria-pressed={cooking.budgetMode === mode}
                onClick={() => cooking.setBudgetMode(mode)}
              >
                {mode === "around" ? "A little flexible" : "Stay under budget"}
              </button>
            ))}
          </div>
          <p>
            {cooking.budgetMode === "around"
              ? "Around allows about 15% flexibility. Prices are estimates until we check the shelf."
              : "Dishes over your limit are marked. Final prices and delivery fees are confirmed by Flipkart."}
          </p>
        </div>
      </fieldset>
      {cooking.busy && (
        <p className="small-note">
          Your current kitchen settings are in use. You can edit them when this
          step finishes.
        </p>
      )}
      <button className="button button-primary full-width" onClick={onDone}>
        Back to dinner
        <Icon name="arrow" size={17} />
      </button>
    </div>
  );
}
