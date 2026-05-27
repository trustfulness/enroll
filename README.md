# Event enrollment (WhatsApp-friendly)

A free, mobile-friendly enrollment page for limited-seat events. Members enroll via a link you post in your WhatsApp group; everyone sees the same queue ordered by time.

## Try it now (demo)

1. Open `index.html` in your browser (double-click or use a local server).
2. Use: `index.html?demo=1` or `index.html?e=demo&demo=1`
3. Enroll with a name — data is stored in **this browser only** (not shared with others).

For a real group, complete the Google Apps Script setup below.

## Production setup ($0)

### 1. Google Sheet + Apps Script

1. Create a new [Google Sheet](https://sheets.google.com).
2. **Extensions → Apps Script** → delete any sample code → paste contents of `apps-script.gs`.
3. Run **`setup`** once (Run ▶ → authorize).
4. Run **`getAdminKey`** once → **View → Logs** → copy your admin key (save it privately).
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the URL ending in `/exec`.

### 2. Connect the HTML page

1. Open `config.js` and set:

   ```js
   window.ENROLL_CONFIG = {
     apiUrl: "https://script.google.com/macros/s/YOUR_ID/exec",
   };
   ```

2. Host the folder (pick one):
   - **GitHub Pages**: push `enroll/` to a repo → Settings → Pages → folder `/enroll`
   
Remember to change the branch from none to main and select folder to /root; otherwise /enroll will not be accessible 
   
   - **Open locally** for testing only (members on other phones won’t share demo data)


   

### 3. Create an event

In the browser (replace values):

```
https://script.google.com/macros/s/YOUR_ID/exec?action=createEvent&adminKey=YOUR_ADMIN_KEY&eventId=sat-basketball&title=Pickup%20Sat%207pm&maxSeats=10
```

Or use any HTTP client with parameters:

| Parameter   | Example        |
|------------|----------------|
| action     | createEvent    |
| adminKey   | from getAdminKey |
| eventId    | sat-basketball |
| title      | Pickup Sat 7pm |
| maxSeats   | 10             |
| opensAt    | (optional ISO date) |
| closesAt   | (optional ISO date) |

### 4. Share in WhatsApp

Post in your group:

```
🏀 Pickup Sat 7pm — max 10 players
Enroll (first come, first served):
https://YOUR_USERNAME.github.io/enroll/?e=sat-basketball
```

Pin the message. Members open the link on their phone, enroll, and see the live queue.

## URL parameters

| Param | Meaning |
|-------|---------|
| `e`   | Event ID (required for real events) |
| `demo=1` | Force local demo mode |

Example: `index.html?e=sat-basketball`

## How fairness works

- **Order** = enrollment timestamp on the server (Google Sheet), not WhatsApp reply order.
- **Confirmed** = positions 1 … `maxSeats`.
- **Waitlist** = positions after `maxSeats`.
- **Cancel** = marks enrollment cancelled; everyone else moves up.
- **One spot per person** = matched by phone or name (case-insensitive).

Cancel uses a token stored on the member’s device when they enrolled (same phone/browser).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `styles.css` | Mobile-friendly UI |
| `app.js` | Enroll / cancel / list logic |
| `config.js` | Your Apps Script URL |
| `apps-script.gs` | Backend (paste into Google Apps Script) |

## Tips

- Use a short `eventId` (e.g. `jun15-game`).
- Ask members to fill **phone** so duplicates are rare.
- All times are stored and shown in **Hong Kong time (HKT, GMT+8)**, e.g. `2026-05-26 15:30:00 HKT`.
- To convert old ISO dates already in your sheet, run **`migrateSheetDatesToHK`** once in Apps Script (then redeploy).
- Post in WhatsApp when the event is **full** or when a cancel opens a spot for the waitlist.
- To close an event, set `active` to `false` in the Events sheet row.
