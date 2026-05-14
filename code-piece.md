# CodePiece — Project Log

A real-time multiplayer card game built with Node.js + Socket.io. Inspired by a traditional 4-player trick-taking game. Title styled after One Piece anime.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js + Express |
| Real-time | Socket.io (WebSockets) |
| Frontend | Vanilla HTML / CSS / JS (no framework) |
| Font | Google Fonts — Bangers (One Piece style) |

---

## How to Run Locally

```bash
npm install
npm start
# or for auto-reload:
npx nodemon server.js
```

Open: **http://localhost:3000**

**Solo/CPU testing:**
1. Host a game → enter name → Create Room
2. Click "Fill with CPUs" (adds 3 CPU players instantly)
3. Start Game

**Multi-tab testing:**
- Open multiple browser tabs at localhost:3000
- Host in one, join with the 6-digit code in others

---

## File Structure

```
CodePiece/
├── server.js           — Express + Socket.io server, full game logic, CPU AI
├── package.json
└── public/
    ├── index.html      — All screens (landing, lobby, game, results, modals)
    ├── style.css       — Dark green table theme, One Piece title, card styles
    └── game.js         — Socket.io client, rendering, UI interactions
```

---

## Game Rules Implemented

- **Teams:** P1 + P3 (Team 1) vs P2 + P4 (Team 2), seated clockwise
- **Dealing:** 52 cards, 13 each, fully random. Reshuffles if any player has zero face cards (J/Q/K/A)
- **"I am side":** Players missing an entire suit are announced to everyone before play
- **Trump selection:** Rotates each game (Game 1 → P1 chooses, Game 2 → P2, etc.). Trump chooser leads first
- **Trick-taking:** Must follow lead suit. If unable, can play any card (trump or dummy)
- **Trump rule:** Any trump card beats any non-trump, regardless of value (2♥ trump beats A♠)
- **Win condition:** First team to 7 tricks wins the game
- **Match:** 4 games per match. Team with most game wins wins the match
- **Session:** Host picks 1 / 2 / 3 / 5 matches. Overall match wins determine session winner

---

## Socket Events Reference

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `create-room` | `{ playerName, matchCount }` | Host creates room |
| `join-room` | `{ playerName, roomCode }` | Player joins by code |
| `add-cpu` | — | Host adds one CPU player |
| `remove-cpu` | — | Host removes last CPU |
| `start-game` | — | Host starts (requires 4 players) |
| `select-trump` | `{ suit }` | Trump chooser picks suit |
| `play-card` | `{ card }` | Player plays a card |
| `next-game` | — | Host advances to next game (games 1–3) |
| `next-match` | — | Host starts next match |
| `return-to-lobby` | — | Host resets room to lobby |

### Server → Client
| Event | Description |
|---|---|
| `room-created` | Confirms room creation with code + position |
| `room-joined` | Confirms join with position |
| `lobby-update` | Player list changed (join / CPU added) |
| `side-announcement` | Cards dealt; who is "side" for which suits |
| `trump-selected` | Trump suit chosen; game begins |
| `game-state` | Full state snapshot sent to each player individually |
| `card-played` | A card was placed (with updated trick + hand sizes) |
| `trick-resolved` | Trick winner + updated scores |
| `game-over` | Game ended; trick tally + cumulative game scores |
| `match-over` | All 4 games done; match result |
| `session-over` | All matches done; final winner |
| `reset-to-lobby` | Room returned to lobby state |
| `join-error` | Room not found / full / in progress |

---

## UI Screens

| Screen ID | When shown |
|---|---|
| `screen-landing` | On load — logo + Host/Join buttons |
| `screen-lobby` | After creating/joining — shows room code, player slots, CPU controls |
| `screen-game` | During play — table layout, hand, score panel |
| `screen-game-over` | After each game |
| `screen-match-over` | After each 4-game match |
| `screen-session-over` | After all matches complete |

### Overlays / Modals (inside game screen)
- `overlay-sides` — "I am side" announcements after deal
- `trump-banner` — Inline trump suit picker (appears under top bar so hand is visible)
- `modal-last-trick` — View the 4 cards from the last completed trick
- `modal-rules` — Full rules reference (? button, always accessible)

---

## Key Design Decisions

**Trump selection flow:**
The side-announcement overlay is shown first. When dismissed, the trump banner appears as a thin strip below the top bar — the player can see their full hand while selecting trump. Previously it was a full-screen overlay that hid the hand (Bug 1).

**Game state broadcast timing:**
`broadcastGameState` is called both during `side-announcement` (so hand is visible immediately) and after every card play / trick resolve. Phase field in state controls whether cards are clickable (`playing`) or just visible (`side-announcement`).

**Client-side currentPlayer sync:**
`trick-resolved` immediately updates `gameState.currentPlayer = winnerPos` and `gameState.leadSuit = null` on the client before the follow-up `game-state` arrives. This ensures the winner's hand renders as playable without waiting for the server round-trip.

**Within-trick turn indicator:**
`card-played` advances `gameState.currentPlayer = (playerPos + 1) % 4` client-side so the active-turn highlight moves in real time as each card is played.

---

## CPU AI

- **Card play delay:** 4500–6000ms (~5 seconds) — intentional, so human can see what's happening
- **Trump selection delay:** 5000ms
- **Strategy:** Follows suit with highest card if possible; plays lowest trump if void; otherwise random

CPU players have no socket connection (`socketId: null`). All CPU logic runs server-side in `executeCPUMove`.

---

## Bugs Fixed

| # | Bug | Fix |
|---|---|---|
| 1 | Hand not visible during trump selection | Added `broadcastGameState(room)` inside `broadcastSideAnnouncement`; replaced full-screen overlay with inline banner |
| 2 | Winning player didn't start next round | Updated `gameState.currentPlayer = winnerPos` in client's `trick-resolved` handler; re-renders hand immediately |
| 3 | No clear indicator of whose turn it is | Added `YOUR TURN` flash bar, gold glow on hand area, stronger `active-turn` CSS on player name labels |
| 4 | CPU played too fast | Changed delay from 800–1400ms to 4500–6000ms |

---

## Pending / Future Work

- [ ] Sign-in and account creation for persistent stats (explicitly deferred in original spec)
- [ ] Reconnection handling if a human player disconnects mid-game
- [ ] Mobile/touch layout improvements (hand scrolls horizontally on small screens)
- [ ] Sound effects (card play, trick win, trump reveal)
- [ ] Hosting on Railway (free tier — see Hosting section)

---

## Hosting

Recommended: **Railway** (supports WebSockets, no spin-down on free tier)

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

`server.js` already reads `process.env.PORT` so no changes needed for deployment.

Other options: Fly.io (generous free tier, needs `fly.toml`), Render (free but spins down after 15 min idle — bad for a game), Glitch (easy but also sleeps).
