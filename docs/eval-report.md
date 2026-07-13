# Eval report

Date: 2026-07-13  
Suite: `evals/cases.json`  
Command: `npm run eval`

## Scope

The initial offline suite measures the structured-output acceptance boundary. It covers valid JSON, fenced JSON, missing required fields, incorrect field types, and malformed JSON. These cases are deterministic and safe to run on every pull request.

## Result

Five cases are defined. The release gate requires 100% agreement with the expected accept/reject decision. Unit tests separately exercise recovery from HTTP 429 and malformed structured output.

## Limitations and next baseline

This suite evaluates contract enforcement, not semantic answer quality. A future live-model suite should use a pinned provider/model, record prompt versions, redact source content, and report groundedness and note-schema pass rate separately so model drift is distinguishable from parser regressions.
