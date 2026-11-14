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

## App lock and automatic backup

- PIN lock (4 to 6 digits). Only a salted PBKDF2-SHA-256 hash is stored, never the PIN. Wrong PINs slow down
  after the fourth try (30 s, doubling, up to 15 minutes), even across restarts. Locks again when you leave the
  app (right away, after 1 or 5 minutes). Fingerprint or Face ID through `@capgo/capacitor-native-biometric`
  when the phone has it. The lock is never put in backup files, and restoring a backup keeps this phone's lock.
  Forgot PIN: erase the app's data and restore a backup file.
- Daily copies: the first time ASEF opens each day it keeps a copy of the data; the last 7 can be restored from
  Settings (with undo).
- Cloud: Android Auto Backup sends ASEF's saved data to the user's Google Drive and restores it on a new phone
  (`res/xml/backup_rules.xml`, `res/xml/data_extraction_rules.xml`); on iPhone it is part of iCloud Backup.
- A weekly reminder on Home to save a backup file, until one is saved.

## Live prices, reminders, monthly report, quick entry

- Live prices (can be turned off in Settings): exchange rates from open.er-api.com, crypto and gold from
  CoinGecko (gold by troy ounce, scaled by karat), stocks from Yahoo. An asset with a quantity and symbol gets
  its value updated at most every 6 hours, or on **Refresh** in Wealth. Only coin and stock symbols are sent.
- Reminders: a phone notification before each repeating bill (same day, 1, 2 or 3 days before, at 9:00), and a
  warning when an expense pushes a budget past 80% or 100%. The next bills also show on Home.
- Monthly report in Plan: income, spending, saved, top categories, budgets and net worth for any month, saved
  as a PDF (jsPDF, vendored in `www/vendor/`). Home shows a banner for last month's report in the first days.
- Quick entry: Android home screen widget and long-press shortcuts, iPhone quick actions; they open
  `asef://add?type=expense|income`, which goes straight to the add sheet (after unlocking).

## Accounts (version 1.1.0)

- Everyone logs in or creates an account (email and password, optional name) before using ASEF. Firebase
  Authentication handles it through its REST API, so there is no SDK: `www/js/config.js` holds the project's
  Web API key, and the calls are in `www/js/store.js` (`auth`).
- Money data stays on the phone, kept apart for each account (`asef-data:<uid>`). Data saved before accounts
  moves to the first account that logs in. Logging out keeps it; logging back in brings it back.
- Password reset by email, email confirmation, change password, log out, and delete account (asks for the
  password again; deletes the account and its data on the phone).
- The login is remembered and renewed quietly when online; no internet is needed to open the app once logged in.
- Forgot PIN: the account password now turns the PIN off without erasing anything.

### Setting up Firebase

1. Create a project at console.firebase.google.com (Analytics not needed).
2. Authentication → Sign-in method → turn on Email/Password.
3. Project settings → copy the Web API Key into `www/js/config.js`, then `npx cap sync`.
4. Optional: Authentication → Templates to change the sender name of reset and confirmation emails to ASEF.

## Plan

1. Daily core: income, expenses, balance (done)
2. Accounts (cash, bank, wallets) and transfers, monthly budgets, repeating entries, charts, backup (done)
3. Assets and net worth: value over time and the income each asset brings in (done)
4. Side hustles, savings goals, store readiness (done; English only)
