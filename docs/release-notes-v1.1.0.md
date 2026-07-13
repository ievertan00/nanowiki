# v1.1.0 — Reliable generation pipeline

## Highlights

- Added a deterministic eval dataset and `npm run eval` release gate.
- Added shared JSON parsing and structured-output shape validation.
- Added bounded recovery for transient provider failures and malformed structured responses.
- Added a semantic prompt-version registry.
- Added GitHub Actions for Node 24 on Windows.

## Verification

Run `npm run check`. No API key is required for the test or eval suite.

## Upgrade notes

There are no CLI or configuration migrations. Structured ingest calls now fail explicitly after three invalid responses instead of silently treating malformed JSON as a summary. This is an intentional correctness improvement.
