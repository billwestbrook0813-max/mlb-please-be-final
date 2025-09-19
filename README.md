
# MLB Vintage Slate — Full UI

Vintage ballpark UI that:
- Shows **Total Runs Scored** (final + live)
- **Projected Slate Total** = scored + remaining from **live totals** + **pregame totals** for not-started
- Lists games with **probable starters + ERA + W-L**
- Auto-refreshes every 60s

## Render Setup
- Build: `npm install`
- Start: `npm start`
- Environment:
  - `ODDS_API_KEY=your_oddsapi_key`
- Node will bind to `PORT` automatically.

## Local Dev
```bash
npm install
export ODDS_API_KEY=your_key_here
npm start
```

## Notes
- Schedule date uses **America/Los_Angeles** to avoid UTC day drift.
- If today's slate is empty, it auto-loads **tomorrow's**.
- Odds are proxied via `/api/odds` and `/api/odds-live` to avoid CORS.


## Branding
- Switched accent palette to **Juice Junkies** slime green.
- Header logo replaced with `public/assets/jj-logo.svg`.
- Live games outlined in slime green for quick scan.
