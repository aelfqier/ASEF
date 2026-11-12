const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../www/js/logic.js");

const cats = L.DEFAULT_CATEGORIES;
const e = (o) => ({ id: L.newId(), type: "expense", amount: 1000, currency: "MAD", category: "food", date: "2026-11-10", note: "", createdAt: 1, ...o });

test("amounts typed in different ways become cents", () => {
  assert.equal(L.parseAmount("12"), 1200);
  assert.equal(L.parseAmount("12.5"), 1250);
  assert.equal(L.parseAmount("12,50"), 1250);
  assert.equal(L.parseAmount("1 250,50"), 125050);
  assert.equal(L.parseAmount("1,250.50"), 125050);
  assert.equal(L.parseAmount("1.250"), 125000);
  assert.equal(L.parseAmount("0.1"), 10);
  assert.equal(L.parseAmount("0"), null);
  assert.equal(L.parseAmount("-5"), null);
  assert.equal(L.parseAmount("abc"), null);
  assert.equal(L.parseAmount(""), null);
});

test("money is shown with its currency", () => {
  assert.equal(L.formatMoney(125050, "MAD"), "1 250.50 MAD");
  assert.equal(L.formatMoney(-500, "EUR"), "−€5.00");
  assert.equal(L.formatMoney(500, "USD", { sign: true }), "+$5.00");
});

test("currencies convert through MAD rates", () => {
  const rates = { MAD: 1, EUR: 10, USD: 9 };
  assert.equal(L.convert(100, "EUR", "MAD", rates), 1000);
  assert.equal(L.convert(900, "MAD", "USD", rates), 100);
  assert.equal(L.convert(100, "EUR", "USD", rates), 111);
  assert.equal(L.convert(100, "EUR", "EUR", rates), 100);
  assert.equal(L.convert(100, "EUR", "MAD", { MAD: 1, EUR: 0 }), null);
});

test("entries are checked before saving", () => {
  assert.deepEqual(L.validateEntry(e({}), cats), []);
  assert.deepEqual(L.validateEntry(e({ amount: 0 }), cats), ["amount"]);
  assert.deepEqual(L.validateEntry(e({ amount: 1.5 }), cats), ["amount"]);
  assert.deepEqual(L.validateEntry(e({ currency: "GBP" }), cats), ["currency"]);
  assert.deepEqual(L.validateEntry(e({ date: "2026-02-30" }), cats), ["date"]);
  assert.deepEqual(L.validateEntry(e({ category: "salary" }), cats), ["category"]); // income category on an expense
});

test("balance is kept per currency and in the main currency", () => {
  const list = [
    e({ type: "income", category: "salary", amount: 1000000 }),
    e({ amount: 25000 }),
    e({ type: "income", category: "side-hustle", amount: 10000, currency: "EUR" }),
    e({ amount: 2000, currency: "USD" }),
  ];
  const t = L.totalsByCurrency(list);
  assert.deepEqual(t.MAD, { income: 1000000, expense: 25000, balance: 975000, count: 2 });
  assert.equal(t.EUR.balance, 10000);
  assert.equal(t.USD.balance, -2000);
  const rates = { MAD: 1, EUR: 10, USD: 9 };
  assert.deepEqual(L.totalIn(list, "MAD", rates), { income: 1100000, expense: 43000, balance: 1057000 });
});

