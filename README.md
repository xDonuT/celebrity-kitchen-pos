# Celebrity Kitchen POS

Point-of-sale system for **Celebrity Kitchen**, built as a single-page web app powered by Firebase Realtime Database for real-time synchronization across devices.

## Files

- `onlinePOS.html` — app structure/markup
- `style.css` — all styling
- `app.js` — Firebase wiring, DOM, and event handlers
- `js/pos-core.js` — shared business logic (totals, change, filters, summary, CSV)

`js/pos-core.js` holds the calculations and rules that must behave identically
everywhere, so they can be unit-tested under Node. It has no Firebase or DOM
dependencies and is loaded as a plain script before `app.js`, which means the app
keeps working when opened directly from a file or USB stick. `app.js` calls into
it rather than keeping a second copy of the math.

## Features

- Real-time order synchronization across devices via Firebase
- Walk-in and Tawag (call-in) order modes
- Cash, GCash, and **Split (GCash + Cash)** payment processing
- Kitchen & PBQ order management with independent section completion
- Pending order tracking and payment collection
- Menu & price management (admin)
- Transaction history & sales summary with CSV export
- Eco bag tracking
- Dark mode & sound toggles
- Mobile-optimized responsive design

## Setup

1. Open `onlinePOS.html` in a browser.
2. The app connects to the Firebase project configured in `app.js`.
3. Copy these five files, keeping the `js/` subfolder in place:
   `index.html`, `onlinePOS.html`, `style.css`, `app.js`, `js/pos-core.js`.

## Tests

Requires Node 18+ (dev only — the app itself needs no install).

```
npm test    # unit + workflow + wiring tests
npm run check   # syntax check app.js and js/pos-core.js
```

`tests/wiring.test.js` fails if logic that lives in `js/pos-core.js` is copied
back into `app.js`, so the unit tests cannot silently drift away from the code
that actually runs.

## Note

The Firebase API key in `app.js` is exposed client-side by design (it's a web app). Access control should be enforced via **Firebase Security Rules**, not by hiding the key.
