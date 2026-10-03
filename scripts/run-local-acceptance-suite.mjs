import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';

// Local-only integration gate. Live QA scripts intentionally run separately after deployment.
const appRoot = process.cwd();
const adminRoot = path.resolve(process.argv[2] || '../wenitro-admin-');
if (!fs.existsSync(path.join(adminRoot, 'package.json'))) throw new Error('Pass the existing Admin checkout directory as the first argument.');
const logRoot = path.join(appRoot, 'tmp', 'chat001-integrated-local');
fs.mkdirSync(logRoot, { recursive: true });
const commit = root => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const report = { startedAt: new Date().toISOString(), appCommit: commit(appRoot), adminCommit: commit(adminRoot), status: 'RUNNING', scope: 'Executable local PostgreSQL/Edge/client tests, source contracts, typechecks, Expo Doctor, App production export, Admin lint/build. Production API/UI verification is separate.', checks: [] };
const reportPath = path.join(appRoot, 'docs', 'chat001-integrated-local-verification.json');
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
async function check(name, command, args, cwd = appRoot, extraEnv = {}) {
  const started = Date.now();
  const log = path.join(logRoot, name + '.log');
  const output = fs.createWriteStream(log);
  const status = await new Promise(resolve => {
    const child = spawn(command, args, { cwd, env: { ...process.env, CI: '1', DENO_TLS_CA_STORE: 'system', QA_ADMIN_ROOT: adminRoot, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
    child.on('error', error => { output.write(String(error)); resolve(-1); });
    child.on('close', code => resolve(code ?? -1));
  });
  await new Promise(resolve => output.end(resolve));
  const entry = { name, command: [command, ...args], status: status === 0 ? 'PASS' : 'FAIL', exitCode: status, elapsedMs: Date.now() - started, log: path.relative(appRoot, log) };
  report.checks.push(entry); save();
  console.log(`${entry.status} ${name} (${(entry.elapsedMs / 1000).toFixed(1)}s)`);
}
save();
for (const file of fs.readdirSync(path.join(appRoot, 'scripts')).filter(name => name.endsWith('-test.mjs') && name !== 'phone-otp-ui-test.mjs').sort()) await check(file.replace('.mjs', ''), process.execPath, ['scripts/' + file]);
await check('edge-core-tests', 'deno', ['test', '--allow-env', 'supabase/functions/onboarding-date_test.ts', 'supabase/functions/community-media/handler.test.ts', 'supabase/functions/_shared/cashfree.test.ts']);
await check('edge-sms-tests', 'deno', ['test', '--allow-env', '--config', 'supabase/functions/send-sms/deno.json', 'supabase/functions/send-sms/payload_test.ts']);
await check('cashfree-edge-typecheck', 'deno', ['check', 'supabase/functions/cashfree-create-order/index.ts', 'supabase/functions/cashfree-verify-payment/index.ts', 'supabase/functions/cashfree-webhook/index.ts']);
await check('app-typecheck', 'npm', ['run', 'typecheck']);
await check('expo-doctor', 'npx', ['--yes', 'expo-doctor']);
await check('app-production-export', 'npm', ['run', 'vercel-build']);
// Exercise the exported application, with network mocked by the UI test. The
// gate owns its loopback server rather than relying on a developer's Metro port.
const dist = path.join(appRoot, 'dist');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let filename;
  try { filename = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (filename !== dist && !filename.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(filename) || fs.statSync(filename).isDirectory()) filename = path.join(dist, 'index.html');
  if (!fs.existsSync(filename)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
  fs.createReadStream(filename).pipe(res);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
try {
  await check('phone-otp-ui-test', process.execPath, ['scripts/phone-otp-ui-test.mjs'], appRoot, { QA_APP_BASE_URL: `http://127.0.0.1:${server.address().port}` });
} finally { await new Promise(resolve => server.close(resolve)); }
if (fs.existsSync(path.join(adminRoot, 'scripts'))) for (const file of fs.readdirSync(path.join(adminRoot, 'scripts')).filter(name => name.endsWith('-test.mjs')).sort()) await check('admin-' + file.replace('.mjs', ''), process.execPath, ['scripts/' + file], adminRoot);
await check('admin-typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false'], adminRoot);
await check('admin-lint', 'npm', ['run', 'lint'], adminRoot);
await check('admin-production-build', 'npm', ['run', 'build'], adminRoot);
report.finishedAt = new Date().toISOString();
report.passed = report.checks.filter(row => row.status === 'PASS').length;
report.failed = report.checks.length - report.passed;
report.status = report.failed ? 'FAIL' : 'PASS';
save(); console.log(JSON.stringify({ status: report.status, passed: report.passed, failed: report.failed, report: reportPath }));
process.exitCode = report.failed ? 1 : 0;
