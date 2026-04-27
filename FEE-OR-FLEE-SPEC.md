# Fee or Flee — Claude Code Spec

## What We're Building

A multiplayer party game called **Fee or Flee**. Players join on their phones via QR code. A host laptop runs the game screen. Each round shows two footballers side by side. Players must guess which one had the **higher inflation-adjusted 2026 transfer fee**. Wrong answer = a strike. Three strikes = eliminated. Last person standing wins.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Database + Realtime**: Supabase (already set up — do not recreate)
- **Deployment**: Vercel
- **QR Code**: `qrcode.react`
- **Font**: Press Start 2P (Google Fonts) — 8-bit retro aesthetic throughout

---

## Supabase (Already Configured — Do Not Recreate)

```
Project ID: ictaqtvybfmkzmzsponc
URL: https://ictaqtvybfmkzmzsponc.supabase.co
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljdGFxdHZ5YmZta3ptenNwb25jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTcxNDMsImV4cCI6MjA5Mjg5MzE0M30.k4cieWri5lzstcBcIRS-6JASBFB0wyfxj7koidNuaA0
```

Store these in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://ictaqtvybfmkzmzsponc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljdGFxdHZ5YmZta3ptenNwb25jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTcxNDMsImV4cCI6MjA5Mjg5MzE0M30.k4cieWri5lzstcBcIRS-6JASBFB0wyfxj7koidNuaA0
```

### Existing Schema

```sql
-- 50 footballers, ordered 1-50
players (
  id SERIAL PRIMARY KEY,
  name TEXT,
  club TEXT,
  nationality TEXT,
  position TEXT,
  original_fee_millions NUMERIC,
  original_year INTEGER,
  adjusted_fee_2026_millions NUMERIC,
  image_url TEXT,
  order_index INTEGER UNIQUE
)

-- One row per game session
rooms (
  id TEXT PRIMARY KEY,          -- short random code e.g. "SPURS7"
  status TEXT DEFAULT 'lobby',  -- lobby | active | finished
  current_round INTEGER DEFAULT 0,
  host_id TEXT,
  created_at TIMESTAMPTZ
)

-- One row per player who joins
room_players (
  id SERIAL PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id),
  player_name TEXT,
  strikes INTEGER DEFAULT 0,
  is_eliminated BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ
)

-- One row per answer submitted
answers (
  id SERIAL PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id),
  room_player_id INTEGER REFERENCES room_players(id),
  round INTEGER,
  answer TEXT,       -- 'higher' | 'lower' (relative to left player)
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ
)
```

Realtime is enabled on `rooms`, `room_players`, and `answers`.

---

## Game Logic

### Round Structure
- Each round = players at `order_index` N and N+1 shown side by side
- Round 1 = players 1 vs 2, Round 2 = players 2 vs 3, etc. (sliding window)
- 49 rounds total
- The **right player** is the unknown. Players vote whether the right player's fee is **higher or lower** than the left player's fee

### Answer Resolution
- Round closes when ALL active (non-eliminated) players have answered, OR the 10-second timer expires
- After close: reveal the correct answer on host screen
- Any active player who answered incorrectly gets +1 strike
- Any active player who did not answer in time gets +1 strike
- Players with 3 strikes set `is_eliminated = true`
- If only 1 player remains active, game ends

### Scoring Display
- Strikes shown as 3 hearts (or football icons): full = alive, empty = lost
- Host screen shows live leaderboard: name, remaining lives, eliminated status

---

## Routes

### `/` — Home
Simple landing page. Two buttons: **HOST GAME** and **JOIN GAME**.

### `/host` — Host Setup
- Generates a random 6-character room code
- Creates a row in `rooms` with status `lobby`
- Displays QR code linking to `/join/[roomCode]`
- Shows live lobby list (realtime): names populate as players join
- **START GAME** button — sets room status to `active`, begins Round 1

### `/host/[roomCode]` — Host Game Screen (TV/Laptop)
This is the main shared display. Full-screen, designed for a large screen.

**Lobby state**: QR code + player list
**Active state**:
- Two player cards side by side (name, club, nationality, position)
- Left card shows the known fee: `£XXXm (2026 value)`
- Right card shows `???` until round resolves
- Countdown timer (10 seconds), animated
- After reveal: show correct fee on right card, flash correct/wrong indicators
- Bottom: live leaderboard strip showing all players, hearts, eliminated status
- Host controls: Next Round button (manual advance after reveal)

### `/join/[roomCode]` — Player Join Page
- Input field for player name
- On submit: insert into `room_players`, redirect to `/play/[roomCode]?playerId=[id]`

### `/play/[roomCode]` — Player Phone View
This is the phone UI. Designed mobile-first, full viewport height.

**Lobby state**: "Waiting for host to start..." with player's name shown
**Active state**:
  - Shows current round number
  - Two big buttons: **HIGHER** and **LOWER**
  - Buttons disabled after answering — show which was selected
  - Countdown timer synced with host
  - Between rounds: brief result screen (correct/wrong + strike update)
**Eliminated state**: "YOU'RE OUT" screen with final round they survived to
**Won state**: "WINNER!" screen

---

## Design System — 8-Bit Retro Soccer

The entire game should look like a retro Game Boy / SNES football game from the early 90s. Think **Nintendo World Cup** or **Sensible Soccer**.

### Typography
- **Primary font**: `Press Start 2P` (Google Fonts) — use for ALL headings, labels, scores, buttons
- **Body/small text**: `Press Start 2P` at smaller sizes (8px-10px) — embrace the pixel look

### Colour Palette
```css
--green-pitch: #3a7d44;
--green-light: #4caf50;
--pixel-black: #1a1a2e;
--pixel-white: #f0f0f0;
--pixel-yellow: #ffd700;
--pixel-red: #e63946;
--pixel-blue: #457b9d;
--pixel-orange: #f4a261;
```

### Visual Style Rules
- Dark background (`--pixel-black`) everywhere
- Thick pixel borders on all cards: `border: 4px solid #f0f0f0; box-shadow: 4px 4px 0px #000`
- No border-radius anywhere — everything is sharp corners
- Buttons have a pixel-press effect: on click, shift `2px 2px` and remove shadow
- Use pixel art dividers and decorative elements (ASCII-style or CSS pixel art)
- The host screen background should evoke a football pitch: dark green with subtle pixel pitch markings
- Player cards should look like retro football sticker cards
- Hearts/lives shown as pixel heart icons (can use emoji ❤️ styled with `Press Start 2P` sizing)
- Countdown timer should be big, bold, and flash red in the last 3 seconds
- Transitions: no smooth CSS transitions — use stepped/instant changes for pixel authenticity
- On mobile, the HIGHER/LOWER buttons should be large, thumb-friendly, styled like retro game buttons

