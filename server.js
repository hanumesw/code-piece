const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const socketToRoom = {};
const socketToPosition = {};

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_SYMBOLS = { diamonds: '♦', hearts: '♥', clubs: '♣', spades: '♠' };
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealHands() {
  const deck = shuffle(createDeck());
  return [deck.slice(0, 13), deck.slice(13, 26), deck.slice(26, 39), deck.slice(39, 52)];
}

function hasFaceCard(hand) {
  return hand.some(c => c.value >= 11);
}

function getSideInfo(hands) {
  return hands.map(hand => SUITS.filter(suit => !hand.some(c => c.suit === suit)));
}

function getTeam(position) {
  return position % 2 === 0 ? 1 : 2;
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getPlayerBySocket(roomCode, socketId) {
  const room = rooms[roomCode];
  if (!room) return null;
  return room.players.find(p => p.socketId === socketId);
}

function dealGame(room) {
  let hands;
  let attempts = 0;
  do {
    hands = dealHands();
    attempts++;
  } while (!hands.every(hasFaceCard) && attempts < 200);

  room.hands = hands;
  room.sides = getSideInfo(hands);
  room.tricks = { team1: 0, team2: 0 };
  room.currentTrick = [];
  room.lastTrick = null;
  room.leadSuit = null;
  room.trump = null;
  room.currentPlayer = room.trumpChooserIndex;
  room.phase = 'side-announcement';
}

function broadcastGameState(room) {
  room.players.forEach((player, idx) => {
    if (player.isCPU) return;
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) return;

    socket.emit('game-state', {
      hand: room.hands[idx],
      myPosition: idx,
      players: room.players.map(p => ({
        name: p.name,
        position: p.position,
        isCPU: p.isCPU,
        cardCount: room.hands[p.position] ? room.hands[p.position].length : 0,
      })),
      tricks: room.tricks,
      currentPlayer: room.currentPlayer,
      trump: room.trump,
      currentTrick: room.currentTrick,
      lastTrick: room.lastTrick,
      leadSuit: room.leadSuit,
      sides: room.sides,
      phase: room.phase,
      trumpChooser: room.trumpChooserIndex,
      gameScores: room.gameScores,
      matchScores: room.matchScores,
      currentGame: room.currentGame,
      currentMatch: room.currentMatch,
      matchCount: room.matchCount,
    });
  });
}

function scheduleCPU(room) {
  if (!room || room.phase !== 'playing') return;
  const player = room.players[room.currentPlayer];
  if (player && player.isCPU) {
    const delay = 4500 + Math.random() * 1500;
    setTimeout(() => {
      if (rooms[room.code]) executeCPUMove(room);
    }, delay);
  }
}

function executeCPUMove(room) {
  if (!room || room.phase !== 'playing') return;
  const pos = room.currentPlayer;
  const player = room.players[pos];
  if (!player || !player.isCPU) return;

  const hand = room.hands[pos];
  if (!hand || hand.length === 0) return;

  const { leadSuit, trump } = room;
  let card;

  if (!leadSuit) {
    card = hand[Math.floor(Math.random() * hand.length)];
  } else {
    const suitCards = hand.filter(c => c.suit === leadSuit);
    if (suitCards.length > 0) {
      card = suitCards.reduce((best, c) => c.value > best.value ? c : best);
    } else {
      const trumpCards = hand.filter(c => c.suit === trump);
      if (trumpCards.length > 0) {
        card = trumpCards.reduce((low, c) => c.value < low.value ? c : low);
      } else {
        card = hand[Math.floor(Math.random() * hand.length)];
      }
    }
  }

  processCardPlay(room, pos, card);
}

