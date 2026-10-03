# Final report reconciliation

The generator creates one client report in Markdown plus a machine-readable evidence record. It reads canonical scope and existing owner mappings; it never edits those sources or performs browser, API, database, deployment or cleanup actions.

Generate an incomplete draft from the primary checkout:

```sh
node scripts/chat001-final-report-generator.mjs --source-root /Users/vamshipendyala/Desktop/wenitro-phone-app- --output-root .
```

The requirement count comes from `counts.distinctImplementationRequirementsIncludingBadges` in the canonical file. An optional `--expected-count 308` checks a coordinator-approved count explicitly. The original B27 duplicate correction changes the declared total from309 to308 only after the canonical and owner mappings are reconciled; the tool does not delete or merge requirements itself.

Inputs are the canonical file, the A/E, B/C and Admin owner mappings, the backend and A/E technical supplements, the selected release record, and screenshot metadata. Repeated evidence from several owners is combined under one canonical ID. Unknown or duplicate IDs within an input fail validation. SHA256 input snapshots make the result reproducible against a specific evidence state.

The draft preserves exact owner status and scope. It does not interpret a screenshot filename, loaded page, local test, backend contribution or an owner’s scoped verification as complete client acceptance. Excluded stale screenshots remain excluded. New IAB screenshot metadata is included automatically from `qa-evidence/chat001/integrated-iab-admin-screenshots.json`; additional files may be supplied with repeated `--screenshot-metadata path` arguments.

The client report contains every requirement’s requested change, before state, implementation, local verification, production verification, deployed screenshot proof, backend proof, precise reason and outstanding validation fields. Missing narratives stay explicitly unreconciled rather than being invented.

For finalization, supply a new coordinator assessment JSON file. It must contain a `requirements` array with one entry per canonical ID and a `processEntries` array for the seven acceptance gates. Separators are preserved but do not require a pass. Each requirement entry supplies these fields:

```json
{
  "id": "ADMIN-CATEGORY-CATALOG",
  "status": "PASS",
  "before": "Concrete former behavior supported by the audit.",
  "implemented": "Concrete implemented behavior.",
  "acceptanceScope": "Exact actions, boundaries and visual states accepted.",
  "localVerification": ["docs/chat001-integrated-local-verification.json"],
  "productionVerification": [{"outcome": "Specific observed production result", "at": "ISO timestamp"}],
  "technicalProof": ["docs/chat001-admin-integrated-production-proof.json"],
  "screenshotProof": [{"path": "qa-evidence/chat001/verified-production-image.png", "scope": "Specific visible state"}],
  "screenshotsReviewed": true,
  "releaseReviewed": true,
  "release": {"appDeploymentId": "SELECTED_APP_RELEASE", "adminDeploymentId": "SELECTED_ADMIN_RELEASE"},
  "reason": ""
}
```

Terminal dispositions are `PASS`, `PARTIAL_EXTERNAL_DEPENDENCY`, `NOT_IMPLEMENTED_EXTERNAL_DEPENDENCY`, and `NOT_IMPLEMENTED_CLIENT_DECISION`. Every non-pass disposition needs an exact reason. Do not classify unfinished normal work as an external dependency. A partial outcome must explain what works and precisely which external part does not.

`PASS` requires concrete narratives, local and production evidence, explicit acceptance scope, matching selected release IDs, existing evidence artifacts, and coordinator review flags. User-visible requirements need a valid deployed screenshot. Pure backend requirements need an existing technical proof artifact; a test source alone is insufficient. A coordinator may explicitly reconcile compatible earlier screenshots with the final release, but must state the covered scope and cannot silently claim a new screenshot.

Generate the final report only when all requirement assessments and acceptance gates are reconciled:

```sh
node scripts/chat001-final-report-generator.mjs \
  --source-root /Users/vamshipendyala/Desktop/wenitro-phone-app- \
  --release docs/FINAL-RELEASE-RECORD.json \
  --assessments docs/FINAL-COORDINATOR-ASSESSMENTS.json \
  --final
```

Without complete validated dispositions, `--final` refuses to write a final report. Draft counts show unresolved assessments as pending even if their proposed status says PASS. Final output files are `docs/chat001-client-acceptance-final.md` and `.json`; draft files use `-draft` instead. This generator does not resolve the open requirements by itself.

Run `node scripts/chat001-final-report-generator-test.mjs` for offline integrity checks covering counts, overlapping contributions, scoped statuses, external holds, stale screenshots, duplicate/unknown IDs, and finalization guards.
