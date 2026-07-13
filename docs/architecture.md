# Reliable LLM output architecture

## Goal

The generation pipeline must turn probabilistic model responses into predictable wiki artifacts while remaining testable without network access.

## Flow

`prompt + version → provider → completion/retry → JSON parse → shape validation → note rendering → note schema validation → one repair pass → persistence`

`src/llm-runtime.js` owns transport recovery and the first trust boundary. It retries transient HTTP/network failures with bounded exponential backoff. For structured calls it also parses JSON and validates required top-level fields before returning data to domain code.

`src/validator.js` remains the domain boundary: rendered Markdown is checked for frontmatter, note type, section order, tags, and typed links. `repairNote` permits one model repair and retains the result with fewer violations.

`src/prompt-versions.js` is the release ledger for prompt contracts. A behavior-changing prompt edit must increment its semantic version and add or update an eval case.

## Failure policy

- Transient transport error: retry at most three total attempts.
- Malformed or structurally invalid JSON: retry at most three total attempts.
- Invalid rendered note: one targeted repair call, then retain the least-invalid result and warn.
- Destructive note rewrite: preserve prior source facts with the existing deterministic fallback.

Retries are deliberately bounded to control latency and cost. CI runs unit tests and deterministic evals without credentials; live-model quality evaluation is a separate, opt-in concern.
