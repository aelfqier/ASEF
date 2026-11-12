/* ASEF: screens. Logic lives in logic.js (window.ASEF), saving in store.js (window.ASEFStore). */
(function () {
  "use strict";
  const L = window.ASEF, S = window.ASEFStore;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const opt = (value, text, selected) => { const o = el("option", null, text); o.value = value; if (selected) o.selected = true; return o; };
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const KIND = { cash: "Cash", bank: "Bank", wallet: "Wallet", savings: "Savings" };
  const ASSET_KIND = { property: "Property", land: "Land", gold: "Gold", stocks: "Stocks", crypto: "Crypto", savings: "Savings", vehicle: "Vehicle", business: "Business", other: "Other", debt: "Debt" };

  let state = L.emptyState();
  const ui = { view: "home", period: "month", ref: L.today(), editing: null, type: "expense", account: null, to: null, category: null, recType: "expense", asset: null, viewing: null, newDebt: false, hustle: null, item: null };

  const save = () => S.write(state);
  const cat = (id) => state.categories.find((c) => c.id === id) || { name: id, type: "expense" };
  const acc = (id) => state.accounts.find((a) => a.id === id) || { name: "?", currency: "MAD" };
  const assetById = (id) => state.assets.find((a) => a.id === id);
  const hustleById = (id) => state.hustles.find((h) => h.id === id);
  const goalById = (id) => state.goals.find((g) => g.id === id);
  const monthName = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
  const money = (c, cur, o) => L.formatMoney(c, cur || state.settings.main, o);
  const amountText = (cents) => (cents / 100).toFixed(2);

  function dayLabel(iso) {
    const t = L.today();
    if (iso === t) return "Today";
    if (iso === L.addDays(t, -1)) return "Yesterday";
    const d = L.parseDate(iso);
    const y = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${y}`;
  }

  /* ---------- rows ---------- */
  function entryRow(e) {
    const r = el("button", `row ${e.type || "transfer"}`);
    r.type = "button";
    const mid = el("span", "row-mid");
    let dot, amt;
    if (e.from) {
      dot = el("span", "dot", "⇄");
      mid.append(el("span", "row-title", "Transfer"), el("span", "row-note", `${acc(e.from).name} → ${acc(e.to).name}${e.note ? " · " + e.note : ""}`));
      amt = el("span", "row-amt", L.formatMoney(e.amount, acc(e.from).currency));
    } else {
      dot = el("span", "dot", cat(e.category).name.slice(0, 1).toUpperCase());
      mid.append(el("span", "row-title", cat(e.category).name));
      const linked = e.asset && assetById(e.asset);
      const hs = e.hustle && hustleById(e.hustle);
      const sub = [state.accounts.length > 1 ? acc(e.account).name : "", linked ? "◆ " + linked.name : "", hs ? "⚡ " + hs.name : "", e.recurring ? "↻" : "", e.note].filter(Boolean).join(" · ");
      if (sub) mid.append(el("span", "row-note", sub));
      amt = el("span", "row-amt", L.formatMoney(L.signed(e), e.currency, { sign: true }));
    }
    r.append(dot, mid, amt);
    r.addEventListener("click", () => openSheet(e));
    return r;
  }

  function fillList(box, items, empty) {
    box.replaceChildren();
    if (!items.length) { box.append(el("p", "empty", empty)); return; }
    for (const e of items) box.append(entryRow(e));
  }

  function setFlow(prefix, t) {
    $(prefix + "In").textContent = money(t.income);
    $(prefix + "Out").textContent = money(t.expense);
    const n = $(prefix + "Net");
    n.textContent = money(t.balance, null, { sign: true });
    n.classList.toggle("neg", t.balance < 0);
  }

  function budgetRows(box, list) {
    box.replaceChildren();
    for (const b of list) {
      const row = el("div", "budget" + (b.left < 0 ? " over" : b.pct >= 80 ? " warn" : ""));
      const head = el("div", "budget-head");
      head.append(el("span", null, cat(b.category).name), el("span", "muted", b.left >= 0 ? `${money(b.left)} left` : `${money(-b.left)} over`));
      const bar = el("div", "bar"); const fill = el("i"); fill.style.width = `${Math.min(100, b.pct)}%`; bar.append(fill);
      row.append(head, bar, el("div", "budget-foot", `${money(b.spent)} of ${money(b.budget)}`));
      box.append(row);
    }
  }

  /* ---------- home ---------- */
  function renderHome() {
    const { main, rates } = state.settings;
    const total = L.totalBalance(state);
    $("heroBalance").textContent = money(total);
    $("heroBalance").classList.toggle("neg", total < 0);
    $("heroBalance").classList.toggle("long", $("heroBalance").textContent.length > 13);
    const all = L.totalIn(state.entries, main, rates);
    $("heroSub").textContent = state.entries.length ? `${money(all.income)} in · ${money(all.expense)} out, all time` : "Add your first income or expense with +";
    const nwBtn = $("heroNw");
    nwBtn.hidden = !state.assets.length;
    if (state.assets.length) {
      const nw = L.netWorth(state, L.today());
      nwBtn.replaceChildren(el("span", null, "Net worth"), el("strong", null, money(nw.total)), el("span", null, "›"));
    }
    const row = $("curRow"); row.replaceChildren();
    const per = L.balancesByCurrency(state);
    for (const c of L.CURRENCIES) {
      const chip = el("div", "cur-chip" + (per[c] < 0 ? " neg" : ""));
      chip.append(el("span", null, c), el("strong", null, L.formatMoney(per[c], c)));
      row.append(chip);
    }
    const bal = L.accountBalances(state);
    const ar = $("accRow"); ar.replaceChildren();
    for (const a of state.accounts) {
      const card = el("div", "acc-card" + (bal[a.id] < 0 ? " neg" : ""));
      card.append(el("span", "acc-kind", KIND[a.kind] || a.kind), el("span", "acc-name", a.name), el("strong", null, L.formatMoney(bal[a.id], a.currency)));
      ar.append(card);
    }

    const t = L.today(), d = L.parseDate(t);
    $("monthTitle").textContent = MONTHS[d.getMonth()];
    const month = L.inPeriod(state.entries, "month", t);
    setFlow("m", L.totalIn(month, main, rates));
    const cats = $("mCats"); cats.replaceChildren();
    const spend = L.byCategory(month, "expense", main, rates).slice(0, 5);
    const max = spend.length ? spend[0].amount : 1;
    for (const s of spend) {
      const line = el("div", "cat-bar");
      const bar = el("div", "bar"); const fill = el("i"); fill.style.width = `${Math.max(4, (s.amount / max) * 100)}%`; bar.append(fill);
      line.append(el("span", null, cat(s.category).name), bar, el("strong", null, money(s.amount)));
      cats.append(line);
    }
    const budgets = L.budgetStatus(state, t).slice(0, 3);
    $("homeBudgets").hidden = !budgets.length;
    budgetRows($("homeBudgetList"), budgets);

    const todays = L.sortEntries([...L.inPeriod(state.entries, "day", t), ...L.inPeriod(state.transfers, "day", t)]);
    const tt = L.totalIn(L.inPeriod(state.entries, "day", t), main, rates);
    $("todayNet").textContent = todays.length ? money(tt.balance, null, { sign: true }) : "";
    fillList($("todayList"), todays, "Nothing yet today.");
    fillList($("recentList"), L.sortEntries([...state.entries, ...state.transfers]).filter((e) => e.date !== t).slice(0, 6), "Your older entries will show here.");
  }

  /* ---------- history ---------- */
  function periodLabel() {
    const { start, end } = L.periodRange(ui.period, ui.ref);
    if (ui.period === "all") return "All time";
    if (ui.period === "day") return dayLabel(start);
    if (ui.period === "month") { const d = L.parseDate(start); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
    const a = L.parseDate(start), b = L.parseDate(end);
    return `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
  }

  function renderHistory() {
    for (const b of $("periodSeg").children) b.classList.toggle("on", b.dataset.period === ui.period);
    $("periodLabel").textContent = periodLabel();
    const hideNav = ui.period === "all";
    $("prevPeriod").style.visibility = $("nextPeriod").style.visibility = hideNav ? "hidden" : "";
    const list = L.inPeriod(state.entries, ui.period, ui.ref);
    const moves = L.inPeriod(state.transfers, ui.period, ui.ref);
    setFlow("p", L.totalIn(list, state.settings.main, state.settings.rates));
    const box = $("historyList"); box.replaceChildren();
    if (!list.length && !moves.length) { box.append(el("p", "empty card", "No entries in this period.")); return; }
    for (const g of L.groupByDay([...list, ...moves])) {
      const card = el("div", "card day");
      const t = L.totalIn(g.entries.filter((e) => !e.from), state.settings.main, state.settings.rates);
      const head = el("div", "card-head");
      head.append(el("h3", null, dayLabel(g.date)), el("span", "muted", money(t.balance, null, { sign: true })));
      const lst = el("div", "list");
      for (const e of g.entries) lst.append(entryRow(e));
      card.append(head, lst);
      box.append(card);
    }
  }

  /* ---------- wealth ---------- */
  function renderWealth() {
    const t = L.today();
    const nw = L.netWorth(state, t);
    $("nwTotal").textContent = money(nw.total);
    $("nwTotal").classList.toggle("neg", nw.total < 0);
    $("nwTotal").classList.toggle("long", $("nwTotal").textContent.length > 13);
    $("nwCash").textContent = money(nw.cash);
    $("nwAssets").textContent = money(nw.assets);
    $("nwDebts").textContent = nw.debts ? "−" + money(nw.debts) : money(0);
    const series = L.netWorthSeries(state, 12, t);
    // Compare with the first month that has anything recorded, so an empty past doesn't look like growth.
    const dates = [...state.entries.map((e) => e.date), ...state.assets.map((a) => a.values[0].date)].sort();
    const startIdx = Math.max(0, series.findIndex((m) => dates.length && dates[0] <= m.date));
    const from = series[startIdx];
    const change = nw.total - from.total;
    const fm = L.parseDate(from.date);
    $("nwChange").textContent = !state.assets.length && !state.entries.length ? "Add what you own to see your wealth grow."
      : startIdx === series.length - 1 ? "Your chart fills in month by month."
      : `${money(change, null, { sign: true })} since the end of ${MONTHS[fm.getMonth()]} ${fm.getFullYear()}`;

    const max = Math.max(1, ...series.map((m) => Math.abs(m.total)));
    const ch = $("nwChart"); ch.replaceChildren();
    for (const m of series) {
      const col = el("div", "col"), bars = el("div", "bars");
      const bar = el("i", m.total < 0 ? "neg" : ""); bar.style.height = `${(Math.abs(m.total) / max) * 100}%`; bar.title = `${m.month}: ${money(m.total)}`;
      bars.append(bar);
      col.append(bars, el("span", "col-m", MONTHS[Number(m.month.slice(5)) - 1].slice(0, 1)));
      ch.append(col);
    }

    const gl = $("goalList"); gl.replaceChildren();
    if (!state.goals.length) gl.append(el("p", "empty", "Save for something: an emergency fund, a car, a house deposit."));
    for (const g of state.goals) {
      const st = L.goalStatus(state, g, t);
      const b = el("button", "goal budget" + (st.done ? " done" : "")); b.type = "button";
      const head = el("div", "budget-head");
      head.append(el("strong", null, g.name), el("span", "muted", st.done ? "Reached ✓" : `${st.pct}%`));
      const bar = el("div", "bar"); const fill = el("i"); fill.style.width = `${Math.max(2, st.pct)}%`; bar.append(fill);
      const m = (c) => L.formatMoney(c, g.currency);
      const foot = st.done ? `${m(st.saved)} saved` : st.late ? `${m(st.saved)} of ${m(g.target)} · the date has passed`
        : st.perMonth ? `${m(st.saved)} of ${m(g.target)} · ${m(st.perMonth)} a month to make it` : `${m(st.saved)} of ${m(g.target)}`;
      b.append(head, bar, el("div", "budget-foot", foot));
      b.addEventListener("click", () => openItem("goal", g.id));
      gl.append(b);
    }

    const hl = $("hustleList"); hl.replaceChildren();
    if (!state.hustles.length) hl.append(el("p", "empty", "Track what each side hustle really earns after its costs."));
    for (const h of state.hustles) {
      const st = L.hustleStats(state, h, t);
      const r = el("button", "row hustle"); r.type = "button";
      const mid = el("span", "row-mid");
      mid.append(el("span", "row-title", h.name), el("span", "row-note", `All time ${money(st.all.balance, null, { sign: true })}${st.goalPct != null ? ` · ${st.goalPct}% of monthly goal` : ""}`));
      const right = el("span", "row-mid right");
      right.append(el("span", "row-amt" + (st.month.balance < 0 ? " neg" : ""), money(st.month.balance, null, { sign: true })), el("span", "row-note", "this month"));
      r.append(el("span", "dot", "⚡"), mid, right);
      r.addEventListener("click", () => openItem("hustle", h.id));
      hl.append(r);
    }

    const alloc = L.allocation(state, t);
    $("allocCard").hidden = !alloc.length;
    const al = $("alloc"); al.replaceChildren();
    for (const a of alloc) {
      const line = el("div", "cat-bar");
      const bar = el("div", "bar"); const fill = el("i", "asset"); fill.style.width = `${Math.max(3, a.pct)}%`; bar.append(fill);
      line.append(el("span", null, `${ASSET_KIND[a.kind]} ${a.pct}%`), bar, el("strong", null, money(a.value)));
      al.append(line);
    }

    for (const [box, debts] of [[$("assetList"), false], [$("debtList"), true]]) {
      box.replaceChildren();
      const list = state.assets.filter((a) => (a.kind === "debt") === debts);
      if (!list.length) box.append(el("p", "empty", debts ? "No debts recorded. Loans and credit you owe go here." : "Property, gold, stocks, savings, a car, a business: add what you own."));
      for (const a of list) {
        const st = L.assetStats(state, a, t);
        const r = el("button", `row ${debts ? "debt" : "asset"}`); r.type = "button";
        const mid = el("span", "row-mid");
        mid.append(el("span", "row-title", a.name));
        const bits = [ASSET_KIND[a.kind]];
        if (!debts && st.year.net) bits.push(`${L.formatMoney(st.year.net, a.currency, { sign: true })} a year`);
        if (!debts && st.yieldPct) bits.push(`${st.yieldPct}% yield`);
        mid.append(el("span", "row-note", bits.join(" · ")));
        const right = el("span", "row-mid right");
        right.append(el("span", "row-amt", (debts ? "−" : "") + L.formatMoney(st.value, a.currency)));
        if (!debts && st.gain && st.base) right.append(el("span", "row-note " + (st.gain > 0 ? "row-sub-pos" : "row-sub-neg"), `${L.formatMoney(st.gain, a.currency, { sign: true })}${st.gainPct != null ? ` (${st.gainPct > 0 ? "+" : ""}${st.gainPct}%)` : ""}`));
        r.append(el("span", "dot", debts ? "−" : "◆"), mid, right);
        r.addEventListener("click", () => openAsset(a.id));
        box.append(r);
      }
    }
  }

  function openAsset(id, debt) {
    ui.viewing = id || null;
    ui.newDebt = !!debt;
    const a = id && assetById(id);
    $("assetForm").hidden = !!a;
    $("assetView").hidden = !a;
    $("aErr").hidden = true;
    if (!a) {
      $("aTitle").textContent = debt ? "New debt" : "New asset";
      const kinds = debt ? ["debt"] : L.ASSET_KINDS.filter((k) => k !== "debt");
      fillSelect($("aKind"), kinds.map((k) => [k, ASSET_KIND[k]]));
      $("aKind").disabled = !!debt;
      $("aValueLabel").textContent = debt ? "Amount you owe" : "Value today";
      $("aCostBox").hidden = !!debt;
      $("aCur").value = state.settings.main;
      for (const f of ["aName", "aValue", "aCost"]) $(f).value = "";
      $("aDate").value = L.today();
    } else renderAssetView();
    $("assetSheet").showModal();
  }

  function renderAssetView() {
    const a = assetById(ui.viewing); if (!a) return;
    const debt = a.kind === "debt", t = L.today();
    const st = L.assetStats(state, a, t);
    const m = (c, o) => L.formatMoney(c, a.currency, o);
    $("aTitle").textContent = `${a.name}`;
    const stats = $("aStats"); stats.replaceChildren();
    const stat = (label, value, sub) => { const d = el("div", "stat"); d.append(el("span", null, label), el("strong", null, value)); if (sub) d.append(el("em", null, sub)); stats.append(d); };
    stat(debt ? "You owe" : "Value", m(st.value), `${ASSET_KIND[a.kind]} · updated ${dayLabel(st.updated)}`);
    if (debt) {
      const firstV = a.values[0].value;
      stat("Paid off", m(Math.max(0, firstV - st.value)), `of ${m(firstV)}`);
    } else {
      stat("Gain", m(st.gain, { sign: true }), st.gainPct != null ? `${st.gainPct > 0 ? "+" : ""}${st.gainPct}% on ${m(st.base)}` : "");
      stat("Income, last 12 months", m(st.year.net, { sign: true }), st.year.expense ? `${m(st.year.income)} in · ${m(st.year.expense)} costs` : "Link rent or dividends when you add them");
      stat("Yield", st.yieldPct != null ? `${st.yieldPct}%` : "—", "Yearly income ÷ value");
    }
    $("vValue").value = ""; $("vValue").placeholder = debt ? "Still owed" : "New value";
    $("vDate").value = t;
    const h = $("aHistory"); h.replaceChildren();
    const vals = a.values.slice().reverse();
    vals.forEach((v, i) => {
      const prev = vals[i + 1];
      const row = el("div");
      const left = el("span", null, dayLabel(v.date));
      const right = el("span", null, m(v.value));
      if (prev) { const d = v.value - prev.value; if (d) right.append(el("span", "chg " + ((d > 0) !== debt ? "row-sub-pos" : "row-sub-neg"), m(d, { sign: true }))); }
      row.append(left, right);
      h.append(row);
    });
    const flows = L.sortEntries(state.entries.filter((e) => e.asset === a.id)).slice(0, 8);
    $("aFlowsLabel").hidden = debt && !flows.length;
    fillList($("aFlows"), flows, "Nothing linked yet. When you add rent, dividends or upkeep, pick this asset.");
    for (const r of $("aFlows").querySelectorAll(".row")) r.addEventListener("click", () => $("assetSheet").close(), { capture: true });
  }

  function saveNewAsset(ev) {
    ev.preventDefault();
    const costRaw = $("aCost").value.trim();
    const input = {
      name: $("aName").value, kind: ui.newDebt ? "debt" : $("aKind").value, currency: $("aCur").value,
      value: $("aValue").value.trim() === "0" ? 0 : L.parseAmount($("aValue").value), date: $("aDate").value,
      cost: costRaw && !ui.newDebt ? L.parseAmount(costRaw) : undefined,
    };
    const r = L.addAsset(state.assets, input);
    const msg = { name: "Type a name.", value: "Enter the value.", date: "Pick a date.", cost: "What you paid isn't a number.", exists: "You already have one with that name." };
    if (r.error) { $("aErr").textContent = msg[r.error] || "Check the details."; $("aErr").hidden = false; return; }
    state.assets = r.assets; save();
    $("assetSheet").close(); render();
    toast(`${input.name.trim()} added`);
  }

  function updateValue(ev) {
    ev.preventDefault();
    const a = assetById(ui.viewing); if (!a) return;
    const raw = $("vValue").value.trim();
    const v = raw === "0" ? 0 : L.parseAmount(raw);
    if (v == null) { toast("Type the new value first"); return; }
    const next = L.setAssetValue(a, $("vDate").value, v);
    if (!next) { toast("Pick a date"); return; }
    state.assets = state.assets.map((x) => (x.id === a.id ? next : x)); save();
    renderAssetView(); render();
    toast(`${a.name}: ${L.formatMoney(v, a.currency)}`, () => { state.assets = state.assets.map((x) => (x.id === a.id ? a : x)); save(); renderAssetView(); render(); });
  }

  function deleteAsset() {
    const a = assetById(ui.viewing); if (!a) return;
    const links = state.entries.filter((e) => e.asset === a.id).map((e) => e.id);
    const at = state.assets.indexOf(a);
    state.assets = state.assets.filter((x) => x.id !== a.id);
    state.entries = state.entries.map((e) => { if (e.asset !== a.id) return e; const c = { ...e }; delete c.asset; return c; });
    save(); $("assetSheet").close(); render();
    toast(`${a.name} deleted`, () => {
      state.assets.splice(at, 0, a);
      state.entries = state.entries.map((e) => (links.includes(e.id) ? { ...e, asset: a.id } : e));
      save(); render();
    });
  }

  /* ---------- goals and side hustles sheet ---------- */
  function openItem(kind, id) {
    ui.item = { kind, id: id || null };
    for (const x of ["hustleForm", "goalForm", "hustleView", "goalView"]) $(x).hidden = true;
    $("hErr").hidden = $("gErr").hidden = true;
    if (!id && kind === "hustle") {
      $("iTitle").textContent = "New side hustle";
      $("hName").value = ""; $("hGoal").value = ""; $("hStart").value = L.today();
      $("hustleForm").hidden = false;
    } else if (!id && kind === "goal") {
      $("iTitle").textContent = "New savings goal";
      $("gName").value = ""; $("gTarget").value = ""; $("gDeadline").value = "";
      $("gCur").value = state.settings.main;
      fillGoalAccounts();
      $("goalForm").hidden = false;
    } else if (kind === "hustle") { $("hustleView").hidden = false; renderHustleView(); }
    else { $("goalView").hidden = false; renderGoalView(); }
    if (!$("itemSheet").open) $("itemSheet").showModal();
  }

  function fillGoalAccounts() {
    const cur = $("gCur").value;
    fillSelect($("gAccount"), [["", "Money I put aside"], ...state.accounts.filter((a) => a.currency === cur).map((a) => [a.id, `${a.name} balance`])]);
  }

  function stats(box, items) {
    box.replaceChildren();
    for (const [label, value, sub] of items) { const d = el("div", "stat"); d.append(el("span", null, label), el("strong", null, value)); if (sub) d.append(el("em", null, sub)); box.append(d); }
  }

  function renderHustleView() {
    const h = hustleById(ui.item.id); if (!h) return;
    const st = L.hustleStats(state, h, L.today());
    $("iTitle").textContent = h.name;
    const items = [
      ["This month", money(st.month.balance, null, { sign: true }), `${money(st.month.income)} in · ${money(st.month.expense)} costs`],
      ["Average, last 3 months", money(st.avg3, null, { sign: true }), "profit a month"],
      ["All time", money(st.all.balance, null, { sign: true }), `since ${dayLabel(h.start)}`],
      ["Return on costs", st.roi != null ? `${st.roi > 0 ? "+" : ""}${st.roi}%` : "—", st.best ? `best month ${monthName(st.best.month)}` : "profit ÷ what you spent"],
    ];
    if (h.goal) items.push(["Monthly goal", `${st.goalPct}%`, `${money(st.month.balance)} of ${money(h.goal)}`]);
    stats($("hStats"), items);
    const max = Math.max(1, ...st.series.map((m) => Math.abs(m.net)));
    const ch = $("hChart"); ch.replaceChildren();
    for (const m of st.series) {
      const col = el("div", "col"), bars = el("div", "bars");
      const bar = el("i", m.net < 0 ? "neg" : ""); bar.style.height = `${(Math.abs(m.net) / max) * 100}%`; bar.title = money(m.net);
      bars.append(bar);
      col.append(bars, el("span", "col-m", MONTHS[Number(m.month.slice(5)) - 1].slice(0, 3)));
      ch.append(col);
    }
    const flows = L.sortEntries(state.entries.filter((e) => e.hustle === h.id)).slice(0, 8);
    fillList($("hFlows"), flows, "Nothing yet. When you add income or costs, pick this side hustle.");
    for (const r of $("hFlows").querySelectorAll(".row")) r.addEventListener("click", () => $("itemSheet").close(), { capture: true });
  }

  function renderGoalView() {
    const g = goalById(ui.item.id); if (!g) return;
    const t = L.today(), st = L.goalStatus(state, g, t);
    const m = (c) => L.formatMoney(c, g.currency);
    $("iTitle").textContent = g.name;
    $("gPct").textContent = st.done ? "Reached ✓" : `${st.pct}%`;
    $("gBar").style.width = `${Math.max(2, st.pct)}%`;
    $("gLine").textContent = `${m(st.saved)} of ${m(g.target)}${g.account ? ` · following ${acc(g.account).name}` : ""}`;
    const items = [["Still to save", m(st.left)]];
    if (g.deadline) items.push(st.late ? ["Target date", dayLabel(g.deadline), "has passed"] : ["Each month", st.perMonth ? m(st.perMonth) : m(0), `for ${st.monthsLeft} month${st.monthsLeft === 1 ? "" : "s"}, by ${dayLabel(g.deadline)}`]);
    stats($("gStats"), items);
    $("saveForm").hidden = !!g.account;
    $("sAmount").value = ""; $("sDate").value = t;
    const h = $("sHistory"); h.replaceChildren();
    for (const x of g.saved.slice().sort((a, b) => (a.date < b.date ? 1 : -1))) {
      const row = el("div"); row.append(el("span", null, dayLabel(x.date)), el("span", null, L.formatMoney(x.amount, g.currency, { sign: true }))); h.append(row);
    }
  }

  function wireItems() {
    $("addGoalBtn").addEventListener("click", () => openItem("goal"));
    $("addHustleBtn").addEventListener("click", () => openItem("hustle"));
    $("closeItem").addEventListener("click", () => $("itemSheet").close());
    $("gCur").addEventListener("change", fillGoalAccounts);
    $("hustleForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const goalRaw = $("hGoal").value.trim();
      const r = L.addHustle(state.hustles, { name: $("hName").value, start: $("hStart").value, goal: goalRaw ? L.parseAmount(goalRaw) : undefined });
      if (r.error) { $("hErr").textContent = { name: "Type a name.", start: "Pick the start date.", goal: "The goal isn't a number.", exists: "You already have one with that name." }[r.error]; $("hErr").hidden = false; return; }
      state.hustles = r.hustles; save(); $("itemSheet").close(); render(); toast("Side hustle added");
    });
    $("goalForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const r = L.addGoal(state.goals, { name: $("gName").value, target: L.parseAmount($("gTarget").value), currency: $("gCur").value,
        deadline: $("gDeadline").value || undefined, account: $("gAccount").value || undefined }, state.accounts);
      if (r.error) { $("gErr").textContent = { name: "Name your goal.", target: "Enter the amount to reach.", deadline: "Pick a date.", exists: "You already have a goal with that name." }[r.error] || "Check the details."; $("gErr").hidden = false; return; }
      state.goals = r.goals; save(); $("itemSheet").close(); render(); toast("Goal added");
    });
    $("saveForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const g = goalById(ui.item.id); if (!g) return;
      const raw = $("sAmount").value.trim(), neg = raw.startsWith("-");
      const v = L.parseAmount(raw.replace(/^-/, ""));
      if (!v || !L.isDay($("sDate").value)) { toast("Type the amount first"); return; }
      const item = { date: $("sDate").value, amount: neg ? -v : v };
      g.saved.push(item); save(); renderGoalView(); render();
      toast(`${L.formatMoney(item.amount, g.currency, { sign: true })} to ${g.name}`, () => { g.saved = g.saved.filter((x) => x !== item); save(); renderGoalView(); render(); });
    });
    $("delGoal").addEventListener("click", () => {
      const g = goalById(ui.item.id); if (!g) return;
      const at = state.goals.indexOf(g);
      state.goals = state.goals.filter((x) => x !== g); save(); $("itemSheet").close(); render();
      toast(`${g.name} deleted`, () => { state.goals.splice(at, 0, g); save(); render(); });
    });
    $("delHustle").addEventListener("click", () => {
      const h = hustleById(ui.item.id); if (!h) return;
      const at = state.hustles.indexOf(h);
      const links = state.entries.filter((e) => e.hustle === h.id).map((e) => e.id);
      state.hustles = state.hustles.filter((x) => x !== h);
      state.entries = state.entries.map((e) => { if (e.hustle !== h.id) return e; const c = { ...e }; delete c.hustle; return c; });
      save(); $("itemSheet").close(); render();
      toast(`${h.name} deleted, its entries stay`, () => {
        state.hustles.splice(at, 0, h);
        state.entries = state.entries.map((e) => (links.includes(e.id) ? { ...e, hustle: h.id } : e));
        save(); render();
      });
    });
  }

  /* ---------- plan ---------- */
  function renderChart() {
    const { main, rates } = state.settings;
    const data = L.monthlySeries(state.entries, 6, L.today(), main, rates);
    const max = Math.max(1, ...data.map((m) => Math.max(m.income, m.expense)));
    const box = $("chart"); box.replaceChildren();
    for (const m of data) {
      const col = el("div", "col");
      const bars = el("div", "bars");
      const bi = el("i", "in"); bi.style.height = `${(m.income / max) * 100}%`; bi.title = `Income ${money(m.income)}`;
      const bo = el("i", "out"); bo.style.height = `${(m.expense / max) * 100}%`; bo.title = `Expenses ${money(m.expense)}`;
      bars.append(bi, bo);
      const mo = Number(m.month.slice(5)) - 1;
      col.append(bars, el("span", "col-m", MONTHS[mo].slice(0, 3)), el("span", "col-net" + (m.net < 0 ? " neg" : ""), shortMoney(m.net)));
      box.append(col);
    }
  }

  // 12 500 -> 12.5k, for the chart's small labels.
  function shortMoney(cents) {
    const v = cents / 100, a = Math.abs(v), s = v < 0 ? "−" : v > 0 ? "+" : "";
    if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
    return `${s}${Math.round(a)}`;
  }

  function renderPlan() {
    renderChart();
    const t = L.today(), d = L.parseDate(t);
    $("budgetMonth").textContent = `${MONTHS[d.getMonth()]}, in ${state.settings.main}`;
    const list = L.budgetStatus(state, t);
    budgetRows($("budgetList"), list);
    if (!list.length) $("budgetList").append(el("p", "empty", "No budgets yet. Pick a category and an amount below."));
    const bc = $("budgetCat"); const keep = bc.value; bc.replaceChildren();
    for (const c of state.categories.filter((x) => x.type === "expense")) bc.append(opt(c.id, c.name, c.id === keep));

    const rl = $("recList"); rl.replaceChildren();
    if (!state.recurring.length) rl.append(el("p", "empty", "Nothing repeating yet."));
    for (const r of state.recurring) {
      const a = acc(r.account);
      const row = el("div", `row ${r.type} static`);
      const mid = el("span", "row-mid");
      const when = r.freq === "weekly" ? `Every ${DAYS[L.parseDate(r.start).getDay()]}` : `Every month on the ${ordinal(r.day)}`;
      const title = r.note && r.note.toLowerCase() !== cat(r.category).name.toLowerCase() ? `${cat(r.category).name} · ${r.note}` : cat(r.category).name;
      mid.append(el("span", "row-title", title), el("span", "row-note", `${when} · ${a.name}`));
      const right = el("span", "row-right");
      right.append(el("span", "row-amt", L.formatMoney(r.type === "income" ? r.amount : -r.amount, a.currency, { sign: true })));
      const x = el("button", "chip-x", "✕"); x.type = "button"; x.title = "Stop repeating";
      x.addEventListener("click", () => {
        state.recurring = state.recurring.filter((k) => k.id !== r.id); save(); renderPlan();
        toast("Stopped. Entries already added stay.", () => { state.recurring.push(r); save(); renderPlan(); });
      });
      right.append(x);
      row.append(el("span", "dot", "↻"), mid, right);
      rl.append(row);
    }
    for (const b of $("recTypeSeg").children) b.classList.toggle("on", b.dataset.type === ui.recType);
    fillSelect($("recAcc"), state.accounts.map((a) => [a.id, `${a.name} (${a.currency})`]));
    fillSelect($("recCat"), state.categories.filter((c) => c.type === ui.recType).map((c) => [c.id, c.name]));
    if (!$("recStart").value) $("recStart").value = t;
  }

  function fillSelect(sel, pairs) {
    const keep = sel.value; sel.replaceChildren();
    for (const [v, txt] of pairs) sel.append(opt(v, txt, v === keep));
  }
  const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

  /* ---------- settings ---------- */
  function renderSettings() {
    const bal = L.accountBalances(state);
    const al = $("accList"); al.replaceChildren();
    for (const a of state.accounts) {
      const row = el("div", "row static");
      const mid = el("span", "row-mid");
      mid.append(el("span", "row-title", a.name), el("span", "row-note", `${KIND[a.kind]} · ${a.currency} · started at ${L.formatMoney(a.opening, a.currency)}`));
      const right = el("span", "row-right");
      right.append(el("span", "row-amt", L.formatMoney(bal[a.id], a.currency)));
      const used = L.accountInUse(state, a.id);
      const x = el("button", "chip-x", "✕"); x.type = "button";
      x.disabled = used || state.accounts.length === 1; x.title = used ? "In use, can't remove" : "Remove";
      x.addEventListener("click", () => { state.accounts = state.accounts.filter((k) => k.id !== a.id); save(); renderSettings(); });
      right.append(x);
      row.append(el("span", "dot", a.name.slice(0, 1).toUpperCase()), mid, right);
      al.append(row);
    }

    const seg = $("mainSeg"); seg.replaceChildren();
    for (const c of L.CURRENCIES) {
      const b = el("button", c === state.settings.main ? "on" : "", c); b.type = "button";
      b.addEventListener("click", () => { state.settings.main = c; save(); render(); });
      seg.append(b);
    }
    $("rateEUR").value = state.settings.rates.EUR;
    $("rateUSD").value = state.settings.rates.USD;
    const box = $("catList"); box.replaceChildren();
    for (const type of ["expense", "income"]) {
      box.append(el("h3", "sub", type === "income" ? "Income" : "Expenses"));
      const wrap = el("div", "chips");
      for (const c of state.categories.filter((x) => x.type === type)) {
        const chip = el("span", "chip static", c.name);
        if (c.custom) {
          const used = state.entries.some((e) => e.category === c.id) || state.recurring.some((r) => r.category === c.id);
          const x = el("button", "chip-x", "✕"); x.type = "button"; x.title = used ? "In use, can't remove" : "Remove";
          x.disabled = used;
          x.addEventListener("click", () => { state.categories = state.categories.filter((k) => k.id !== c.id); delete state.budgets[c.id]; save(); renderSettings(); });
          chip.append(x);
        }
        wrap.append(chip);
      }
      box.append(wrap);
    }
  }

  function render() {
    for (const v of document.querySelectorAll(".view")) v.hidden = v.dataset.view !== ui.view;
    for (const b of document.querySelectorAll(".tabs [data-go]")) b.classList.toggle("on", b.dataset.go === ui.view);
    const d = new Date();
    $("topDate").textContent = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    if (ui.view === "home") renderHome();
    if (ui.view === "history") renderHistory();
    if (ui.view === "plan") renderPlan();
    if (ui.view === "wealth") renderWealth();
    if (ui.view === "settings") renderSettings();
  }

  /* ---------- add / edit sheet ---------- */
  function accChips(box, selected, onPick, exclude) {
    box.replaceChildren();
    for (const a of state.accounts) {
      if (a.id === exclude) continue;
      const b = el("button", "chip" + (a.id === selected ? " on" : ""), `${a.name} · ${a.currency}`); b.type = "button";
      b.addEventListener("click", () => onPick(a.id));
      box.append(b);
    }
  }

  function renderSheetChoices() {
    const transfer = ui.type === "transfer";
    for (const b of $("typeSeg").children) b.classList.toggle("on", b.dataset.type === ui.type);
    $("sheet").dataset.type = ui.type;
    $("accLabel").textContent = transfer ? "From" : "Account";
    $("toBox").hidden = !transfer;
    $("catBox").hidden = transfer;
    $("amtCur").textContent = acc(ui.account).currency;
    accChips($("accChips"), ui.account, (id) => { ui.account = id; if (ui.to === id) ui.to = null; renderSheetChoices(); });
    if (transfer) {
      accChips($("toChips"), ui.to, (id) => { ui.to = id; $("toErr").hidden = true; $("fReceived").value = ""; renderSheetChoices(); }, ui.account);
      const cross = ui.to && acc(ui.to).currency !== acc(ui.account).currency;
      $("recvBox").hidden = !cross;
      $("recvCur").textContent = ui.to ? acc(ui.to).currency : "";
      if (cross && !$("fReceived").value) {
        const a = L.parseAmount($("fAmount").value);
        const c = a && L.convert(a, acc(ui.account).currency, acc(ui.to).currency, state.settings.rates);
        if (c) $("fReceived").value = amountText(c);
      }
    }
    const linkable = state.assets.filter((a) => ui.type === "expense" || a.kind !== "debt");
    $("assetBox").hidden = transfer || !linkable.length;
    const ac = $("assetChips"); ac.replaceChildren();
    for (const a of [{ id: null, name: "None" }, ...linkable]) {
      const b = el("button", "chip" + (a.id === ui.asset ? " on" : ""), a.name); b.type = "button";
      b.addEventListener("click", () => { ui.asset = a.id; renderSheetChoices(); });
      ac.append(b);
    }
    $("hustleBox").hidden = transfer || !state.hustles.length;
    const hc = $("hustleChips"); hc.replaceChildren();
    for (const h of [{ id: null, name: "None" }, ...state.hustles]) {
      const b = el("button", "chip" + (h.id === ui.hustle ? " on" : ""), h.name); b.type = "button";
      b.addEventListener("click", () => { ui.hustle = h.id; if (h.id && ui.type === "income" && !ui.category) ui.category = "side-hustle"; renderSheetChoices(); });
      hc.append(b);
    }
    const chips = $("catChips"); chips.replaceChildren();
    for (const c of state.categories.filter((x) => x.type === ui.type)) {
      const b = el("button", "chip" + (c.id === ui.category ? " on" : ""), c.name); b.type = "button";
      b.addEventListener("click", () => { ui.category = c.id; $("catErr").hidden = true; renderSheetChoices(); });
      chips.append(b);
    }
  }

  function defaultAccount() {
    if (ui.lastAccount && state.accounts.some((a) => a.id === ui.lastAccount)) return ui.lastAccount;
    return (state.accounts.find((a) => a.currency === state.settings.main) || state.accounts[0]).id;
  }

  function openSheet(item, type) {
    ui.editing = item || null;
    const isTransfer = item ? !!item.from : type === "transfer";
    ui.type = isTransfer ? "transfer" : item ? item.type : type || ui.lastType || "expense";
    ui.account = item ? (item.from || item.account) : defaultAccount();
    ui.to = item && item.to ? item.to : null;
    ui.category = item && !isTransfer ? item.category : null;
    ui.asset = item && item.asset ? item.asset : null;
    ui.hustle = item && item.hustle ? item.hustle : null;
    $("sheetTitle").textContent = item ? (isTransfer ? "Edit transfer" : "Edit entry") : "New entry";
    $("fAmount").value = item ? amountText(item.amount) : "";
    $("fReceived").value = item && isTransfer && item.received !== item.amount ? amountText(item.received) : "";
    $("fDate").value = item ? item.date : L.today();
    $("fNote").value = item ? item.note || "" : "";
    $("delBtn").hidden = !item;
    // An entry can't turn into a transfer (or back) while editing: delete and add again instead.
    $("typeSeg").querySelector('[data-type="transfer"]').disabled = !!item && !isTransfer;
    for (const b of $("typeSeg").querySelectorAll('[data-type="income"],[data-type="expense"]')) b.disabled = !!item && isTransfer;
    for (const id of ["amountErr", "catErr", "toErr"]) $(id).hidden = true;
    renderSheetChoices();
    $("sheet").showModal();
    if (!item) setTimeout(() => $("fAmount").focus(), 50);
  }

  function submitSheet(ev) {
    ev.preventDefault();
    const amount = L.parseAmount($("fAmount").value);
    const date = L.isDay($("fDate").value) ? $("fDate").value : L.today();
    const note = $("fNote").value.trim();
    const editing = ui.editing;
    if (ui.type === "transfer") {
      const from = acc(ui.account), to = ui.to ? acc(ui.to) : null;
      const received = to && to.currency !== from.currency ? L.parseAmount($("fReceived").value) : amount;
      const draft = { id: editing ? editing.id : L.newId(), from: ui.account, to: ui.to, amount, received, date, note, createdAt: editing ? editing.createdAt : Date.now() };
      const errs = L.validateTransfer(draft, state.accounts);
      $("amountErr").hidden = !errs.includes("amount") && !errs.includes("received");
      $("toErr").hidden = !errs.includes("to") && !errs.includes("same");
      if (errs.length) return;
      if (editing) state.transfers = state.transfers.map((t) => (t.id === draft.id ? draft : t)); else state.transfers.push(draft);
      ui.lastAccount = draft.from;
      finish(editing ? "Transfer updated" : `Moved ${L.formatMoney(amount, from.currency)} to ${to.name}`);
      return;
    }
    const a = acc(ui.account);
    const draft = {
      id: editing ? editing.id : L.newId(),
      type: ui.type, amount, currency: a.currency, account: ui.account, category: ui.category, date, note,
      createdAt: editing ? editing.createdAt : Date.now(),
    };
    if (editing && editing.recurring) draft.recurring = editing.recurring;
    const linked = ui.asset && assetById(ui.asset);
    if (linked && (draft.type === "expense" || linked.kind !== "debt")) draft.asset = linked.id;
    if (ui.hustle && hustleById(ui.hustle)) draft.hustle = ui.hustle;
    const errs = L.validateEntry(draft, state.categories, state.accounts);
    $("amountErr").hidden = !errs.includes("amount");
    $("catErr").hidden = !errs.includes("category");
    if (errs.length) return;
    if (editing) state.entries = state.entries.map((e) => (e.id === draft.id ? draft : e)); else state.entries.push(draft);
    ui.lastType = draft.type; ui.lastAccount = draft.account;
    finish(editing ? "Entry updated" : `${draft.type === "income" ? "Income" : "Expense"} added: ${L.formatMoney(draft.amount, draft.currency)}`);
  }

  function finish(msg) { save(); $("sheet").close(); render(); toast(msg); }

  function deleteItem() {
    const gone = ui.editing; if (!gone) return;
    const key = gone.from ? "transfers" : "entries";
    state[key] = state[key].filter((e) => e.id !== gone.id);
    save(); $("sheet").close(); render();
    toast(gone.from ? "Transfer deleted" : "Entry deleted", () => { state[key].push(gone); save(); render(); });
  }

  /* ---------- toast ---------- */
  let toastTimer = null, undoFn = null;
  function toast(text, undo) {
    $("toastText").textContent = text;
    undoFn = undo || null;
    $("toastUndo").hidden = !undo;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("toast").hidden = true; undoFn = null; }, undo ? 6000 : 2500);
  }

  /* ---------- wiring ---------- */
  function wire() {
    document.addEventListener("click", (ev) => {
      const go = ev.target.closest("[data-go]");
      if (go) { ui.view = go.dataset.go; render(); window.scrollTo(0, 0); }
    });
    $("addBtn").addEventListener("click", () => openSheet(null));
    $("transferBtn").addEventListener("click", () => openSheet(null, "transfer"));
    $("entryForm").addEventListener("submit", submitSheet);
    $("delBtn").addEventListener("click", deleteItem);
    $("closeSheet").addEventListener("click", () => $("sheet").close());
    for (const b of $("typeSeg").children) b.addEventListener("click", () => {
      if (ui.type !== b.dataset.type) { ui.type = b.dataset.type; ui.category = null; if (ui.type === "income" && ui.asset && (assetById(ui.asset) || {}).kind === "debt") ui.asset = null; renderSheetChoices(); }
    });
    $("fAmount").addEventListener("input", () => { if (ui.type === "transfer" && !$("recvBox").hidden) { $("fReceived").value = ""; renderSheetChoices(); } });
    for (const b of $("periodSeg").children) b.addEventListener("click", () => { ui.period = b.dataset.period; ui.ref = L.today(); renderHistory(); });
    $("prevPeriod").addEventListener("click", () => { ui.ref = L.shiftPeriod(ui.period, ui.ref, -1); renderHistory(); });
    $("nextPeriod").addEventListener("click", () => { ui.ref = L.shiftPeriod(ui.period, ui.ref, 1); renderHistory(); });

    // Wealth
    wireItems();
    $("addAssetBtn").addEventListener("click", () => openAsset(null, false));
    $("addDebtBtn").addEventListener("click", () => openAsset(null, true));
    $("closeAsset").addEventListener("click", () => $("assetSheet").close());
    $("assetForm").addEventListener("submit", saveNewAsset);
    $("valueForm").addEventListener("submit", updateValue);
    $("delAsset").addEventListener("click", deleteAsset);

    // Plan
    $("budgetForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const id = $("budgetCat").value, raw = $("budgetAmt").value.trim();
      if (raw === "0") { delete state.budgets[id]; save(); renderPlan(); toast(`Budget for ${cat(id).name} removed`); return; }
      const v = L.parseAmount(raw);
      if (!v) { toast("Type the monthly amount first"); return; }
      state.budgets[id] = v; $("budgetAmt").value = ""; save(); renderPlan();
      toast(`${cat(id).name}: ${money(v)} a month`);
    });
    for (const b of $("recTypeSeg").children) b.addEventListener("click", () => { ui.recType = b.dataset.type; renderPlan(); });
    $("recForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const start = $("recStart").value;
      const rule = {
        id: L.newId(), type: ui.recType, amount: L.parseAmount($("recAmt").value), account: $("recAcc").value, category: $("recCat").value,
        freq: $("recFreq").value, start, day: L.isDay(start) ? L.parseDate(start).getDate() : 1, note: $("recNote").value.trim(),
      };
      const errs = L.validateRecurring(rule, state);
      $("recErr").hidden = !errs.length;
      $("recErr").textContent = errs.includes("amount") ? "Enter an amount above zero." : errs.includes("start") ? "Pick the first date." : "Check the account and category.";
      if (errs.length) return;
      state.recurring.push(rule);
      const added = L.runRecurring(state, L.today());
      $("recAmt").value = ""; $("recNote").value = "";
      save(); renderPlan();
      toast(added ? `Repeating entry added, ${added} already due` : "Repeating entry added");
    });

    // Settings
    $("accForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const rawOpen = $("accOpen").value.trim();
      const neg = rawOpen.startsWith("-");
      const opening = rawOpen && rawOpen !== "0" ? L.parseAmount(rawOpen.replace(/^-/, "")) : 0;
      if (opening == null) { toast("Starting balance isn't a number"); return; }
      const r = L.addAccount(state.accounts, { name: $("accName").value, kind: $("accKind").value, currency: $("accCur").value, opening: neg ? -opening : opening });
      if (r.error) { toast(r.error === "exists" ? "You already have an account with that name" : "Type a name first"); return; }
      state.accounts = r.accounts; $("accName").value = ""; $("accOpen").value = "";
      save(); renderSettings(); toast("Account added");
    });
    for (const c of ["EUR", "USD"]) $("rate" + c).addEventListener("change", (ev) => {
      const v = Number(String(ev.target.value).replace(",", "."));
      if (v > 0) { state.settings.rates[c] = v; save(); toast(`1 ${c} = ${v} MAD`); } else ev.target.value = state.settings.rates[c];
    });
    $("catForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const r = L.addCategory(state.categories, $("catName").value, $("catType").value);
      if (r.error) { toast(r.error === "exists" ? "That category already exists" : "Type a name first"); return; }
      state.categories = r.categories; $("catName").value = ""; save(); renderSettings();
    });
    $("exportCsv").addEventListener("click", () => S.saveFile(`asef-${L.today()}.csv`, L.toCsv(state.entries, state.categories, state.accounts), "text/csv"));
    $("exportBackup").addEventListener("click", () => S.saveFile(`asef-backup-${L.today()}.json`, L.toBackup(state), "application/json"));
    $("importBackup").addEventListener("click", () => $("backupFile").click());
    $("backupFile").addEventListener("change", async (ev) => {
      const f = ev.target.files && ev.target.files[0]; ev.target.value = "";
      if (!f) return;
      const next = L.parseBackup(await f.text());
      if (!next) { toast("That file isn't an ASEF backup"); return; }
      const n = next.entries.length + next.transfers.length;
      if (!confirm(`Replace what's on this phone with the backup (${n} entries, ${next.accounts.length} accounts)?`)) return;
      const before = state;
      state = next; save(); render();
      toast("Backup restored", () => { state = before; save(); render(); });
    });
    $("toastUndo").addEventListener("click", () => { const f = undoFn; $("toast").hidden = true; undoFn = null; if (f) f(); });
  }

  async function start() {
    wire();
    state = L.loadState(await S.read());
    const added = L.runRecurring(state, L.today());
    save();
    render();
    if (added) toast(`${added} repeating ${added === 1 ? "entry" : "entries"} added`);
  }
  start();
})();
