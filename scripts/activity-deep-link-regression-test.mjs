import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');

assert.match(
  app,
  /screen !== "activityDetail"[\s\S]*withRequestDeadline\([\s\S]*activityService\.getDetails\(selectedActivityId, data\.userId\)/,
  'A shared or reloaded Activity route must load the requested Activity when it is absent from the initial Feed payload.',
);
assert.match(app, /"This Activity took too long to load\. Try again\."/, 'A slow detail request must stop with a retryable deadline instead of leaving the shared link stuck.');
assert.match(
  app,
  /activities: \[activity, \.\.\.current\.activities\.filter/,
  'The direct-route result must be merged into the current workspace without duplicating Activities.',
);
assert.match(
  app,
  /return <FeedLoadingScreen error=\{activityRouteError\} onRetry=/,
  'An unresolved Activity route must show a retryable loading/error state instead of falling through to another screen.',
);
assert.match(app, /initialWebRoute\?\.screen === "activityDetail"/, 'Direct Activity bootstrap must be route aware.');
assert.match(app, /bootstrapSections\.splice\(index, 1\)/, 'Direct Activity bootstrap must skip the full discovery list.');

console.log('PASS: direct Activity URLs skip the full discovery bootstrap, fetch missing records, merge them once, and retain a retryable route state. Offline source check only.');
