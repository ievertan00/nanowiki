# Templates Usage Guide

## What are personas and structures?

**Persona** — shapes the *thinking mode* of the LLM's pass-1 answer (e.g. reason by inversion, critique evidence, quantify risk). Injected into the system prompt as `PERSONA:`.

**Structure** — provides a *checklist of aspects* the pass-1 answer should cover (e.g. SWOT sections, AARRR funnel, value chain). Injected as `FOCUS AREAS:`.

Both are pass-1 only. They influence the free-form answer; the formatting pass (pass-2) is never touched.

## CLI Usage

```powershell
wiki ask "question" --persona <name> --structure <name>
wiki ingest <file>  --persona <name> --structure <name>
```

`<name>` is the filename without `.md`. Fuzzy matching is supported (e.g. `feynman` matches `feynman-explainer`). An unresolvable name is a hard error before any LLM call.

---

## Personas

| Name | When to use |
|---|---|
| `feynman-explainer` | Explaining a concept to someone with no background |
| `first-principles` | Strip assumptions, rebuild conclusions from unquestionable basics |
| `occams-razor` | Choose the simplest sufficient explanation; surface unnecessary assumptions |
| `socratic` | Probe definitions, expose unstated premises and contradictions |
| `five-whys` | Diagnose root cause of a problem by layered "why" questioning |
| `analogical` | Generate ideas by finding structural parallels across domains |
| `second-order` | Quick chain-reaction analysis — "then what?" × 2–3 levels |
| `systems-thinking` | Full feedback-loop modeling: stocks/flows, leverage points, policy resistance |
| `inversion` | Planning phase: design by ruling out what must never happen |
| `red-team` | Critique phase: construct strongest attack on an existing conclusion |
| `expected-value` | Quantify decisions as probability × outcome; flag non-linear risks |
| `opportunity-cost` | Evaluate any choice against its next-best alternative |
| `research-reviewer` | Scrutinize academic/ML papers: methodology, baselines, ablations, reproducibility |
| `skeptical-reviewer` | Scrutinize any argument: evidence quality, fact vs. inference, conflict of interest |
| `investor-decisionmaker` | Reframe analysis as actionable risk/reward with time horizons |

---

## Structures

| Name | When to use |
|---|---|
| `concept-deep-dive` | Abstract concepts: intuition → definition → derivation → misconceptions → extensions |
| `technology-deepdive` | Concrete tech: principles → architecture → performance → alternatives → ecosystem |
| `reading-notes` | General books or papers: core argument, evidence, limitations, practical implications |
| `ml-paper-notes` | ML/CS papers: architecture details, experiment setup, ablations, impact on existing work |
| `industry-research-report` | Full industry study (PEST → market size → value chain → competition → trends → risks) |
| `company-competitor-deepdive` | Single company: business model, financials, team, SWOT, roadmap |
| `swot` | Strengths/Weaknesses/Opportunities/Threats + cross-strategy (SO/WO/ST/WT) |
| `five-forces` | Competitive structure: rivalry, entrants, substitutes, supplier/buyer power |
| `pest` | Macro environment: Political/Economic/Social/Technology/Environment/Legal |
| `value-chain` | Activity decomposition: primary activities → support activities → margin |
| `3c` | Strategic intersection: Company / Customer / Competitor |
| `business-model-canvas` | Nine-block canvas: value prop, channels, revenue, costs, partners |
| `jtbd` | Jobs-to-be-done: core task, triggers, alternatives, success criteria, blockers |
| `aarrr` | Funnel metrics: Acquisition / Activation / Retention / Revenue / Referral |
| `mece` | Logical decomposition: mutually exclusive, collectively exhaustive breakdown |
| `iteration-loop` | Process cadence: PDCA for quality improvement, OODA for fast-response cycles |

---

## Pairing Guide

### Avoid (creates redundancy)

| Persona | Structure | Why |
|---|---|---|
| `red-team` or `inversion` | `swot` | SWOT's T/W quadrants already output failure modes |
| `research-reviewer` | `ml-paper-notes` | Paper-notes already has ablations and limitations sections |
| `skeptical-reviewer` | `reading-notes` | Reading-notes has a built-in critical assessment section |
| `investor-decisionmaker` | `industry-research-report` | The report's conclusion already includes the investor angle |

### Recommended pairings

| Persona | Structure | Effect |
|---|---|---|
| `investor-decisionmaker` | `five-forces` / `3c` / `swot` | Persona frames decisions; structures provide the evidence scaffolding |
| `first-principles` | `mece` | First-principles deconstructs; MECE ensures the breakdown is exhaustive |
| `expected-value` | `industry-research-report` | Adds probability-weighted quantification to the qualitative risk/opportunity sections |
| `socratic` | `concept-deep-dive` | Socratic questions surface what the "common misconceptions" section formalizes |
| `analogical` | `concept-deep-dive` | "Relationship to existing concepts" section is the natural home for analogical output |
| `second-order` or `systems-thinking` | `value-chain` | Traces indirect effects through each activity link in the chain |

### Emergent combinations

| Combo | What you get |
|---|---|
| `red-team` + `business-model-canvas` | Attack on each canvas cell — reveals which assumptions competitors could exploit |
| `inversion` + `jtbd` | "What would make users NOT hire this solution?" — surfaces blockers the positive framing misses |
| `second-order` + `aarrr` | How each funnel stage distorts the next (e.g. cheap acquisition inflates churn) |
| `systems-thinking` + `industry-research-report` | Adds feedback loop dynamics to what would otherwise be a static snapshot |
| `opportunity-cost` + `value-chain` | In-house vs. outsource judgment for each activity, grounded in next-best-use of resources |

---

## Related personas

`second-order` ↔ `systems-thinking`: same territory, different depth. Use `second-order` for a quick "then what?" chain; use `systems-thinking` when feedback loops, stocks/flows, and leverage points matter.

`inversion` ↔ `red-team`: complementary phases. Use `inversion` before you've committed to a path; use `red-team` to pressure-test a conclusion you already have.

`research-reviewer` ↔ `skeptical-reviewer`: same critical stance, different scope. `research-reviewer` is for empirical/technical papers (experiments, baselines, reproducibility); `skeptical-reviewer` is for any argument or claim.

---

## Creating your own templates

The bundled personas and structures are examples — a starting point, not a fixed set. Add your own by dropping a Markdown file into either directory:

- `templates/personas/<name>.md` — write instructions for a thinking mode you use regularly
- `templates/structures/<name>.md` — write a checklist of aspects you always want covered

No registration or restart needed. The file is available immediately via `--persona <name>` or `--structure <name>`, with the same fuzzy name matching as bundled templates.

A few guidelines for writing effective templates:

- **Personas** should focus on *how* to reason — the lens, not the topic. Keep them to 4–6 bullet points so the LLM internalises the stance without being overwhelmed.
- **Structures** should be a checklist of aspects, not full prose. The LLM writes the content; the structure just ensures nothing important gets skipped.
- You can freely edit or delete any bundled template. `wiki init` only seeds files that don't already exist, so your customisations are never overwritten.
