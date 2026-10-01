import { readFileSync, writeFileSync } from 'node:fs';

// Mechanical synchronization of existing HTML rows with the audited JSON source.
const path = 'docs/client-acceptance-report.html';
const checklist = JSON.parse(readFileSync('docs/client-acceptance-checklist.json', 'utf8'));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
let html = readFileSync(path, 'utf8');
for (const number of [1, 4, 6]) {
  const page = checklist.pages.find(entry => entry.page === number);
  const rows = page.requirements.map(r => `<tr>${[r.requirement, r.status, r.implementation, r.test, r.production].map(v => `<td>${escape(v)}</td>`).join('')}</tr>`).join('');
  html = html.replace(new RegExp(`(<section id="p${number}">[\\s\\S]*?<tbody>)[\\s\\S]*?(</tbody>)`), `$1${rows}$2`);
}
html = html.replace('43 local suites passed;', '44 local suites passed (latest credential/onboarding retest);');
html = html.replace('Correct the same OAuth Web Client: origin https://wenitro-app.vercel.app and redirect https://cxsznhrkzqndhseodcyy.supabase.co/auth/v1/callback. Final Google account login remains manual.', 'Production Google popup login, target session/profile and restore now PASS. Only redirect-based OAuth still requires adding https://cxsznhrkzqndhseodcyy.supabase.co/auth/v1/callback to the SAME Web Client. Keep the Firebase handler.');
html = html.replace('Supply enabled Dev API key; provider currently reports HTTP401/code412 invalid Authorization Key. Check API access/template/wallet/KYC/allowlisting with provider; no claim which prerequisite is wrong.', 'NEW supplied key applied and digest verified. Wallet authentication now HTTP200/return:true; old invalid-key diagnosis superseded. Physical OTP/template/delivery still needs a controlled number. Non-delivery OTP validation returns HTTP400: The mobile field is required. No specific account prerequisite failure is asserted.');
html = html.replace('Badge award rules and exact historical extra onboarding screen await missing client specification/reference.', 'Badge award rules await client specification. Page 1 onboarding is now completed using the latest explicitly authorized evidence-backed adaptation.');
html = html.replace('App code:9c6e94b; Admin:f346515.', 'App code:5709de4; Admin:f346515 (unchanged).');
if (!html.includes('id="credential-update"')) {
  html = html.replace('<nav>', '<section id="credential-update"><h2>New credentials + onboarding update — 1 October</h2><p>Google production popup login PASS. New Fast2SMS wallet authentication PASS; physical OTP delivery not claimed. PDF Page 1 three-slide repair deployed and browser-tested. Fresh target regression: 44 source/unit suites, 35 cross-app checks, 17 provider/Cashfree checks, 50/50 stability requests and Realtime subscription passed. No Cashfree rewrite or schema changes.</p><p>Production onboarding evidence is signed-out replay and completion/reload, not an independently cleared browser-storage first visit. Existing whole-document evidence below is retained; this targeted update is not a new exhaustive manual run of all 114 requirements.</p><p><a href="new-credential-onboarding-verification.json">Detailed sanitized evidence</a></p></section><nav>');
}
writeFileSync(path, html);
