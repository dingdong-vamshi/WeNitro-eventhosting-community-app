import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Only repository-local contract, mock, and ephemeral PostgreSQL tests.
// Browser tests must be driven separately through the connected QA browser.
const app = process.cwd();
const admin = fs.realpathSync(path.resolve(app, '../wenitro-admin-'));
const output = path.join(app, 'qa-evidence/chat005-polish/local-regression.json');
const results = [];
for (const [workspace, cwd] of [['app', app], ['admin', admin]]) {
  for (const name of fs.readdirSync(path.join(cwd, 'scripts')).filter(n => n.endsWith('-test.mjs')).sort()) {
    const source = fs.readFileSync(path.join(cwd, 'scripts', name), 'utf8');
    if (/from\s+['"](?:playwright|puppeteer)|require\(['"](?:playwright|puppeteer)/.test(source)) continue;
    const run = spawnSync(process.execPath, ['scripts/' + name], {
      cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 4e6,
      env: {PATH: process.env.PATH, HOME: process.env.HOME, QA_ADMIN_ROOT: admin},
    });
    const result = {workspace, name, status: run.status === 0 ? 'PASS' : 'FAIL', exitCode: run.status, output: (run.stdout + run.stderr).slice(-6000)};
    results.push(result);
    fs.writeFileSync(output, JSON.stringify({checkedAt: new Date().toISOString(), scope: 'Local tests only; live control checks recorded separately', results}, null, 2));
    console.log(`${result.status} ${workspace}/${name}`);
  }
}
console.log(JSON.stringify({total: results.length, passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').map(r => `${r.workspace}/${r.name}`)}));
process.exitCode = results.every(r => r.status === 'PASS') ? 0 : 1;
