/**
 * Integration regression test for the domain API.
 * Requires the stack to be running (backend :4000, which proxies to the
 * FastAPI AI service). It creates its own isolated data and asserts the
 * full loop: auth -> household -> category -> expenses -> budget -> insights.
 */

const BASE = process.env.API_BASE ?? 'http://localhost:4000';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond) console.log('  PASS', msg);
  else {
    console.log('  FAIL', msg);
    failures++;
  }
}

async function main() {
  const email = `reg${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;

  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', name: 'Reg' }),
  });
  check(reg.status === 201, 'register returns 201');

  const lg = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123' }),
  });
  check(lg.status === 200, 'login returns 200');
  const tok = (await lg.json()).accessToken as string;
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

  const hh = await (
    await fetch(`${BASE}/api/households`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ name: 'Reg Fam' }),
    })
  ).json();
  check(typeof hh.id === 'number' && hh.id > 0, 'create household');

  const cat = await (
    await fetch(`${BASE}/api/categories`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ name: 'Food' }),
    })
  ).json();
  check(typeof cat.id === 'number' && cat.id > 0, 'create category');

  let addedOk = true;
  for (const [d, a] of [
    ['2026-03-10', 900000],
    ['2026-04-10', 1200000],
    ['2026-05-10', 1500000],
  ]) {
    const e = await fetch(`${BASE}/api/expenses`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ amount: a, category_id: cat.id, expense_date: d }),
    });
    if (e.status !== 201) addedOk = false;
  }
  check(addedOk, 'add 3 expenses across 3 months');

  const b = await (
    await fetch(`${BASE}/api/budgets`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ amount: 6000000 }),
    })
  ).json();
  check(b.amount === 6000000, 'set monthly budget');

  const me = await (await fetch(`${BASE}/api/households/me`, { headers: H })).json();
  check(me.household?.name === 'Reg Fam', 'households/me returns the household');

  const cats = await (await fetch(`${BASE}/api/categories`, { headers: H })).json();
  check((cats.categories ?? []).length >= 1, 'list categories');

  const exp = await (await fetch(`${BASE}/api/expenses`, { headers: H })).json();
  check((exp.expenses ?? []).length >= 3, 'list expenses (>= 3)');

  const bud = await (await fetch(`${BASE}/api/budgets`, { headers: H })).json();
  check(bud.total_budget === 6000000, 'budgets total matches what was set');

  const ins = await (await fetch(`${BASE}/api/insights/${hh.id}`, { headers: H })).json();
  check(
    typeof ins?.predictions?.expense?.predicted === 'number' &&
      ins.predictions.expense.predicted > 0,
    'insights returns a positive prediction',
  );

  const pr = await (await fetch(`${BASE}/api/predict/${hh.id}`, { headers: H })).json();
  check(typeof pr?.predicted === 'number', 'predict returns a number');

  const bad = await fetch(`${BASE}/api/expenses`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ amount: 10, category_id: 999999, expense_date: '2026-05-01' }),
  });
  check(bad.status === 400, 'rejects expense with foreign category_id (400)');

  console.log(
    failures ? `\nREGRESSION FAILED (${failures} check(s))` : '\nREGRESSION PASSED',
  );
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
