/* ASEF: pure money logic. No DOM access, so it runs in the app and in Node tests.
   Amounts are kept as whole cents (integers) so sums never drift. */
(function (root) {
  "use strict";

  const SCHEMA = 4;
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
    { id: "rent-in", name: "Rent received", type: "income" },
    { id: "dividends", name: "Dividends & interest", type: "income" },
    { id: "food", name: "Food", type: "expense" },
    { id: "transport", name: "Transport", type: "expense" },
    { id: "rent", name: "Rent", type: "expense" },
    { id: "bills", name: "Bills", type: "expense" },
    { id: "health", name: "Health", type: "expense" },
    { id: "shopping", name: "Shopping", type: "expense" },
    { id: "family", name: "Family", type: "expense" },
    { id: "leisure", name: "Leisure", type: "expense" },
    { id: "other-out", name: "Other expense", type: "expense" },
    { id: "asset-costs", name: "Asset costs", type: "expense" },
  ];

  // Things you own that hold or grow value; "debt" is money you owe and counts against net worth.
  const ASSET_KINDS = ["property", "land", "gold", "stocks", "crypto", "savings", "vehicle", "business", "other", "debt"];

  const ACCOUNT_KINDS = ["cash", "bank", "wallet", "savings"];
  const DEFAULT_ACCOUNTS = [{ id: "cash", name: "Cash", kind: "cash", currency: "MAD", opening: 0 }];

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
  // With a list of accounts, the entry must name one of them and use its currency.
  function validateEntry(e, categories, accounts) {
    const errs = [];
    if (!e || typeof e !== "object") return ["entry"];
    if (e.type !== "income" && e.type !== "expense") errs.push("type");
    if (!Number.isSafeInteger(e.amount) || e.amount <= 0) errs.push("amount");
    if (!CURRENCIES.includes(e.currency)) errs.push("currency");
    if (accounts) {
      const a = accounts.find((x) => x.id === e.account);
      if (!a) errs.push("account"); else if (a.currency !== e.currency) errs.push("currency");
    }
    if (e.asset != null && typeof e.asset !== "string") errs.push("asset");
    if (e.hustle != null && typeof e.hustle !== "string") errs.push("hustle");
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

  /* ---------- accounts and transfers ---------- */
  // A transfer moves money between two accounts; "received" is what arrives when the currencies differ.
  function validateTransfer(t, accounts) {
    const errs = [];
    if (!t || typeof t !== "object") return ["transfer"];
    const from = accounts.find((a) => a.id === t.from), to = accounts.find((a) => a.id === t.to);
    if (!from) errs.push("from");
    if (!to) errs.push("to");
    if (from && to && from.id === to.id) errs.push("same");
    if (!Number.isSafeInteger(t.amount) || t.amount <= 0) errs.push("amount");
    if (!Number.isSafeInteger(t.received) || t.received <= 0) errs.push("received");
    else if (from && to && from.currency === to.currency && t.received !== t.amount) errs.push("received");
    if (!isDay(t.date)) errs.push("date");
    return errs;
  }

  // Balance of every account: opening balance, plus income, minus expenses, plus or minus transfers.
  function accountBalances(state, upTo) {
    const out = {};
    for (const a of state.accounts) out[a.id] = a.opening || 0;
    for (const e of state.entries) {
      if (upTo && e.date > upTo) continue;
      if (e.account in out) out[e.account] += signed(e);
    }
    for (const t of state.transfers || []) {
      if (upTo && t.date > upTo) continue;
      if (t.from in out) out[t.from] -= t.amount;
      if (t.to in out) out[t.to] += t.received;
    }
    return out;
  }

  function balancesByCurrency(state) {
    const out = {};
    for (const c of CURRENCIES) out[c] = 0;
    const bal = accountBalances(state);
    for (const a of state.accounts) out[a.currency] = (out[a.currency] || 0) + bal[a.id];
    return out;
  }

  // Everything you hold, in one currency.
  function totalBalance(state) {
    const { main, rates } = state.settings;
    let sum = 0;
    for (const [cur, v] of Object.entries(balancesByCurrency(state))) { const c = convert(v, cur, main, rates); if (c != null) sum += c; }
    return sum;
  }

  function addAccount(accounts, input) {
    const name = String((input && input.name) || "").trim();
    const kind = ACCOUNT_KINDS.includes(input && input.kind) ? input.kind : "cash";
    const currency = input && input.currency;
    const opening = input && input.opening != null ? input.opening : 0;
    if (!name) return { error: "name" };
    if (!CURRENCIES.includes(currency)) return { error: "currency" };
    if (!Number.isSafeInteger(opening)) return { error: "opening" };
    if (accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) return { error: "exists" };
    let id = slug(name), i = 2;
    while (accounts.some((a) => a.id === id)) id = `${slug(name)}-${i++}`;
    return { accounts: [...accounts, { id, name, kind, currency, opening }], id };
  }

  const accountInUse = (state, id) => state.entries.some((e) => e.account === id) ||
    (state.transfers || []).some((t) => t.from === id || t.to === id) || (state.recurring || []).some((r) => r.account === id);

  /* ---------- budgets ---------- */
  // Monthly budgets per expense category, in the main currency. Biggest share used first.
  function budgetStatus(state, ref) {
    const { main, rates } = state.settings;
    const month = inPeriod(state.entries, "month", ref);
    const spent = new Map(byCategory(month, "expense", main, rates).map((x) => [x.category, x.amount]));
    const out = [];
    for (const [category, budget] of Object.entries(state.budgets || {})) {
      if (!(budget > 0)) continue;
      const s = spent.get(category) || 0;
      out.push({ category, budget, spent: s, left: budget - s, pct: Math.round((s / budget) * 100) });
    }
    return out.sort((a, b) => b.pct - a.pct);
  }

  /* ---------- repeating entries ---------- */
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

  // Dates a rule falls on, after its last run (or from its start) up to and including "upTo".
  // Monthly rules use a day of the month (31 means the last day of short months); weekly rules repeat every 7 days from the start.
  function dueDates(rule, upTo) {
    const out = [];
    if (!rule || !isDay(rule.start) || !isDay(upTo)) return out;
    const after = rule.last && isDay(rule.last) ? rule.last : addDays(rule.start, -1);
    if (rule.freq === "weekly") {
      for (let d = rule.start, i = 0; d <= upTo && i < 2000; d = addDays(d, 7), i++) if (d > after) out.push(d);
    } else if (rule.freq === "monthly") {
      const s = parseDate(rule.start);
      const day = Math.min(31, Math.max(1, rule.day || s.getDate()));
      for (let y = s.getFullYear(), m = s.getMonth(), i = 0; i < 600; i++, m++) {
        if (m > 11) { m = 0; y++; }
        const d = isoDate(new Date(y, m, Math.min(day, daysInMonth(y, m))));
        if (d > upTo) break;
        if (d >= rule.start && d > after) out.push(d);
      }
    }
    return out;
  }

  // Adds the entries that repeating rules owe up to today. Returns how many were added.
  function runRecurring(state, upTo) {
    let added = 0;
    for (const r of state.recurring || []) {
      const acc = state.accounts.find((a) => a.id === r.account);
      if (!acc || r.paused) continue;
      const dates = dueDates(r, upTo);
      for (const date of dates) {
        state.entries.push({ id: newId(), type: r.type, amount: r.amount, currency: acc.currency, account: acc.id,
          category: r.category, date, note: r.note || "", createdAt: Date.now(), recurring: r.id });
        added++;
      }
      if (dates.length) r.last = dates[dates.length - 1];
    }
    return added;
  }

  function validateRecurring(r, state) {
    const errs = [];
    if (r.type !== "income" && r.type !== "expense") errs.push("type");
    if (!Number.isSafeInteger(r.amount) || r.amount <= 0) errs.push("amount");
    if (!state.accounts.some((a) => a.id === r.account)) errs.push("account");
    const cat = state.categories.find((c) => c.id === r.category);
    if (!cat || cat.type !== r.type) errs.push("category");
    if (r.freq !== "monthly" && r.freq !== "weekly") errs.push("freq");
    if (!isDay(r.start)) errs.push("start");
    return errs;
  }

  /* ---------- chart data ---------- */
  // Income and expenses for the last n months, oldest first, in the main currency.
  function monthlySeries(entries, n, ref, main, rates) {
    const d = parseDate(ref), out = [];
    for (let i = n - 1; i >= 0; i--) {
      const first = isoDate(new Date(d.getFullYear(), d.getMonth() - i, 1));
      const t = totalIn(inPeriod(entries, "month", first), main, rates);
      out.push({ month: first.slice(0, 7), income: t.income, expense: t.expense, net: t.balance });
    }
    return out;
  }

  /* ---------- assets and net worth ---------- */
  // An asset keeps a history of values, so net worth can be shown at any past date.
  function addAsset(assets, input) {
    const i = input || {};
    const name = String(i.name || "").trim();
    if (!name) return { error: "name" };
    if (!ASSET_KINDS.includes(i.kind)) return { error: "kind" };
    if (!CURRENCIES.includes(i.currency)) return { error: "currency" };
    if (!Number.isSafeInteger(i.value) || i.value < 0) return { error: "value" };
    if (!isDay(i.date)) return { error: "date" };
    if (i.cost != null && (!Number.isSafeInteger(i.cost) || i.cost < 0)) return { error: "cost" };
    if (assets.some((a) => a.name.toLowerCase() === name.toLowerCase())) return { error: "exists" };
    let id = `asset-${slug(name)}`, n = 2;
    while (assets.some((a) => a.id === id)) id = `asset-${slug(name)}-${n++}`;
    const asset = { id, name, kind: i.kind, currency: i.currency, values: [{ date: i.date, value: i.value }] };
    if (i.cost != null) asset.cost = i.cost;
    if (i.note) asset.note = String(i.note).trim();
    return { assets: [...assets, asset], id };
  }

  // Sets the value on a date (replacing that day's value) and keeps the history in date order.
  function setAssetValue(asset, date, value) {
    if (!isDay(date) || !Number.isSafeInteger(value) || value < 0) return null;
    const values = asset.values.filter((v) => v.date !== date).concat({ date, value }).sort((a, b) => (a.date < b.date ? -1 : 1));
    return { ...asset, values };
  }

  // The latest value on or before a date; 0 before the asset was first recorded.
  function assetValueAt(asset, date) {
    let v = 0;
    for (const x of asset.values) { if (x.date <= date) v = x.value; else break; }
    return v;
  }

  const ownedSince = (asset) => (asset.values[0] ? asset.values[0].date : "9999-12-31");

  // Income and costs linked to an asset, in the asset's currency, between two dates.
  function assetFlows(state, asset, from, to) {
    const t = { income: 0, expense: 0, net: 0 };
    for (const e of state.entries) {
      if (e.asset !== asset.id || e.date < from || e.date > to) continue;
      const v = convert(e.amount, e.currency, asset.currency, state.settings.rates);
      if (v == null) continue;
      if (e.type === "income") t.income += v; else t.expense += v;
    }
    t.net = t.income - t.expense;
    return t;
  }

  // Everything worth knowing about one asset today, in its own currency.
  function assetStats(state, asset, today) {
    const value = assetValueAt(asset, today);
    const first = asset.values[0] ? asset.values[0].value : 0;
    const base = asset.cost != null ? asset.cost : first;
    const gain = value - base;
    const year = assetFlows(state, asset, addDays(today, -364), today);
    const all = assetFlows(state, asset, "0000-01-01", today);
    const yieldPct = value > 0 ? Math.round((year.net / value) * 1000) / 10 : null;
    const gainPct = base > 0 ? Math.round((gain / base) * 1000) / 10 : null;
    return { value, base, gain, gainPct, year, all, yieldPct, updated: asset.values.length ? asset.values[asset.values.length - 1].date : null };
  }

  // Cash in accounts, plus assets, minus debts, all in the main currency, as it stood on a date.
  function netWorth(state, date) {
    const { main, rates } = state.settings;
    let cash = 0, assets = 0, debts = 0;
    const bal = accountBalances(state, date);
    for (const a of state.accounts) { const v = convert(bal[a.id], a.currency, main, rates); if (v != null) cash += v; }
    for (const a of state.assets || []) {
      if (ownedSince(a) > date) continue;
      const v = convert(assetValueAt(a, date), a.currency, main, rates);
      if (v == null) continue;
      if (a.kind === "debt") debts += v; else assets += v;
    }
    return { cash, assets, debts, total: cash + assets - debts };
  }

  // Net worth at the end of each of the last n months (the current month uses "ref"), oldest first.
  function netWorthSeries(state, n, ref) {
    const d = parseDate(ref), out = [];
    for (let i = n - 1; i >= 0; i--) {
      const end = i === 0 ? ref : isoDate(new Date(d.getFullYear(), d.getMonth() - i + 1, 0));
      out.push({ month: end.slice(0, 7), date: end, ...netWorth(state, end) });
    }
    return out;
  }

  // Assets grouped by kind, in the main currency, biggest first (debts left out).
  function allocation(state, date) {
    const { main, rates } = state.settings;
    const m = new Map();
    for (const a of state.assets || []) {
      if (a.kind === "debt") continue;
      const v = convert(assetValueAt(a, date), a.currency, main, rates) || 0;
      if (v > 0) m.set(a.kind, (m.get(a.kind) || 0) + v);
    }
    const total = [...m.values()].reduce((x, y) => x + y, 0);
    return [...m].map(([kind, value]) => ({ kind, value, pct: total ? Math.round((value / total) * 100) : 0 })).sort((a, b) => b.value - a.value);
  }

  /* ---------- side hustles ---------- */
  function addHustle(hustles, input) {
    const i = input || {};
    const name = String(i.name || "").trim();
    if (!name) return { error: "name" };
    if (!isDay(i.start)) return { error: "start" };
    if (i.goal != null && (!Number.isSafeInteger(i.goal) || i.goal <= 0)) return { error: "goal" };
    if (hustles.some((h) => h.name.toLowerCase() === name.toLowerCase())) return { error: "exists" };
    let id = `hustle-${slug(name)}`, n = 2;
    while (hustles.some((h) => h.id === id)) id = `hustle-${slug(name)}-${n++}`;
    const h = { id, name, start: i.start };
    if (i.goal != null) h.goal = i.goal;
    return { hustles: [...hustles, h], id };
  }

  // Money a side hustle brought in and cost, in the main currency.
  function hustleStats(state, hustle, today) {
    const { main, rates } = state.settings;
    const mine = state.entries.filter((e) => e.hustle === hustle.id);
    const sum = (list) => totalIn(list, main, rates);
    const all = sum(mine);
    const month = sum(inPeriod(mine, "month", today));
    const series = monthlySeries(mine, 6, today, main, rates);
    const best = monthlySeries(mine, Math.max(1, monthsBetween(hustle.start, today) + 1), today, main, rates)
      .reduce((b, m) => (m.net > (b ? b.net : -Infinity) ? m : b), null);
    // Return on what was spent: profit per 100 spent, when anything was spent.
    const roi = all.expense > 0 ? Math.round((all.balance / all.expense) * 1000) / 10 : null;
    const last3 = series.slice(-3).reduce((x, m) => x + m.net, 0);
    return { all, month, series, best: best && best.net > 0 ? best : null, roi, avg3: Math.round(last3 / 3), goalPct: hustle.goal ? Math.round((month.balance / hustle.goal) * 100) : null };
  }

  function monthsBetween(a, b) {
    const x = parseDate(a), y = parseDate(b);
    return Math.max(0, (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth());
  }

  /* ---------- savings goals ---------- */
  // A goal either follows an account's balance (e.g. a savings account) or adds up money put aside by hand.
  function addGoal(goals, input, accounts) {
    const i = input || {};
    const name = String(i.name || "").trim();
    if (!name) return { error: "name" };
    if (!Number.isSafeInteger(i.target) || i.target <= 0) return { error: "target" };
    if (!CURRENCIES.includes(i.currency)) return { error: "currency" };
    if (i.deadline != null && !isDay(i.deadline)) return { error: "deadline" };
    if (i.account != null) {
      const a = (accounts || []).find((x) => x.id === i.account);
      if (!a) return { error: "account" };
      if (a.currency !== i.currency) return { error: "currency" };
    }
    if (goals.some((g) => g.name.toLowerCase() === name.toLowerCase())) return { error: "exists" };
    let id = `goal-${slug(name)}`, n = 2;
    while (goals.some((g) => g.id === id)) id = `goal-${slug(name)}-${n++}`;
    const g = { id, name, target: i.target, currency: i.currency, saved: [] };
    if (i.deadline) g.deadline = i.deadline;
    if (i.account) g.account = i.account;
    return { goals: [...goals, g], id };
  }

  function goalSaved(state, goal) {
    if (goal.account) return accountBalances(state)[goal.account] || 0;
    return goal.saved.reduce((x, s) => x + s.amount, 0);
  }

  // How far a goal is, and how much to put aside each month to make the deadline.
  function goalStatus(state, goal, today) {
    const saved = goalSaved(state, goal);
    const left = Math.max(0, goal.target - saved);
    const pct = Math.min(100, Math.max(0, Math.round((saved / goal.target) * 100)));
    let monthsLeft = null, perMonth = null, late = false;
    if (goal.deadline) {
      if (goal.deadline < today) late = left > 0;
      else {
        const t = parseDate(today), d = parseDate(goal.deadline);
        monthsLeft = Math.max(1, (d.getFullYear() - t.getFullYear()) * 12 + d.getMonth() - t.getMonth() + (d.getDate() >= t.getDate() ? 0 : -1) + 1);
        perMonth = Math.ceil(left / monthsLeft);
      }
    }
    return { saved, left, pct, done: left === 0, monthsLeft, perMonth, late };
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
      accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
      entries: [],
      transfers: [],
      budgets: {},
      recurring: [],
      assets: [],
      hustles: [],
      goals: [],
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
    let accounts = Array.isArray(s.accounts) ? s.accounts.filter((a) => a && a.id && a.name && CURRENCIES.includes(a.currency))
      .map((a) => ({ id: a.id, name: a.name, kind: ACCOUNT_KINDS.includes(a.kind) ? a.kind : "cash", currency: a.currency, opening: Number.isSafeInteger(a.opening) ? a.opening : 0 })) : [];
    if (!accounts.length) accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
    let entries = Array.isArray(s.entries) ? s.entries.filter((e) => e && e.id && validateEntry(e, categories).length === 0) : [];
    // Entries saved before accounts existed go to a cash account in their currency (made if needed).
    entries = entries.map((e) => {
      if (accounts.some((a) => a.id === e.account && a.currency === e.currency)) return e;
      let a = accounts.find((x) => x.kind === "cash" && x.currency === e.currency) || accounts.find((x) => x.currency === e.currency);
      if (!a) { a = { id: `cash-${e.currency.toLowerCase()}`, name: `Cash ${e.currency}`, kind: "cash", currency: e.currency, opening: 0 }; accounts.push(a); }
      return { ...e, account: a.id };
    });
    const transfers = Array.isArray(s.transfers) ? s.transfers.filter((t) => t && t.id && validateTransfer(t, accounts).length === 0) : [];
    const budgets = {};
    if (s.budgets && typeof s.budgets === "object") for (const [k, v] of Object.entries(s.budgets)) if (Number.isSafeInteger(v) && v > 0 && categories.some((c) => c.id === k && c.type === "expense")) budgets[k] = v;
    const partial = { settings, categories, accounts };
    const recurring = Array.isArray(s.recurring) ? s.recurring.filter((r) => r && r.id && validateRecurring(r, partial).length === 0) : [];
    const assets = Array.isArray(s.assets) ? s.assets.filter((a) => a && a.id && a.name && ASSET_KINDS.includes(a.kind) && CURRENCIES.includes(a.currency) && Array.isArray(a.values))
      .map((a) => {
        const values = a.values.filter((v) => v && isDay(v.date) && Number.isSafeInteger(v.value) && v.value >= 0).sort((x, y) => (x.date < y.date ? -1 : 1));
        const out = { id: a.id, name: a.name, kind: a.kind, currency: a.currency, values };
        if (Number.isSafeInteger(a.cost) && a.cost >= 0) out.cost = a.cost;
        if (typeof a.note === "string" && a.note) out.note = a.note;
        return out;
      }).filter((a) => a.values.length) : [];
    // A link to an asset that no longer exists is dropped; the entry stays.
    entries = entries.map((e) => { if (e.asset == null || assets.some((a) => a.id === e.asset)) return e; const c = { ...e }; delete c.asset; return c; });
    const hustles = Array.isArray(s.hustles) ? s.hustles.filter((h) => h && h.id && h.name && isDay(h.start))
      .map((h) => { const o = { id: h.id, name: h.name, start: h.start }; if (Number.isSafeInteger(h.goal) && h.goal > 0) o.goal = h.goal; return o; }) : [];
    entries = entries.map((e) => { if (e.hustle == null || hustles.some((h) => h.id === e.hustle)) return e; const c = { ...e }; delete c.hustle; return c; });
    const goals = Array.isArray(s.goals) ? s.goals.filter((g) => g && g.id && g.name && Number.isSafeInteger(g.target) && g.target > 0 && CURRENCIES.includes(g.currency))
      .map((g) => {
        const o = { id: g.id, name: g.name, target: g.target, currency: g.currency,
          saved: Array.isArray(g.saved) ? g.saved.filter((x) => x && isDay(x.date) && Number.isSafeInteger(x.amount)) : [] };
        if (isDay(g.deadline)) o.deadline = g.deadline;
        if (g.account && accounts.some((a) => a.id === g.account && a.currency === g.currency)) o.account = g.account;
        return o;
      }) : [];
    return { schema: SCHEMA, settings, categories, accounts, entries, transfers, budgets, recurring, assets, hustles, goals };
  }

  let seq = 0;
  const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  function toCsv(entries, categories, accounts) {
    const name = (id) => (categories.find((c) => c.id === id) || { name: id }).name;
    const q = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const acc = (id) => ((accounts || []).find((a) => a.id === id) || { name: "" }).name;
    const rows = [["date", "type", "category", "amount", "currency", "account", "note"]];
    for (const e of sortEntries(entries)) rows.push([e.date, e.type, name(e.category), (e.amount / 100).toFixed(2), e.currency, acc(e.account), e.note || ""]);
    return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
  }

  /* ---------- backup ---------- */
  function toBackup(state) {
    return JSON.stringify({ app: "asef", exported: new Date().toISOString(), ...state }, null, 1);
  }

  // Returns a clean state from a backup file's text, or null when it isn't an ASEF backup.
  function parseBackup(text) {
    let o;
    try { o = JSON.parse(text); } catch (_) { return null; }
    if (!o || o.app !== "asef") return null;
    return loadState(o);
  }

  const api = {
    SCHEMA, CURRENCIES, SYMBOLS, DEFAULT_RATES, DEFAULT_CATEGORIES,
    isoDate, parseDate, addDays, isDay, today,
    parseAmount, formatMoney, convert, validateEntry, signed, totalsByCurrency, totalIn,
    periodRange, shiftPeriod, inPeriod, sortEntries, groupByDay, byCategory,
    addCategory, emptyState, loadState, newId, toCsv,
    ACCOUNT_KINDS, DEFAULT_ACCOUNTS, validateTransfer, accountBalances, balancesByCurrency, totalBalance, addAccount, accountInUse,
    budgetStatus, dueDates, runRecurring, validateRecurring, monthlySeries, toBackup, parseBackup,
    addHustle, hustleStats, addGoal, goalSaved, goalStatus,
    ASSET_KINDS, addAsset, setAssetValue, assetValueAt, assetFlows, assetStats, netWorth, netWorthSeries, allocation,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASEF = api;
})(typeof self !== "undefined" ? self : this);
