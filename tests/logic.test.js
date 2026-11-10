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
  const csv = L.toCsv([e({ note: 'tea, "mint"' })], cats);
  assert.equal(csv, 'date,type,category,amount,currency,note\n2026-11-10,expense,Food,10.00,MAD,"tea, ""mint"""\n');
});