test("periods: day, Monday weeks, months, years", () => {
  assert.deepEqual(L.periodRange("day", "2026-11-10"), { start: "2026-11-10", end: "2026-11-10" });
  assert.deepEqual(L.periodRange("week", "2026-11-10"), { start: "2026-11-09", end: "2026-11-15" });
  assert.deepEqual(L.periodRange("week", "2026-11-15"), { start: "2026-11-09", end: "2026-11-15" });
  assert.deepEqual(L.periodRange("month", "2026-02-14"), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(L.periodRange("year", "2026-02-14"), { start: "2026-01-01", end: "2026-12-31" });
  assert.equal(L.shiftPeriod("month", "2026-01-31", -1), "2025-12-01");
  assert.equal(L.shiftPeriod("week", "2026-11-10", 1), "2026-11-17");
  const list = [e({ date: "2026-10-31" }), e({ date: "2026-11-01" }), e({ date: "2026-11-30" })];
  assert.equal(L.inPeriod(list, "month", "2026-11-10").length, 2);
  assert.equal(L.inPeriod(list, "all", "2026-11-10").length, 3);
});

test("history is grouped by day, newest first", () => {
  const a = e({ date: "2026-11-09", createdAt: 1 }), b = e({ date: "2026-11-10", createdAt: 1 }), c = e({ date: "2026-11-10", createdAt: 2 });
  const g = L.groupByDay([a, b, c]);
  assert.deepEqual(g.map((x) => x.date), ["2026-11-10", "2026-11-09"]);
  assert.deepEqual(g[0].entries, [c, b]);
});

test("spending per category in the main currency", () => {
  const rates = { MAD: 1, EUR: 10, USD: 9 };
  const r = L.byCategory([e({ amount: 500 }), e({ amount: 100, currency: "EUR" }), e({ category: "rent", amount: 300 })], "expense", "MAD", rates);
  assert.deepEqual(r, [{ category: "food", amount: 1500 }, { category: "rent", amount: 300 }]);
});

test("own categories can be added, without duplicates", () => {
  const r = L.addCategory(cats, "Crypto", "income");
  assert.equal(r.id, "crypto-in");
  assert.ok(r.categories.find((c) => c.id === "crypto-in" && c.custom));
  assert.equal(L.addCategory(cats, "food", "expense").error, "exists");
  assert.equal(L.addCategory(cats, "  ", "expense").error, "name");
});

test("saved data is read back safely", () => {
  assert.deepEqual(L.loadState(null), L.emptyState());
  assert.deepEqual(L.loadState("{not json"), L.emptyState());
  const good = e({}), bad = e({ amount: -3 });
  const s = L.loadState(JSON.stringify({ settings: { main: "EUR", rates: { EUR: 11, USD: -1 } }, categories: [], entries: [good, bad] }));
  assert.equal(s.settings.main, "EUR");
  assert.deepEqual(s.settings.rates, { MAD: 1, EUR: 11, USD: L.DEFAULT_RATES.USD });
  assert.equal(s.entries.length, 1);
  assert.equal(s.categories.length, cats.length);
});

test("CSV export", () => {
  const csv = L.toCsv([e({ account: "cash", note: 'tea, "mint"' })], cats, L.DEFAULT_ACCOUNTS);
  assert.equal(csv, 'date,type,category,amount,currency,account,note\n2026-11-10,expense,Food,10.00,MAD,Cash,"tea, ""mint"""\n');
});

/* ---------- step 2 ---------- */
const rates = { MAD: 1, EUR: 10, USD: 9 };
function world() {
  const s = L.emptyState();
  s.settings.rates = { ...rates };
  s.accounts.push({ id: "bank", name: "Bank", kind: "bank", currency: "MAD", opening: 500000 });
  s.accounts.push({ id: "wise", name: "Wise", kind: "wallet", currency: "EUR", opening: 0 });
  return s;
}

test("old saved data gets accounts and keeps every entry", () => {
  const old = { schema: 1, entries: [e({ id: "a" }), e({ id: "b", currency: "EUR" }), e({ id: "c", currency: "EUR" })] };
  const s = L.loadState(old);
  assert.equal(s.entries.length, 3);
  assert.deepEqual(s.accounts.map((a) => [a.id, a.currency]), [["cash", "MAD"], ["cash-eur", "EUR"]]);
  assert.deepEqual(s.entries.map((x) => x.account), ["cash", "cash-eur", "cash-eur"]);
  assert.deepEqual([s.transfers, s.budgets, s.recurring], [[], {}, []]);
});

test("entries must use their account's currency", () => {
  const s = world();
  assert.deepEqual(L.validateEntry(e({ account: "bank" }), cats, s.accounts), []);
  assert.deepEqual(L.validateEntry(e({ account: "wise" }), cats, s.accounts), ["currency"]);
  assert.deepEqual(L.validateEntry(e({ account: "nope" }), cats, s.accounts), ["account"]);
});

test("account balances count openings, entries and transfers", () => {
  const s = world();
  s.entries.push(e({ account: "cash", type: "income", category: "salary", amount: 100000 }), e({ account: "cash", amount: 20000 }));
  s.transfers.push({ id: "t1", from: "bank", to: "cash", amount: 30000, received: 30000, date: "2026-11-10" });
  s.transfers.push({ id: "t2", from: "bank", to: "wise", amount: 100000, received: 9500, date: "2026-11-11" });
  assert.deepEqual(L.accountBalances(s), { cash: 110000, bank: 370000, wise: 9500 });
  assert.deepEqual(L.accountBalances(s, "2026-11-10"), { cash: 110000, bank: 470000, wise: 0 });
  assert.deepEqual(L.balancesByCurrency(s), { MAD: 480000, EUR: 9500, USD: 0 });
  assert.equal(L.totalBalance(s), 480000 + 95000);
});

test("transfers are checked", () => {
  const s = world();
  const t = (o) => ({ id: "t", from: "cash", to: "bank", amount: 100, received: 100, date: "2026-11-10", ...o });
  assert.deepEqual(L.validateTransfer(t({}), s.accounts), []);
  assert.deepEqual(L.validateTransfer(t({ to: "cash" }), s.accounts), ["same"]);
  assert.deepEqual(L.validateTransfer(t({ received: 90 }), s.accounts), ["received"]);
  assert.deepEqual(L.validateTransfer(t({ to: "wise", received: 9 }), s.accounts), []);
});

test("accounts can be added, without duplicate names", () => {
  const r = L.addAccount(L.DEFAULT_ACCOUNTS, { name: "CIH Bank", kind: "bank", currency: "MAD", opening: 1000 });
  assert.equal(r.id, "cih-bank");
  assert.equal(L.addAccount(r.accounts, { name: "cih bank", currency: "MAD" }).error, "exists");
  assert.equal(L.addAccount(r.accounts, { name: "X", currency: "GBP" }).error, "currency");
});

test("budgets show what is spent and left this month", () => {
  const s = world();
  s.budgets = { food: 100000, rent: 300000 };
  s.entries.push(e({ account: "cash", amount: 80000 }), e({ account: "wise", currency: "EUR", amount: 3000 }), e({ account: "cash", amount: 9999, date: "2026-10-01" }));
  const b = L.budgetStatus(s, "2026-11-10");
  assert.deepEqual(b[0], { category: "food", budget: 100000, spent: 110000, left: -10000, pct: 110 });
  assert.deepEqual(b[1], { category: "rent", budget: 300000, spent: 0, left: 300000, pct: 0 });
});

test("monthly repeats fall on their day, clamped to short months", () => {
  const r = { freq: "monthly", day: 31, start: "2026-01-31" };
  assert.deepEqual(L.dueDates(r, "2026-04-15"), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  assert.deepEqual(L.dueDates({ ...r, last: "2026-02-28" }, "2026-04-30"), ["2026-03-31", "2026-04-30"]);
  assert.deepEqual(L.dueDates({ freq: "monthly", day: 5, start: "2026-11-10" }, "2026-12-31"), ["2026-12-05"]);
});

test("weekly repeats every 7 days from the start", () => {
  assert.deepEqual(L.dueDates({ freq: "weekly", start: "2026-11-02" }, "2026-11-20"), ["2026-11-02", "2026-11-09", "2026-11-16"]);
  assert.deepEqual(L.dueDates({ freq: "weekly", start: "2026-11-02", last: "2026-11-16" }, "2026-11-20"), []);
});

test("repeating rules add their entries once", () => {
  const s = world();
  s.recurring.push({ id: "r1", type: "income", amount: 800000, account: "bank", category: "salary", freq: "monthly", day: 1, start: "2026-09-01", note: "Pay" });
  assert.equal(L.runRecurring(s, "2026-11-10"), 3);
  assert.equal(L.runRecurring(s, "2026-11-10"), 0);
  assert.equal(s.recurring[0].last, "2026-11-01");
  assert.deepEqual(s.entries.map((x) => [x.date, x.currency, x.recurring]), [["2026-09-01", "MAD", "r1"], ["2026-10-01", "MAD", "r1"], ["2026-11-01", "MAD", "r1"]]);
  assert.deepEqual(L.validateRecurring(s.recurring[0], s), []);
  assert.deepEqual(L.validateRecurring({ ...s.recurring[0], category: "food" }, s), ["category"]);
});

test("six months of income and expenses for the chart", () => {
  const list = [e({ type: "income", category: "salary", amount: 1000, date: "2026-11-01" }), e({ amount: 300, date: "2026-09-15" }), e({ amount: 50, currency: "EUR", date: "2026-11-02" })];
  const m = L.monthlySeries(list, 3, "2026-11-10", "MAD", rates);
  assert.deepEqual(m, [
    { month: "2026-09", income: 0, expense: 300, net: -300 },
    { month: "2026-10", income: 0, expense: 0, net: 0 },
    { month: "2026-11", income: 1000, expense: 500, net: 500 },
  ]);
});

test("backup files round trip and other files are refused", () => {
  const s = world();
  s.entries.push(e({ account: "bank" }));
  s.budgets = { food: 5000 };
  const back = L.parseBackup(L.toBackup(s));
  assert.deepEqual(back, L.loadState(s));
  assert.equal(back.entries.length, 1);
  assert.equal(L.parseBackup('{"entries":[]}'), null);
  assert.equal(L.parseBackup("garbage"), null);
});
