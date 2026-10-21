/**
 * Tests for the Google Sheet channel. No dependencies and no account needed:
 *   node worker/sheet.test.mjs
 *
 * LEAD_SHEET is the service binding to the LeadSheet entrypoint of the
 * assetz-mizu-ki Worker, which writes the row to the shared "PNZ MS Leads"
 * sheet. Here it is a stub that records each row it is handed, so this checks
 * what this Worker sends and that nothing about the sheet can cost a lead.
 *
 * The project's own facts (name, city, zone, status, type, location) are this
 * site's SHEET_PROJECT in index.js. This file does not repeat them; it checks
 * that every row carries the same ones, whatever the form sends.
 *
 * Self-contained on purpose: the same file runs unchanged in every microsite
 * repository, alongside that repository's own worker/test.mjs.
 */
import worker from './index.js';

let pass = 0, fail = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  ok ? pass++ : fail++;
}

const store = new Map();
const LEADS = {
  async get(k) { return store.has(k) ? store.get(k) : null; },
  async put(k, v) { store.set(k, v); },
  async list() { return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true }; }
};
const LEAD_RATE_LIMIT = { async limit() { return { success: true }; } };
const ASSETS = { fetch: async () => new Response('ASSET') };

let rows = [];
let answer = async () => ({ ok: true, row: 2 });
const LEAD_SHEET = { append: async (row) => { rows.push(row); return answer(row); } };

/* Telegram and email are left unconfigured, so nothing should reach the
   network; counted rather than trusted. */
let outbound = 0;
globalThis.fetch = async () => { outbound++; return new Response('{"ok":true}'); };

const base = { LEADS, LEAD_RATE_LIMIT, ASSETS };
const withSheet = { ...base, LEAD_SHEET };

/* Satisfies every form in the portfolio: some require a message, some send an
   intent instead, all require a name and an Indian mobile. */
const lead = {
  name: 'Asha Rao',
  phone: '9876543210',
  email: 'asha@example.com',
  message: 'Please share the price list.',
  intent: 'Site visit',
  project: 'Test Project',
  lead_source: 'BP MS Lead',
  page: '/price'
};

async function send(body, env, country, city) {
  const headers = { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' };
  if (country) headers['cf-ipcountry'] = country;
  const req = new Request('https://site.example/api/lead', { method: 'POST', headers, body: JSON.stringify(body) });
  /* The platform sets request.cf; a plain Request has none. */
  if (country || city) Object.defineProperty(req, 'cf', { value: { country, city } });
  const waits = [];
  const res = await worker.fetch(req, env, { waitUntil: (p) => waits.push(p), passThroughOnException() {} });
  await Promise.all(waits);
  return res;
}
const stored = () => JSON.parse([...store.values()].pop() || '{}');
const reset = () => { store.clear(); rows = []; outbound = 0; answer = async () => ({ ok: true, row: 2 }); };
const status = async (env) => (await worker.fetch(new Request('https://site.example/api/lead/status'), env, { waitUntil() {} })).json();

console.log('--- without the binding, nothing changes ---');
{
  reset();
  const res = await send(lead, base);
  check('lead accepted and stored', res.status === 200 && store.size === 1, `status ${res.status}`);
  check('no sheet row, no network call', rows.length === 0 && outbound === 0);
}

console.log('\n--- with the binding, one row per lead ---');
{
  reset();
  const res = await send(lead, withSheet, 'IN', 'Mysuru');
  const row = rows[0] || {};
  const rec = stored();
  check('lead accepted and stored', res.status === 200 && store.size === 1, `status ${res.status}`);
  check('exactly one row', rows.length === 1, `${rows.length}`);
  check('name, phone, email', row.name === 'Asha Rao' && row.phone === '9876543210' && row.email === 'asha@example.com',
    JSON.stringify(row));
  check('Page is the full URL on this site', row.page === 'https://site.example/price', row.page);
  check('Source', row.source === 'BP MS Lead', row.source);
  check('Time is the instant stored with the lead', typeof row.time === 'string'
    && row.time === (rec.received || rec.receivedAt) && !Number.isNaN(Date.parse(row.time)), row.time);
  check('Country as a name', row.country === 'India', row.country);
  check('Message carries what the form sent', /Please share|Site visit/.test(row.message || ''), row.message);
  check('Project Name is this site\'s own, not what the form sends',
    typeof row.project === 'string' && row.project.length > 1 && row.project !== 'Test Project', row.project);
  check('City is the project\'s city', typeof row.city === 'string' && row.city.length > 1 && row.city !== 'Mysuru',
    row.city);
  check('Lead City is the visitor\'s, from Cloudflare', row.leadCity === 'Mysuru', row.leadCity);
  check('KV keeps the visitor\'s city', rec.city === 'Mysuru', rec.city);
  check('only the sheet fields, no secret or URL', !('secret' in row)
    && Object.keys(row).every((k) => ['name', 'phone', 'email', 'message', 'page', 'source', 'time', 'country',
      'project', 'city', 'leadCity', 'projectZone', 'projectStatus', 'projectType', 'projectLocation'].includes(k))
    && !JSON.stringify(row).includes('script.google'), Object.keys(row).join());
  check('every field a string', Object.values(row).every((v) => typeof v === 'string'));
}

console.log('\n--- the project facts are the same on every row ---');
{
  reset();
  await send(lead, withSheet, 'IN', 'Mysuru');
  await send({ ...lead, project: 'Another Project', page: '/contact', phone: '9123456780' }, withSheet);
  const [a, b] = rows;
  const facts = ['project', 'city', 'projectZone', 'projectStatus', 'projectType', 'projectLocation'];
  check('two leads, two rows', rows.length === 2, `${rows.length}`);
  check('Project Name, City, Zone, Status, Type and Location identical',
    a && b && facts.every((k) => typeof a[k] === 'string' && a[k] === b[k]),
    a && facts.map((k) => `${k}=${a[k]}`).join(' '));
  check('Lead City empty when Cloudflare cannot place the visitor', b && b.leadCity === '', b && b.leadCity);
}

console.log('\n--- the sheet can never cost a lead ---');
for (const [label, reply] of [
  ['refused', async () => ({ ok: false, error: 'status=200 {"ok":false,"error":"unauthorised"}' })],
  ['entrypoint missing (throws)', async () => { throw new Error('no such entrypoint'); }],
  ['no result', async () => undefined]
]) {
  reset();
  answer = reply;
  const res = await send(lead, withSheet);
  check(`${label}: visitor still answered 200, lead stored`, res.status === 200 && store.size === 1, `status ${res.status}`);
}

console.log('\n--- only real leads reach the sheet ---');
{
  reset();
  await send({ ...lead, company: 'Acme' }, withSheet);
  check('honeypot hit: no row', rows.length === 0 && store.size === 0);
  reset();
  const bad = await send({ ...lead, name: 'A' }, withSheet);
  check('rejected lead: no row', bad.status >= 400 && rows.length === 0, `status ${bad.status}`);
}

console.log('\n--- status reports the binding ---');
{
  const on = await status(withSheet);
  const off = await status(base);
  check('configured with the binding', on.sheet && on.sheet.configured === true, JSON.stringify(on.sheet));
  check('not configured without it', off.sheet && off.sheet.configured === false, JSON.stringify(off.sheet));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
