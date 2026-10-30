// OCTO automated checks: action validation, memory, encryption, daily plan, and
// static guards for confirmation dialogs and honest Gemini error handling.
// Run with: node scripts/check.mjs (uses esbuild from Vite's dependencies).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failures += 1;
}
function eq(name, a, b) { check(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, a === b); }

const repoRoot = new URL('..', import.meta.url).pathname;
writeFileSync('/tmp/octo-check-entry.mjs', [
  `export * from '${repoRoot}src/services/actionEngine.ts';`,
  `export * from '${repoRoot}src/services/encryption.ts';`,
  `export * from '${repoRoot}src/database/indexedDB.ts';`,
].join('\n'));
execSync('npx esbuild /tmp/octo-check-entry.mjs --bundle --format=esm --platform=node --outfile=/tmp/octo-check-bundle.mjs --external:react', { stdio: 'pipe' });
const bundle = await import('/tmp/octo-check-bundle.mjs');
const { executeTool } = bundle;
const { encryptText, decryptText } = bundle;
const { createMemoryStore } = bundle;
const store = createMemoryStore();

let out = await executeTool(store, 'nope_tool', {});
check('unknown tool rejected', !out.ok && out.code === 'UNKNOWN_TOOL');
out = await executeTool(store, 'create_task', {});
check('bad arguments rejected', !out.ok);
out = await executeTool(store, 'calculator', { expression: '2+3*4' });
eq('calculator respects precedence', out.result?.value, 14);
out = await executeTool(store, 'calculator', { expression: '2+foo' });
check('calculator rejects non-numeric input', !out.ok);
out = await executeTool(store, 'get_current_date', {});
check('date tool returns ISO string', typeof out.result?.iso === 'string' && out.result.iso.includes('T'));

out = await executeTool(store, 'save_memory', { category: 'goals', content: 'Test goal' }, false);
check('save_memory requires confirmation', !out.ok && out.code === 'CONFIRMATION_REQUIRED');
out = await executeTool(store, 'save_memory', { category: 'goals', content: 'Test goal' }, true);
check('save_memory works with confirmation', out.ok);
out = await executeTool(store, 'search_memory', { query: 'Test goal' });
check('search_memory finds saved memory', Array.isArray(out.result) && out.result.length === 1);

out = await executeTool(store, 'generate_daily_plan', {});
check('daily plan with no tasks says so, no invented tasks', out.ok && String(out.result.plan).includes('no open tasks'));
await executeTool(store, 'create_task', { title: 'Real task for plan' });
await executeTool(store, 'create_project', { name: 'Real project for plan' });
out = await executeTool(store, 'generate_daily_plan', {});
check('daily plan uses real tasks and projects', String(out.result.plan).includes('Real task for plan') && String(out.result.plan).includes('Real project for plan'));

const cipher = await encryptText('secret memory', 'test-passphrase');
const plain = await decryptText(cipher, 'test-passphrase');
eq('encryption round trip', plain, 'secret memory');
let decryptFailed = false;
try { await decryptText(cipher, 'wrong-passphrase'); } catch { decryptFailed = true; }
check('encryption rejects wrong passphrase', decryptFailed);

const geminiSrc = readFileSync('src/services/gemini.ts', 'utf8');
check('gemini service surfaces exact invalid key error', geminiSrc.includes('API key not valid. Please pass a valid API key.'));
check('gemini service keeps key in memory only', geminiSrc.includes('let activeKey') && !geminiSrc.includes('localStorage') && !geminiSrc.includes('indexedDB'));
for (const file of ['src/pages/Workspace.tsx', 'src/pages/Memory.tsx', 'src/pages/Chat.tsx']) {
  const src = readFileSync(file, 'utf8');
  check(`${file} uses confirmation dialog`, src.includes('ConfirmDialog'));
}
const srcAll = ['src/App.tsx', 'src/pages/Home.tsx', 'src/pages/Chat.tsx', 'src/pages/Workspace.tsx', 'src/pages/Memory.tsx', 'src/pages/Settings.tsx']
  .map((f) => readFileSync(f, 'utf8')).join('\n');
check('no em dash in app pages', !srcAll.includes('—'));
check('no emoji in app pages', !/[\u{1F300}-\u{1FAFF}]/u.test(srcAll));
const workerIndex = readFileSync('backend/worker/index.ts', 'utf8');
check('worker routes health, chat, live-token, vision, usage', ['/health', '/api/chat', '/api/live-token', '/api/vision', '/api/usage'].every((r) => workerIndex.includes(r)));
check('worker never logs user content', !workerIndex.includes('console.log'));
const wrangler = readFileSync('wrangler.toml', 'utf8');
check('wrangler main points to backend worker', wrangler.includes('main = "backend/worker/index.ts"'));
const liveVision = readFileSync('src/components/Voice/LiveVision.tsx', 'utf8');
check('LiveVision labels still-image mode honestly', liveVision.includes('Still image analysis') && liveVision.includes('not a Live connection'));
const settingsSrc = readFileSync('src/pages/Settings.tsx', 'utf8');
check('Settings has Backend Connection with Validate', settingsSrc.includes('Backend Connection') && settingsSrc.includes('Validate Worker'));
const appSrc = readFileSync('src/App.tsx', 'utf8');
check('Worker URL remembered only when user opts in', appSrc.includes("octo-worker-remembered") && appSrc.includes("if (value && workerUrl"));
check('App token is memory only, never written to storage', !appSrc.includes('octo-app-token'));
writeFileSync('/tmp/octo-check-result.txt', failures === 0 ? 'ok' : 'fail');
if (failures > 0) { console.log(`${failures} check(s) failed`); process.exit(1); }
console.log('All OCTO checks passed.');