function processCardPlay(room, playerPos, card) {
  if (room.phase !== 'playing') return;
  if (room.currentPlayer !== playerPos) return;

  const hand = room.hands[playerPos];
  const cardIdx = hand.findIndex(c => c.suit === card.suit && c.value === card.value);
  if (cardIdx === -1) return;

  if (room.leadSuit && card.suit !== room.leadSuit) {
    const hasSuit = hand.some(c => c.suit === room.leadSuit);
    if (hasSuit) return;
  }

  hand.splice(cardIdx, 1);

  if (room.currentTrick.length === 0) {
    room.leadSuit = card.suit;
  }

  room.currentTrick.push({ playerPos, card });

  io.to(room.code).emit('card-played', {
    playerPos,
    card,
    currentTrick: room.currentTrick,
    handSizes: room.hands.map(h => h.length),
  });

  if (room.currentTrick.length === 4) {
    setTimeout(() => {
      if (rooms[room.code]) resolveTrick(room);
    }, 1000);
  } else {
    room.currentPlayer = (playerPos + 1) % 4;
    broadcastGameState(room);
    scheduleCPU(room);
  }
}

function resolveTrick(room) {
  const { currentTrick, trump, leadSuit } = room;

  let winnerPlay = currentTrick[0];
  for (const play of currentTrick.slice(1)) {
    const w = winnerPlay.card;
    const c = play.card;
    const wIsTrump = w.suit === trump;
    const cIsTrump = c.suit === trump;

    if (cIsTrump && !wIsTrump) {
      winnerPlay = play;
    } else if (cIsTrump && wIsTrump && c.value > w.value) {
      winnerPlay = play;
    } else if (!cIsTrump && !wIsTrump && c.suit === leadSuit && c.value > w.value) {
      winnerPlay = play;
    }
  }

  const winnerTeam = getTeam(winnerPlay.playerPos);
  room.tricks[`team${winnerTeam}`]++;
  room.lastTrick = [...room.currentTrick];
  room.currentTrick = [];
  room.leadSuit = null;
  room.currentPlayer = winnerPlay.playerPos;

  io.to(room.code).emit('trick-resolved', {
    winnerPos: winnerPlay.playerPos,
    winnerName: room.players[winnerPlay.playerPos].name,
    tricks: room.tricks,
    lastTrick: room.lastTrick,
  });

  const t1 = room.tricks.team1;
  const t2 = room.tricks.team2;

  if (t1 >= 7 || t2 >= 7 || (t1 + t2) >= 13) {
    setTimeout(() => {
      if (rooms[room.code]) endGame(room);
    }, 1200);
  } else {
    broadcastGameState(room);
    scheduleCPU(room);
  }
}

function endGame(room) {
  const { tricks } = room;
  const winner = tricks.team1 >= 7 ? 1 : tricks.team2 >= 7 ? 2 : tricks.team1 > tricks.team2 ? 1 : 2;
  room.gameScores[`team${winner}`]++;
  room.phase = 'game-over';

  io.to(room.code).emit('game-over', {
    tricks,
    winner,
    gameScores: room.gameScores,
    currentGame: room.currentGame,
    isLastGame: room.currentGame >= 4,
  });

  if (room.currentGame >= 4) {
    setTimeout(() => {
      if (rooms[room.code]) endMatch(room);
    }, 2500);
  }
}

function endMatch(room) {
  const { gameScores } = room;
  const winner = gameScores.team1 > gameScores.team2 ? 1 : gameScores.team2 > gameScores.team1 ? 2 : 0;
  if (winner !== 0) room.matchScores[`team${winner}`]++;
  room.phase = 'match-over';

  io.to(room.code).emit('match-over', {
    gameScores,
    matchScores: room.matchScores,
    winner,
    currentMatch: room.currentMatch,
    matchCount: room.matchCount,
    isLastMatch: room.currentMatch >= room.matchCount,
  });

  if (room.currentMatch >= room.matchCount) {
    setTimeout(() => {
      if (rooms[room.code]) {
        const sessionWinner = room.matchScores.team1 > room.matchScores.team2 ? 1 : 2;
        io.to(room.code).emit('session-over', {
          matchScores: room.matchScores,
          winner: sessionWinner,
        });
        room.phase = 'session-over';
      }
    }, 3000);
  }
}

