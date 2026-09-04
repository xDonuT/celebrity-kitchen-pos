# Celebrity Kitchen POS

Point-of-sale system for **Celebrity Kitchen**, built as a single-page web app powered by Firebase Realtime Database for real-time synchronization across devices.

## Files

- `onlinePOS.html` — app structure/markup
- `style.css` — all styling
- `app.js` — all application logic

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
3. All three files must stay together in the same folder.

## Note

The Firebase API key in `app.js` is exposed client-side by design (it's a web app). Access control should be enforced via **Firebase Security Rules**, not by hiding the key.
