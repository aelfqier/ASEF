# ASEF

Track your money every day, then build wealth. ASEF keeps your income, expenses and balance in
Moroccan dirham (MAD), euro (EUR) and US dollar (USD), on the phone itself, so it works offline.

Built with Capacitor for Android and iOS, from plain HTML, CSS and JavaScript (no bundler).

- App ID: `io.github.aelfqier.asef`
- The screen is `www/index.html`, with styles in `www/css/app.css` and code in `www/js/`:
  `logic.js` does every calculation (amounts are whole cents), `store.js` saves on the phone,
  `app.js` runs the screens. After editing, run `npx cap sync`.
- Run the calculation tests with `npm test`. Try it in a browser with `npm start` and open http://localhost:8080.

## What it does now (step 1)

- Add income or an expense in a few taps: amount, currency, category, date and a note.
- Total balance in your main currency, plus a balance for each of MAD, EUR and USD.
  Exchange rates are set in Settings and only used for the total.
- This month's income, expenses and net, and where the money went by category.
- History by day, week (Monday to Sunday), month or all time, grouped by day. Tap an entry to edit it;
  deleting can be undone.
- Ready categories, plus your own. CSV export.

## Plan

1. Daily core: income, expenses, balance (done)
2. Accounts (cash, bank, wallets) and transfers, monthly budgets, repeating entries, charts, backup
3. Assets and net worth: value over time and the income each asset brings in
4. Side hustles, savings goals, French and Arabic, store release