function startNextGame(room) {
  room.currentGame++;
  room.trumpChooserIndex = (room.trumpChooserIndex + 1) % 4;
  dealGame(room);
  broadcastSideAnnouncement(room);
}

function startNextMatch(room) {
  room.currentMatch++;
  room.currentGame = 1;
  room.gameScores = { team1: 0, team2: 0 };
  room.trumpChooserIndex = (room.trumpChooserIndex + 1) % 4;
  dealGame(room);
  broadcastSideAnnouncement(room);
}

function broadcastSideAnnouncement(room) {
  io.to(room.code).emit('side-announcement', {
    sides: room.sides,
    players: room.players.map(p => ({ name: p.name, position: p.position, isCPU: p.isCPU })),
    trumpChooser: room.trumpChooserIndex,
    currentGame: room.currentGame,
    currentMatch: room.currentMatch,
    matchCount: room.matchCount,
  });

  // Send each player their hand immediately so they can see cards while selecting trump
  broadcastGameState(room);

  const chooser = room.players[room.trumpChooserIndex];
  if (chooser && chooser.isCPU) {
    setTimeout(() => {
      if (rooms[room.code] && room.phase === 'side-announcement') {
        const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
        processTrumpSelection(room, room.trumpChooserIndex, suit);
      }
    }, 5000);
  }
}

