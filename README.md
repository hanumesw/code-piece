# ♠ CodePiece ♥

A real-time multiplayer trick-taking card game for 4 players, playable in your browser. Built with Node.js and Socket.io.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?logo=socket.io)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Overview

CodePiece is a 4-player, 2-team card game played over the internet. Players are split into two teams and compete to win 7 tricks per game. A match runs 4 games with a rotating trump chooser, and you can play a full session of multiple matches.

Designed to work with players physically apart — just share a 6-digit room code and play.

---

## Features

- **Real-time multiplayer** over WebSockets — works across different networks
- **Room system** — host generates a 6-digit code, others join with it
- **CPU players** — fill empty slots with AI for local testing or solo play
- **Full game logic** — trump cards, suit-following rules, trick resolution, score tracking
- **"I am side" announcements** — players missing a suit are declared before play begins
- **Match history** — game-by-game and match-by-match score tally
- **Last trick viewer** — click to review the cards from the previous trick
- **Rules reference** — always accessible via the ? button during play

---

## How to Play

### Teams
- **Team 1:** Player 1 & Player 3
- **Team 2:** Player 2 & Player 4
- Players sit in clockwise order: P1 → P2 → P3 → P4

### Objective
Win **7 tricks** in a game. Win the most games to win the match.

### Setup
1. 52 cards are dealt equally (13 each), fully at random
2. If any player has no face cards (J/Q/K/A), cards are redealt
3. Players with no cards of a suit announce **"I am side"** for that suit
4. The trump chooser (rotates each game) selects a trump suit
5. The trump chooser leads the first trick

### Playing a Trick
- You **must follow** the lead suit if you have it
- If you don't have the lead suit, you may play **any card** (including trump)
- You can only play trump if you don't have the lead suit

### Card Values
**Ace** > King > Queen > Jack > 10 > 9 > ... > **2**

Trump always wins over non-trump — even a 2 of trumps beats an Ace of any other suit.

### Winning
- First team to **7 tricks** wins the game
- A **match** is 4 games; most games won wins the match
- A **session** is 1–5 matches (host decides); most matches won wins

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/your-username/CodePiece.git
cd CodePiece
npm install
npm start
```

Open **http://localhost:3000** in your browser.

### Development (auto-reload)

```bash
npx nodemon server.js
```

---

## Playing Locally

**Solo / testing with CPU players:**
1. Click **Host a New Game**
2. Enter your name and pick number of matches
3. In the lobby, click **Fill with CPUs** to add 3 AI players
4. Click **Start Game**

**Multiple players on the same machine:**
1. Open multiple browser tabs at `http://localhost:3000`
2. Host in one tab, copy the room code
3. Join with the code in the other tabs

---

## Project Structure

```
CodePiece/
├── server.js        — Game server (Express + Socket.io, all game logic)
├── package.json
└── public/
    ├── index.html   — All screens and modals
    ├── style.css    — Styling
    └── game.js      — Client-side socket handling and UI
```

---

## Deployment

The server reads `process.env.PORT` automatically, so it works on any Node.js host out of the box.

**Recommended: Railway** (free tier, full WebSocket support)

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Other options: Fly.io, Render (note: free tier spins down after inactivity).

---

## License

MIT
