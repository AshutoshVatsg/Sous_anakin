# Sous: the dinner desk

## Direction

A calm Indian home-cooking workspace, not a restaurant marketplace or a chat interface. The implementation follows `UI-BRIEF.md` and the eight images in `Ref/`: Healthy Food Planner's tinted cards and breathing room, BISTRO's three-column organization, and the food references' warm photography. The dark agent notebook is deliberately distinct: reasoning and real actions are the product.

No courier tracking, invented reviews, synthetic progress, payment automation, or guaranteed delivery time. Inspiration cards only populate the craving; recipe results and operational events come from the existing APIs.

## Colour and type

| Role           | Light     | Dark      |
| -------------- | --------- | --------- |
| Ground         | `#f7f6f0` | `#1c221b` |
| Surface        | `#fffefa` | `#252d22` |
| Primary text   | `#272e24` | `#f1f0e7` |
| Secondary text | `#535e4e` | `#c7ccbc` |
| Muted text     | `#697161` | `#b0b8a4` |
| Olive action   | `#415f38` | `#c0d4a7` |

Paprika distinguishes the consequential “add groceries” action from browsing. Peach, sage and butter backgrounds organize inspiration without competing with food photographs. Exact interactive, error and notebook tokens live in `app/globals.css`.

This palette is a design judgment, not a claim that a particular gradient universally increases appetite or conversion. Research on visual food perception describes contextual effects; it does not establish a universally preferred food-app gradient. See [Spence et al., visual influences on food perception](https://www.psy.ox.ac.uk/publication/545600) and [Oxford's food-colour research record](https://www.psy.ox.ac.uk/publication/1595190). Text contrast is informed by [WCAG](https://www.w3.org/TR/WCAG22/); this is not a full accessibility conformance audit.

Lora provides editorial headings; locally hosted variable DM Sans handles controls and data. Headings scale down on mobile, ingredient reasoning remains 13px, and live-event messages remain 12px. Primary spacing uses 4/8/12/16/24/32px steps, with compact exceptions for dense metadata. Surfaces use thin borders, restrained shadows and 10–20px corner radii. No decorative gradient wash.

## Component rules

| Component      | Behaviour and hierarchy                                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dish card      | 16:9 photograph; honest image fallback; title/source; prominent pantry coverage; style; clearly separate cost-to-cook and first-shop cost. Unknown metadata is never invented.                                         |
| Coverage       | Covered fraction, missing count, and a proportional bar. Labels carry the meaning without colour alone.                                                                                                                |
| Ingredient row | Ingredient and quantity first; reasoning always exposed; shopping term distinguished from pantry coverage; working, added, alternative and unavailable states are explicit.                                            |
| Plan           | Covered and missing groups; buying rationale; retained pantry stock and pricing coverage; cooking method opens after the shopping run or when nothing is missing.                                                      |
| Composer       | Pinned within the workspace. Kitchen settings contain pantry, custom ingredients, serves 1–8 and budget controls. A spoken budget updates the visible control through the existing event.                              |
| Basket         | Planned list is distinguished from actual cart readback. Actual quantities survive verification, including minimum-order multiples. Subtotal excludes unknown checkout charges. Review and payment stay with the user. |
| Activity       | Independently scrolling dark recorder, real timestamps, semantic event labels. Follows new events unless the user scrolls back. No fabricated timeline.                                                                |
| Cupboard       | Grouped staple shelves; selected items persist through sign-in. OTP opens a focused native dialog on the real event, then automatic stocking continues after authentication. No fake timeout countdown.                |

Desktop uses an 88px navigation rail, scrolling content and an independent basket/notebook column. Below 1180px the right column becomes accessible sheets; phones use bottom navigation. Native dialogs support Escape and focus containment. Theme controls stay synchronized and the saved preference is applied before rendering. Motion respects reduced-motion preferences.

## Implementation boundary

`app/page.js`, `app/pantry/page.js`, shared components, the client hook, client stream reader, styles and local assets are the frontend work. All `src/` and `app/api/` files remain unchanged. Endpoint names and request payloads are preserved. `next.config.mjs` only disables the development overlay badge so it does not cover navigation.

The SSE reader handles split UTF-8, CRLF/LF frames, comments, multiline data, malformed JSON and a final frame without a trailing separator. It reports network/HTTP failures instead of presenting a successful state.

## Reproducing verification

- `npm test`: existing backend unit tests plus six client stream-reader tests.
- `npm run build`: production compilation and route generation.
- Start the app, then in PowerShell run `$env:UI_TEST_URL='http://localhost:3000'; node scripts/ui-smoke.mjs`.
- Browser checks use an isolated headless Chrome installation and a local fixture server. All `/api/**` calls are intercepted: no actual sign-in, grocery addition or purchase is performed.
- Checks cover recipe payloads, budget events, partial streams, fallback photos, plan reasoning, substitutions, unavailable stock, actual cart quantities, theme persistence and breakpoint synchronization, errors/empty results, OTP focus and automatic pantry continuation. Screenshots are written to `cache/ui-review/`.
- Viewports include 1440×900, 1920×1080, 900×1000, 400×860 and an overflow check at 320×740. This does not replace testing real mobile keyboards or a live Flipkart session.

## Asset provenance

Fonts are bundled with their SIL Open Font Licenses in `public/fonts/`. `scripts/prepare-ui-assets.mjs` records download sources and can refresh the local assets.

The three inspiration photographs are sourced from [Cook With Manali](https://www.cookwithmanali.com/wp-content/uploads/2019/05/Paneer-Butter-Masala.jpg), [MAGGI](https://www.maggi.in/sites/default/files/srh_recipes/f77b8de2a747b2c480726ef1dd65d53e.jpg), and [The Kitchn / Apartment Therapy](https://cdn.apartmenttherapy.info/image/upload/f_jpg,q_auto:eco,c_fill,g_auto,w_900,ar_16:9/k%2FPhoto%2FRecipe%20Ramp%20Up%2F2022-03-Chole%2Fchole-2). These are third-party editorial images, not a claim of an open reuse licence. Confirm permission or replace them with owned/licensed photography before public commercial release. Live recipe images retain source links on their cards.
