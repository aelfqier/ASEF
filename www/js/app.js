/* ASEF: screens. Logic lives in logic.js (window.ASEF), saving in store.js (window.ASEFStore). */
(function () {
  "use strict";
  const L = window.ASEF, S = window.ASEFStore;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let state = L.emptyState();
  const ui = { view: "home", period: "month", ref: L.today(), editing: null, type: "expense", currency: "MAD", category: null };

  const save = () => S.write(state);
  const cat = (id) => state.categories.find((c) => c.id === id) || { name: id, type: "expense" };
  const money = (c, cur, o) => L.formatMoney(c, cur || state.settings.main, o);

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
    const r = el("button", `row ${e.type}`);
    r.type = "button";
    const dot = el("span", "dot", cat(e.category).name.slice(0, 1).toUpperCase());
    const mid = el("span", "row-mid");
    mid.append(el("span", "row-title", cat(e.category).name));
    if (e.note) mid.append(el("span", "row-note", e.note));
    const amt = el("span", "row-amt", L.formatMoney(L.signed(e), e.currency, { sign: true }));
    r.append(dot, mid, amt);
    r.addEventListener("click", () => openSheet(e));
    return r;
  }

  function fillList(box, entries, empty) {
    box.replaceChildren();
    if (!entries.length) { box.append(el("p", "empty", empty)); return; }
    for (const e of entries) box.append(entryRow(e));
  }

  function setFlow(prefix, t) {
    $(prefix + "In").textContent = money(t.income);
    $(prefix + "Out").textContent = money(t.expense);
    const n = $(prefix + "Net");
    n.textContent = money(t.balance, null, { sign: true });
    n.classList.toggle("neg", t.balance < 0);
  }

  /* ---------- home ---------- */
  function renderHome() {
    const { main, rates } = state.settings;
    const all = L.totalIn(state.entries, main, rates);
    $("heroBalance").textContent = money(all.balance);
    $("heroBalance").classList.toggle("neg", all.balance < 0);
    $("heroSub").textContent = state.entries.length ? `${money(all.income)} in · ${money(all.expense)} out, all time` : "Add your first income or expense with +";
    const row = $("curRow"); row.replaceChildren();
    const per = L.totalsByCurrency(state.entries);
    for (const c of L.CURRENCIES) {
      const chip = el("div", "cur-chip" + (per[c].balance < 0 ? " neg" : ""));
      chip.append(el("span", null, c), el("strong", null, L.formatMoney(per[c].balance, c)));
      row.append(chip);
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

    const todays = L.sortEntries(L.inPeriod(state.entries, "day", t));
    const tt = L.totalIn(todays, main, rates);
    $("todayNet").textContent = todays.length ? money(tt.balance, null, { sign: true }) : "";
    fillList($("todayList"), todays, "Nothing yet today.");
    fillList($("recentList"), L.sortEntries(state.entries).filter((e) => e.date !== t).slice(0, 6), "Your older entries will show here.");
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
    setFlow("p", L.totalIn(list, state.settings.main, state.settings.rates));
    const box = $("historyList"); box.replaceChildren();
    if (!list.length) { box.append(el("p", "empty card", "No entries in this period.")); return; }
    for (const g of L.groupByDay(list)) {
      const card = el("div", "card day");
      const t = L.totalIn(g.entries, state.settings.main, state.settings.rates);
      const head = el("div", "card-head");
      head.append(el("h3", null, dayLabel(g.date)), el("span", "muted", money(t.balance, null, { sign: true })));
      const lst = el("div", "list");
      for (const e of g.entries) lst.append(entryRow(e));
      card.append(head, lst);
      box.append(card);
    }
  }

  /* ---------- settings ---------- */
  function renderSettings() {
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
          const used = state.entries.some((e) => e.category === c.id);
          const x = el("button", "chip-x", "✕"); x.type = "button"; x.title = used ? "In use, can't remove" : "Remove";
          x.disabled = used;
          x.addEventListener("click", () => { state.categories = state.categories.filter((k) => k.id !== c.id); save(); renderSettings(); });
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
    if (ui.view === "settings") renderSettings();
  }

  /* ---------- add / edit sheet ---------- */
  function renderSheetChoices() {
    for (const b of $("typeSeg").children) b.classList.toggle("on", b.dataset.type === ui.type);
    $("sheet").dataset.type = ui.type;
    const cs = $("curSeg"); cs.replaceChildren();
    for (const c of L.CURRENCIES) {
      const b = el("button", c === ui.currency ? "on" : "", c); b.type = "button";
      b.addEventListener("click", () => { ui.currency = c; renderSheetChoices(); });
      cs.append(b);
    }
    const chips = $("catChips"); chips.replaceChildren();
    for (const c of state.categories.filter((x) => x.type === ui.type)) {
      const b = el("button", "chip" + (c.id === ui.category ? " on" : ""), c.name); b.type = "button";
      b.addEventListener("click", () => { ui.category = c.id; $("catErr").hidden = true; renderSheetChoices(); });
      chips.append(b);
    }
  }

  function openSheet(entry) {
    ui.editing = entry || null;
    ui.type = entry ? entry.type : ui.lastType || "expense";
    ui.currency = entry ? entry.currency : ui.lastCurrency || state.settings.main;
    ui.category = entry ? entry.category : null;
    $("sheetTitle").textContent = entry ? "Edit entry" : "New entry";
    $("fAmount").value = entry ? (entry.amount / 100).toFixed(2) : "";
    $("fDate").value = entry ? entry.date : L.today();
    $("fNote").value = entry ? entry.note || "" : "";
    $("delBtn").hidden = !entry;
    $("amountErr").hidden = $("catErr").hidden = true;
    renderSheetChoices();
    $("sheet").showModal();
    if (!entry) setTimeout(() => $("fAmount").focus(), 50);
  }

  function submitSheet(ev) {
    ev.preventDefault();
    const amount = L.parseAmount($("fAmount").value);
    const date = L.isDay($("fDate").value) ? $("fDate").value : L.today();
    const draft = {
      id: ui.editing ? ui.editing.id : L.newId(),
      type: ui.type, amount, currency: ui.currency, category: ui.category, date,
      note: $("fNote").value.trim(),
      createdAt: ui.editing ? ui.editing.createdAt : Date.now(),
    };
    const errs = L.validateEntry(draft, state.categories);
    $("amountErr").hidden = !errs.includes("amount");
    $("catErr").hidden = !errs.includes("category");
    if (errs.length) return;
    if (ui.editing) state.entries = state.entries.map((e) => (e.id === draft.id ? draft : e));
    else state.entries.push(draft);
    ui.lastType = draft.type; ui.lastCurrency = draft.currency;
    save();
    $("sheet").close();
    render();
    toast(ui.editing ? "Entry updated" : `${draft.type === "income" ? "Income" : "Expense"} added: ${L.formatMoney(draft.amount, draft.currency)}`);
  }

  function deleteEntry() {
    const gone = ui.editing; if (!gone) return;
    state.entries = state.entries.filter((e) => e.id !== gone.id);
    save(); $("sheet").close(); render();
    toast("Entry deleted", () => { state.entries.push(gone); save(); render(); });
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
    $("entryForm").addEventListener("submit", submitSheet);
    $("delBtn").addEventListener("click", deleteEntry);
    $("closeSheet").addEventListener("click", () => $("sheet").close());
    for (const b of $("typeSeg").children) b.addEventListener("click", () => {
      if (ui.type !== b.dataset.type) { ui.type = b.dataset.type; ui.category = null; renderSheetChoices(); }
    });
    for (const b of $("periodSeg").children) b.addEventListener("click", () => { ui.period = b.dataset.period; ui.ref = L.today(); renderHistory(); });
    $("prevPeriod").addEventListener("click", () => { ui.ref = L.shiftPeriod(ui.period, ui.ref, -1); renderHistory(); });
    $("nextPeriod").addEventListener("click", () => { ui.ref = L.shiftPeriod(ui.period, ui.ref, 1); renderHistory(); });
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
    $("exportCsv").addEventListener("click", () => S.saveFile(`asef-${L.today()}.csv`, L.toCsv(state.entries, state.categories), "text/csv"));
    $("toastUndo").addEventListener("click", () => { const f = undoFn; $("toast").hidden = true; undoFn = null; if (f) f(); });
  }

  async function start() {
    wire();
    state = L.loadState(await S.read());
    render();
  }
  start();
})();