### Host Screen Layout (Landscape)
```
┌─────────────────────────────────────────────────────┐
│  FEE OR FLEE          ROUND 12/49       [timer: 07] │
├──────────────────────┬──────────────────────────────┤
│   PLAYER A CARD      │      PLAYER B CARD           │
│   Name               │      Name                    │
│   Club / Nation      │      Club / Nation           │
│   Position           │      Position                │
│                      │                              │
│   £147.4m            │        ???                   │
│   (2026 value)       │                              │
├─────────────────────────────────────────────────────┤
│  LEADERBOARD: Ferdy ❤❤❤  Jamie ❤❤🖤  Tom 💀        │
└─────────────────────────────────────────────────────┘
```

### Phone Screen Layout (Portrait)
```
┌─────────────────┐
│  FEE OR FLEE    │
│  Round 12/49    │
│                 │
│  Is [Player B]  │
│  higher or lower│
│  than [Player A]│
│  (£147.4m)?     │
│                 │
│  ┌───────────┐  │
│  │  HIGHER   │  │
│  └───────────┘  │
│  ┌───────────┐  │
│  │   LOWER   │  │
│  └───────────┘  │
│                 │
│  ❤ ❤ ❤         │
│  [player name]  │
└─────────────────┘
```

---

## Realtime Subscriptions

### Host page subscribes to:
- `room_players` where `room_id = X` — to update lobby + leaderboard live
- `answers` where `room_id = X` — to know when all players have answered

### Player page subscribes to:
- `rooms` where `id = X` — to detect round changes, game start, game end
- Their own `room_players` row — to detect strike/elimination updates

---

## State Transitions (Host Controls All)

```
lobby → active       Host clicks START GAME
active (round N)     Timer hits 0 OR all answers in → host sees REVEAL button
reveal               Host clicks NEXT ROUND → round N+1, reset answers
active → finished    After reveal, only 0 or 1 players remain active
```

The host is the source of truth. Host clicking Next Round increments `rooms.current_round` in Supabase. All player phones react to that change via realtime.

---

## Answer Evaluation Logic

When a round closes, run this check (can be done client-side on host):

```js
const leftPlayer = players[currentRound - 1]   // order_index = currentRound
const rightPlayer = players[currentRound]        // order_index = currentRound + 1
const correctAnswer = rightPlayer.adjusted_fee_2026_millions > leftPlayer.adjusted_fee_2026_millions
  ? 'higher'
  : 'lower'
```

Then for each answer row for this round:
- Mark `is_correct = true/false`
- For any active `room_player` who got it wrong or didn't answer: increment `strikes`
- If `strikes >= 3`: set `is_eliminated = true`

---

## Key Implementation Notes

- Room codes: generate as 4-letter uppercase random string + 2 digits (e.g. `GOAL42`)
- On join page, validate room exists and is in `lobby` status before allowing name entry
- Player ID is stored in `localStorage` on the player's phone so they can refresh without re-joining
- Do not use any smooth CSS transitions or border-radius anywhere — pixel authenticity matters
- The `image_url` column on players is currently null — skip player photos, use styled text cards only
- Add basic RLS: `rooms` and `room_players` readable by anyone with the room code, insertable by anyone
- Vercel deployment: set the two env vars in Vercel dashboard before deploying

---

## File Structure

```
/app
  /page.tsx                          Home
  /host
    /page.tsx                        Host setup, QR code, lobby
    /[roomCode]/page.tsx             Host game screen
  /join
    /[roomCode]/page.tsx             Player name entry
  /play
    /[roomCode]/page.tsx             Player phone view
/lib
  /supabase.ts                       Supabase client
  /gameLogic.ts                      Answer evaluation, strike logic
  /roomCode.ts                       Room code generator
/types
  /index.ts                          TypeScript types for all DB tables
```

---

## Install Commands

```bash
npx create-next-app@latest fee-or-flee --typescript --tailwind --app
cd fee-or-flee
npm install @supabase/supabase-js qrcode.react
```

Add to `app/layout.tsx`:
```html
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
```

Add to `tailwind.config.ts`:
```js
fontFamily: {
  pixel: ['"Press Start 2P"', 'monospace'],
}
```
