/* ASEF: pure money logic. No DOM access, so it runs in the app and in Node tests.
   Amounts are kept as whole cents (integers) so sums never drift. */
(function (root) {
  "use strict";

  const SCHEMA = 1;
  const CURRENCIES = ["MAD", "EUR", "USD"];
  const SYMBOLS = { MAD: "MAD", EUR: "€", USD: "$" };
  // Value of one unit in MAD. Starting guesses only: the user updates them in Settings.
  const DEFAULT_RATES = { MAD: 1, EUR: 10.8, USD: 9.3 };

  const DEFAULT_CATEGORIES = [
    { id: "salary", name: "Salary", type: "income" },
    { id: "side-hustle", name: "Side hustle", type: "income" },
    { id: "business", name: "Business", type: "income" },
    { id: "gift-in", name: "Gift", type: "income" },
    { id: "other-in", name: "Other income", type: "income" },
    { id: "food", name: "Food", type: "expense" },
    { id: "transport", name: "Transport", type: "expense" },
    { id: "rent", name: "Rent", type: "expense" },
    { id: "bills", name: "Bills", type: "expense" },
    { id: "health", name: "Health", type: "expense" },
    { id: "shopping", name: "Shopping", type: "expense" },
    { id: "family", name: "Family", type: "expense" },
    { id: "leisure", name: "Leisure", type: "expense" },
    { id: "other-out", name: "Other expense", type: "expense" },
  ];

  const pad = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
  const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(parseDate(s)) === s;
  const today = () => isoDate(new Date());

  /* ---------- amounts ---------- */
  // "1 250,50", "1,250.50", "1250.5", "12" -> cents. Returns null for anything that isn't a positive amount.
  function parseAmount(input) {
    let s = String(input == null ? "" : input).trim().replace(/[\s  ']/g, "");
    if (!s || !/^[\d.,]+$/.test(s)) return null;
    const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
    const sep = Math.max(lastDot, lastComma);
    let whole = s, frac = "";
    // The last mark is decimal when one or two digits follow it; otherwise every mark groups thousands.
    if (sep >= 0 && s.length - sep - 1 <= 2 && s.length - sep - 1 > 0) { whole = s.slice(0, sep); frac = s.slice(sep + 1); }
    else if (sep === s.length - 1) { whole = s.slice(0, sep); }
    whole = whole.replace(/[.,]/g, "");
    if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac) || (!whole && !frac)) return null;
    const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
  }

  function formatMoney(cents, currency, opts) {
    const o = opts || {};
    const neg = cents < 0, abs = Math.abs(Math.round(cents));
    const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    const frac = pad(abs % 100);
    const num = `${whole}.${frac}`;
    const sign = neg ? "−" : o.sign && cents > 0 ? "+" : "";
    const sym = SYMBOLS[currency] || currency;
    return currency === "MAD" ? `${sign}${num} ${sym}` : `${sign}${sym}${num}`;
  }

  // Converts cents between currencies with rates given as "value of one unit in MAD".
  function convert(cents, from, to, rates) {
    if (from === to) return cents;
    const r = rates || DEFAULT_RATES;
    if (!(r[from] > 0) || !(r[to] > 0)) return null;
    return Math.round((cents * r[from]) / r[to]);
  }

  /* ---------- entries ---------- */
  // Returns a list of problems; empty means the entry can be saved.
  function validateEntry(e, categories) {
    const errs = [];
    if (!e || typeof e !== "object") return ["entry"];
    if (e.type !== "income" && e.type !== "expense") errs.push("type");
    if (!Number.isSafeInteger(e.amount) || e.amount <= 0) errs.push("amount");
    if (!CURRENCIES.includes(e.currency)) errs.push("currency");
    if (!isDay(e.date)) errs.push("date");
    const cat = (categories || []).find((c) => c.id === e.category);
    if (!cat || cat.type !== e.type) errs.push("category");
    if (e.note != null && typeof e.note !== "string") errs.push("note");
    return errs;
  }

  const signed = (e) => (e.type === "income" ? e.amount : -e.amount);

  // Income, expenses and balance for each currency that appears (plus every known currency, at zero).
  function totalsByCurrency(entries) {
    const out = {};
    for (const c of CURRENCIES) out[c] = { income: 0, expense: 0, balance: 0, count: 0 };
    for (const e of entries) {
      const t = out[e.currency] || (out[e.currency] = { income: 0, expense: 0, balance: 0, count: 0 });
      if (e.type === "income") t.income += e.amount; else t.expense += e.amount;
      t.balance += signed(e);
      t.count++;
    }
    return out;
  }

  // Everything converted to one currency.
  function totalIn(entries, main, rates) {
    const t = { income: 0, expense: 0, balance: 0 };
    for (const [cur, v] of Object.entries(totalsByCurrency(entries))) {
      const inc = convert(v.income, cur, main, rates), exp = convert(v.expense, cur, main, rates);
      if (inc == null || exp == null) continue;
      t.income += inc; t.expense += exp;
    }
    t.balance = t.income - t.expense;
    return t;
  }

  /* ---------- periods ---------- */
  // Weeks start on Monday.
  function periodRange(period, ref) {
    const d = parseDate(ref);
    if (period === "day") return { start: ref, end: ref };
    if (period === "week") {
      const start = addDays(ref, -((d.getDay() + 6) % 7));
      return { start, end: addDays(start, 6) };
    }
    if (period === "month") {
      const start = isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
      return { start, end: isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    }
    if (period === "year") return { start: `${d.getFullYear()}-01-01`, end: `${d.getFullYear()}-12-31` };
    return { start: "0000-01-01", end: "9999-12-31" };
  }

  // The same period one step earlier (-1) or later (+1).
  function shiftPeriod(period, ref, step) {
    const d = parseDate(ref);
    if (period === "day") return addDays(ref, step);
    if (period === "week") return addDays(ref, 7 * step);
    if (period === "month") return isoDate(new Date(d.getFullYear(), d.getMonth() + step, 1));
    if (period === "year") return isoDate(new Date(d.getFullYear() + step, 0, 1));
    return ref;
  }

  function inPeriod(entries, period, ref) {
    const { start, end } = periodRange(period, ref);
    return entries.filter((e) => e.date >= start && e.date <= end);
  }

  // Newest first; same day keeps the most recently created on top.
  function sortEntries(entries) {
    return entries.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
  }

  function groupByDay(entries) {
    const groups = [];
    for (const e of sortEntries(entries)) {
      const g = groups[groups.length - 1];
      if (g && g.date === e.date) g.entries.push(e); else groups.push({ date: e.date, entries: [e] });
    }
    return groups;
  }

  // Spending (or income) per category in the main currency, biggest first.
  function byCategory(entries, type, main, rates) {
    const m = new Map();
    for (const e of entries) {
      if (e.type !== type) continue;
      const v = convert(e.amount, e.currency, main, rates);
      if (v == null) continue;
      m.set(e.category, (m.get(e.category) || 0) + v);
    }
    return [...m].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }

  /* ---------- categories ---------- */
  function slug(name) {
    return String(name).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "category";
  }

  function addCategory(categories, name, type) {
    const n = String(name || "").trim();
    if (!n || (type !== "income" && type !== "expense")) return { error: "name" };
    if (categories.some((c) => c.type === type && c.name.toLowerCase() === n.toLowerCase())) return { error: "exists" };
    let id = `${slug(n)}-${type === "income" ? "in" : "out"}`, i = 2;
    while (categories.some((c) => c.id === id)) id = `${slug(n)}-${type === "income" ? "in" : "out"}-${i++}`;
    return { categories: [...categories, { id, name: n, type, custom: true }], id };
  }

  /* ---------- stored data ---------- */
  function emptyState() {
    return {
      schema: SCHEMA,
      settings: { main: "MAD", rates: { ...DEFAULT_RATES } },
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      entries: [],
    };
  }

  // Reads whatever was saved and returns a clean state; bad entries are dropped, never crash the app.
  function loadState(raw) {
    const base = emptyState();
    let s = raw;
    if (typeof raw === "string") { try { s = JSON.parse(raw); } catch (_) { return base; } }
    if (!s || typeof s !== "object") return base;
    const settings = { ...base.settings, ...(s.settings || {}) };
    if (!CURRENCIES.includes(settings.main)) settings.main = "MAD";
    const rates = { ...DEFAULT_RATES };
    for (const c of CURRENCIES) { const r = Number(settings.rates && settings.rates[c]); if (r > 0) rates[c] = r; }
    rates.MAD = 1;
    settings.rates = rates;
    const categories = Array.isArray(s.categories) && s.categories.length ? s.categories.filter((c) => c && c.id && c.name && (c.type === "income" || c.type === "expense")) : base.categories;
    // Any built-in category that went missing comes back, so old entries always have a home.
    for (const d of DEFAULT_CATEGORIES) if (!categories.some((c) => c.id === d.id)) categories.push({ ...d });
    const entries = Array.isArray(s.entries) ? s.entries.filter((e) => e && e.id && validateEntry(e, categories).length === 0) : [];
    return { schema: SCHEMA, settings, categories, entries };
  }

  let seq = 0;
  const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  function toCsv(entries, categories) {
    const name = (id) => (categories.find((c) => c.id === id) || { name: id }).name;
    const q = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [["date", "type", "category", "amount", "currency", "note"]];
    for (const e of sortEntries(entries)) rows.push([e.date, e.type, name(e.category), (e.amount / 100).toFixed(2), e.currency, e.note || ""]);
    return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
  }

  const api = {
    SCHEMA, CURRENCIES, SYMBOLS, DEFAULT_RATES, DEFAULT_CATEGORIES,
    isoDate, parseDate, addDays, isDay, today,
    parseAmount, formatMoney, convert, validateEntry, signed, totalsByCurrency, totalIn,
    periodRange, shiftPeriod, inPeriod, sortEntries, groupByDay, byCategory,
    addCategory, emptyState, loadState, newId, toCsv,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASEF = api;
})(typeof self !== "undefined" ? self : this);
