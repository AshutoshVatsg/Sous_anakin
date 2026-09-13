# Working notes

The build log, kept because most of it is evidence rather than prose — what we
tested against Anakin's live API, what came back, and why the architecture changed
twice. The four documents at the repo root are the ones worth reading first.

## Root (start there)

| | |
|---|---|
| `../README.md` | The hackathon submission — what Sous is, the flow, how it uses Anakin |
| `../DETAILS.md` | The full engineering write-up — variety, budget, protein, the brain |
| `../ANAKIN-REFERENCE.md` | Master reference for Anakin.io, compiled from live fetches. Corrects 7 errors in the published docs |
| `../MINUTES-WIRE.md` | The four Flipkart Minutes Build Studio actions, and the responses they actually return |
| `../ANAKIN-BUG-REPORT.md` | 15 issues found while building, written up for Anakin's team |

## Here

| | |
|---|---|
| `EMPIRICAL-TESTS.md` | Real executed API calls. **Overrides the reference on any conflict.** |
| `BRAIN.md` | The reasoning layer's design principle: the model judges, code computes |
| `PIVOT.md` | Why this stopped being a BigBasket product and became a Flipkart Minutes one |
| `STATUS.md` | Build status at the BigBasket stage — historical |
| `ARCHITECTURE.md` | The original DinnerGuard design |
| `ARCHITECTURE-ANALYSIS.md` | Critique of that design against what the API actually does |
| `RECOMMENDATION.md`, `BUILD-SPEC.md` | How the current shape was chosen |
| `WIRE-REQUEST-MINUTES.md`, `QUESTIONS-FOR-ANAKIN.md` | What we asked Anakin for, and why |
| `anakin-verified-findings.md`, `anakin-constraints.md` | Verification and budget notes, folded into the master reference |
| `anakin-capability-audit.md` | ⚠️ An earlier draft by another model. ~85% right, 7 known errors. Superseded — don't cite it |

Some of these describe a product that no longer exists. They're kept because the
reasoning is the interesting part: `PIVOT.md` and `ARCHITECTURE-ANALYSIS.md` are
the record of two decisions that turned out to be right for reasons we could only
find by testing.
