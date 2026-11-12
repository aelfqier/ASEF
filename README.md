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

## Step 2

- Accounts: cash, bank, wallets and savings, each in MAD, EUR or USD with a starting balance. Every entry
  belongs to an account. Data saved before accounts existed is moved to a cash account in its currency.
- Transfers between accounts; between currencies you type the amount that actually arrived.
- Monthly budgets per expense category, in the main currency, with what's left or over.
- Repeating income and expenses (every month on a day, or every week), added on their day when the app opens.
- Plan tab: income and expenses over the last 6 months, budgets and repeating entries.
- Backup file (save to Drive, WhatsApp or email) and restore, with undo.

## Step 3

- Wealth tab: net worth (cash in accounts, plus assets, minus debts) in the main currency, what it was at
  the end of each of the last 12 months, and how your assets split by type.
- Assets of every kind (property, land, gold, stocks, crypto, savings, vehicle, business, other), each in
  MAD, EUR or USD, with a value history: update the value whenever it changes.
- What you paid, so you see the gain; income and costs linked to the asset (rent, dividends, upkeep),
  so you see what it earns in a year and its yield.
- Debts (loans, credit) with what's still owed and how much is paid off.

## Step 4

- Side hustles: link income and costs to a side hustle and see its profit this month, its 3-month average,
  all time, return on costs, best month and an optional monthly profit goal.
- Savings goals: a target, an optional date, and either an account to follow (its balance is the progress)
  or money put aside by hand. Shows how much to save each month to make the date.
- Store readiness: app icon and splash screen (`assets/`), version 1.0.0, release signing setup,
  [privacy policy](PRIVACY.md), [store listing text](store/listing.md) and the [release guide](RELEASE.md).

## Plan

1. Daily core: income, expenses, balance (done)
2. Accounts (cash, bank, wallets) and transfers, monthly budgets, repeating entries, charts, backup (done)
3. Assets and net worth: value over time and the income each asset brings in (done)
4. Side hustles, savings goals, store readiness (done; English only)