function processTrumpSelection(room, playerPos, suit) {
  if (room.phase !== 'side-announcement') return;
  if (room.trumpChooserIndex !== playerPos) return;

  room.trump = suit;
  room.phase = 'playing';
  room.currentPlayer = room.trumpChooserIndex;

  io.to(room.code).emit('trump-selected', {
    suit,
    chooserPos: playerPos,
    chooserName: room.players[playerPos].name,
    currentPlayer: room.currentPlayer,
  });

  broadcastGameState(room);
  scheduleCPU(room);
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('create-room', ({ playerName, matchCount }) => {
    let code;
    do { code = generateCode(); } while (rooms[code]);

    const room = {
      code,
      players: [{ socketId: socket.id, name: playerName || 'Player 1', position: 0, isHost: true, isCPU: false }],
      matchCount: matchCount || 1,
      currentMatch: 1,
      currentGame: 1,
      matchScores: { team1: 0, team2: 0 },
      gameScores: { team1: 0, team2: 0 },
      trumpChooserIndex: 0,
      hands: [],
      sides: [],
      tricks: { team1: 0, team2: 0 },
      currentTrick: [],
      lastTrick: null,
      leadSuit: null,
      trump: null,
      currentPlayer: 0,
      phase: 'lobby',
    };

    rooms[code] = room;
    socketToRoom[socket.id] = code;
    socketToPosition[socket.id] = 0;
    socket.join(code);

    socket.emit('room-created', { code, position: 0, playerName: room.players[0].name });
    io.to(code).emit('lobby-update', { players: room.players, matchCount: room.matchCount });
  });

  socket.on('join-room', ({ playerName, roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('join-error', { msg: 'Room not found. Check the code and try again.' });
    if (room.phase !== 'lobby') return socket.emit('join-error', { msg: 'Game already in progress.' });
    if (room.players.length >= 4) return socket.emit('join-error', { msg: 'Room is full.' });

    const position = room.players.length;
    room.players.push({ socketId: socket.id, name: playerName || `Player ${position + 1}`, position, isHost: false, isCPU: false });

    socketToRoom[socket.id] = roomCode;
    socketToPosition[socket.id] = position;
    socket.join(roomCode);

    socket.emit('room-joined', { code: roomCode, position });
    io.to(roomCode).emit('lobby-update', { players: room.players, matchCount: room.matchCount });
  });

  socket.on('add-cpu', () => {
    const roomCode = socketToRoom[socket.id];
    const room = rooms[roomCode];
    if (!room || room.phase !== 'lobby') return;

    const player = getPlayerBySocket(roomCode, socket.id);
    if (!player || !player.isHost) return;
    if (room.players.length >= 4) return socket.emit('game-error', { msg: 'Room is full.' });

    const position = room.players.length;
    const cpuNum = room.players.filter(p => p.isCPU).length + 1;
    room.players.push({ socketId: null, name: `CPU ${cpuNum}`, position, isHost: false, isCPU: true });

    io.to(roomCode).emit('lobby-update', { players: room.players, matchCount: room.matchCount });
  });

  socket.on('remove-cpu', () => {
    const roomCode = socketToRoom[socket.id];
    const room = rooms[roomCode];
    if (!room || room.phase !== 'lobby') return;

    const player = getPlayerBySocket(roomCode, socket.id);
    if (!player || !player.isHost) return;

    const lastIdx = room.players.length - 1;
    if (lastIdx > 0 && room.players[lastIdx].isCPU) {
      room.players.splice(lastIdx, 1);
      io.to(roomCode).emit('lobby-update', { players: room.players, matchCount: room.matchCount });
    }
  });

  socket.on('start-game', () => {
    const roomCode = socketToRoom[socket.id];
    const room = rooms[roomCode];
    if (!room) return;

    const player = getPlayerBySocket(roomCode, socket.id);
    if (!player || !player.isHost) return;
    if (room.players.length !== 4) return socket.emit('game-error', { msg: 'Need exactly 4 players to start.' });

    dealGame(room);
    broadcastSideAnnouncement(room);
  });

  socket.on('select-trump', ({ suit }) => {
    const roomCode = socketToRoom[socket.id];
    const room = rooms[roomCode];
    if (!room) return;
    const position = socketToPosition[socket.id];
    processTrumpSelection(room, position, suit);
  });

  socket.on('play-card', ({ card }) => {
    const roomCode = socketToRoom[socket.id];
    const room = rooms[roomCode];
    if (!room) return;
    const position = socketToPosition[socket.id];
    processCardPlay(room, position, card);
  });

  socket.on('next-game', () => {
    const roomCode = socketToRoom[socket.id];
    const room = rooms[roomCode];
    if (!room || room.phase !== 'game-over') return;
    const player = getPlayerBySocket(roomCode, socket.id);
    if (!player || !player.isHost) return;
    startNextGame(room);
  });

  socket.on('next-match', () => {
    const roomCode = socketToRoom[socket.id];
    const room = rooms[roomCode];
    if (!room || room.phase !== 'match-over') return;
    const player = getPlayerBySocket(roomCode, socket.id);
    if (!player || !player.isHost) return;
    startNextMatch(room);
  });

  socket.on('return-to-lobby', () => {
    const roomCode = socketToRoom[socket.id];
    const room = rooms[roomCode];
    if (!room) return;
    const player = getPlayerBySocket(roomCode, socket.id);
    if (!player || !player.isHost) return;

    room.phase = 'lobby';
    room.currentMatch = 1;
    room.currentGame = 1;
    room.matchScores = { team1: 0, team2: 0 };
    room.gameScores = { team1: 0, team2: 0 };
    room.trumpChooserIndex = 0;

    io.to(roomCode).emit('lobby-update', { players: room.players, matchCount: room.matchCount });
    io.to(roomCode).emit('reset-to-lobby');
  });

  socket.on('disconnect', () => {
    const roomCode = socketToRoom[socket.id];
    if (roomCode) {
      const room = rooms[roomCode];
      if (room) {
        const player = getPlayerBySocket(roomCode, socket.id);
        if (player) {
          io.to(roomCode).emit('player-disconnected', { playerName: player.name, position: player.position });
        }
      }
      delete socketToRoom[socket.id];
      delete socketToPosition[socket.id];
    }
    console.log('Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`CodePiece running at http://localhost:${PORT}`));
