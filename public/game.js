const socket = io();

// ===== STATE =====
let myPosition = -1;
let myHand = [];
let isHost = false;
let gameState = null;
let pendingSideData = null;

const SUIT_SYM = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const VAL_DISPLAY = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUITS_ORDER = ['spades', 'hearts', 'diamonds', 'clubs'];

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
window.closeModal = closeModal;

// ===== CARD UTILITIES =====
function valStr(v) { return VAL_DISPLAY[v] || String(v); }
function isRed(suit) { return suit === 'hearts' || suit === 'diamonds'; }

function makeCard(card, clickable) {
  const el = document.createElement('div');
  el.className = `card ${isRed(card.suit) ? 'red' : 'black'}`;
  el.innerHTML = `<span class="cv">${valStr(card.value)}</span><span class="cs">${SUIT_SYM[card.suit]}</span>`;
  el.dataset.suit = card.suit;
  el.dataset.value = card.value;
  if (clickable) {
    el.classList.add('playable');
    el.addEventListener('click', () => onCardClick(card, el));
  } else {
    el.classList.add('unplayable');
  }
  return el;
}

function makeTrickCard(card) {
  const el = document.createElement('div');
  el.className = `card trick-card ${isRed(card.suit) ? 'red' : 'black'}`;
  el.innerHTML = `<span class="cv">${valStr(card.value)}</span><span class="cs">${SUIT_SYM[card.suit]}</span>`;
  return el;
}

function makeCardBack(vertical) {
  const el = document.createElement('div');
  el.className = 'card-back' + (vertical ? ' vertical' : '');
  return el;
}

// ===== RENDER HAND =====
function renderHand() {
  const handEl = document.getElementById('my-hand');
  handEl.innerHTML = '';

  const isMyTurn = gameState && gameState.currentPlayer === myPosition && gameState.phase === 'playing';
  const leadSuit = gameState ? gameState.leadSuit : null;

  // Update hand area glow + your-turn flash
  handEl.classList.toggle('my-turn', isMyTurn);
  document.getElementById('your-turn-flash').style.display = isMyTurn ? 'block' : 'none';

  const sorted = [...myHand].sort((a, b) => {
    const si = SUITS_ORDER.indexOf(a.suit) - SUITS_ORDER.indexOf(b.suit);
    return si !== 0 ? si : a.value - b.value;
  });

  sorted.forEach(card => {
    let canPlay = false;
    if (isMyTurn) {
      if (!leadSuit) {
        canPlay = true;
      } else if (card.suit === leadSuit) {
        canPlay = true;
      } else {
        canPlay = !myHand.some(c => c.suit === leadSuit);
      }
    }
    const el = makeCard(card, canPlay);
    if (!canPlay && isMyTurn && leadSuit && card.suit !== leadSuit && myHand.some(c => c.suit === leadSuit)) {
      el.title = `Must follow ${leadSuit}`;
    }
    handEl.appendChild(el);
  });
}

let selectedCard = null;
function onCardClick(card, el) {
  if (el.classList.contains('unplayable')) return;

  if (selectedCard && selectedCard.el !== el) {
    selectedCard.el.classList.remove('selected');
  }

  if (selectedCard && selectedCard.el === el) {
    // Second click = play
    selectedCard = null;
    el.classList.remove('selected');
    emitPlayCard(card);
  } else {
    selectedCard = { card, el };
    el.classList.add('selected');
    setStatus('Click again to confirm playing ' + valStr(card.value) + ' ' + SUIT_SYM[card.suit]);
  }
}

function emitPlayCard(card) {
  myHand = myHand.filter(c => !(c.suit === card.suit && c.value === card.value));
  renderHand();
  socket.emit('play-card', { card });
}

// ===== RENDER TRICK =====
function relativePos() {
  return {
    across: (myPosition + 2) % 4,
    right: (myPosition + 1) % 4,
    left: (myPosition + 3) % 4,
  };
}

function renderTrick(trick) {
  const grid = document.getElementById('trick-grid');
  grid.innerHTML = '';

  const { across, right, left } = relativePos();
  const posToSlot = {};
  posToSlot[across] = 0;
  posToSlot[right] = 1;
  posToSlot[left] = 2;
  posToSlot[myPosition] = 3;

  const slots = [null, null, null, null];
  if (trick) {
    trick.forEach(({ playerPos, card }) => {
      const idx = posToSlot[playerPos];
      if (idx !== undefined) slots[idx] = card;
    });
  }

  // Slot order in 2x2 grid: top-left=across, top-right=right, bottom-left=left, bottom-right=me
  slots.forEach(card => {
    const slot = document.createElement('div');
    slot.className = 'trick-slot';
    if (card) slot.appendChild(makeTrickCard(card));
    grid.appendChild(slot);
  });
}

// ===== RENDER OTHER PLAYERS =====
function renderPlayers(players, handSizes) {
  if (!players || myPosition < 0) return;

  const { across, right, left } = relativePos();

  const placements = [
    { dir: 'top', pos: across },
    { dir: 'left', pos: left },
    { dir: 'right', pos: right },
  ];

  placements.forEach(({ dir, pos }) => {
    const p = players[pos];
    if (!p) return;

    const nameEl = document.getElementById('pname-' + dir);
    const backsEl = document.getElementById('pbacks-' + dir);
    const areaEl = document.getElementById('p-' + dir);

    const myTeam = myPosition % 2;
    const isPartner = (pos % 2) === myTeam;
    const isActive = gameState && gameState.currentPlayer === pos;

    nameEl.textContent = p.name + (isPartner ? ' ★' : '') + (p.isCPU ? ' 🤖' : '');
    nameEl.className = 'p-name' + (isActive ? ' active-turn' : '') + (isPartner ? ' partner' : '');

    const count = handSizes ? handSizes[pos] : 0;
    const vertical = (dir === 'left' || dir === 'right');
    backsEl.innerHTML = '';
    const show = Math.min(count, vertical ? 5 : 9);
    for (let i = 0; i < show; i++) backsEl.appendChild(makeCardBack(vertical));
  });

  // Bottom (me)
  const me = players[myPosition];
  if (me) {
    const nameEl = document.getElementById('pname-bottom');
    const isActive = gameState && gameState.currentPlayer === myPosition;
    nameEl.textContent = me.name + (me.isCPU ? ' 🤖' : '');
    nameEl.className = 'p-name' + (isActive ? ' active-turn' : '');
  }
}

// ===== UPDATE SCOREBOARD =====
function updateScores() {
  if (!gameState) return;

  document.getElementById('tricks-t1').textContent = gameState.tricks.team1;
  document.getElementById('tricks-t2').textContent = gameState.tricks.team2;
  document.getElementById('games-t1').textContent = gameState.gameScores.team1 + ' games';
  document.getElementById('games-t2').textContent = gameState.gameScores.team2 + ' games';

  document.getElementById('score-block-1').classList.toggle('winning', gameState.tricks.team1 > gameState.tricks.team2);
  document.getElementById('score-block-2').classList.toggle('winning', gameState.tricks.team2 > gameState.tricks.team1);

  const matchGame = `Match ${gameState.currentMatch}/${gameState.matchCount} · Game ${gameState.currentGame}/4`;
  document.getElementById('info-match-game').textContent = matchGame;

  if (gameState.trump) {
    const sym = SUIT_SYM[gameState.trump];
    const trumpEl = document.getElementById('info-trump');
    trumpEl.textContent = `Trump: ${sym} ${gameState.trump}`;
    trumpEl.className = `trump-info trump-${gameState.trump}`;
  } else {
    document.getElementById('info-trump').textContent = '';
  }
}

function setStatus(msg) {
  document.getElementById('status-bar').textContent = msg || ' ';
}

// ===== LOBBY RENDER =====
function renderLobby(players, matchCount) {
  const grid = document.getElementById('lobby-players');
  grid.innerHTML = '';

  const teamLabels = ['Team 1 (P1)', 'Team 2 (P2)', 'Team 1 (P3)', 'Team 2 (P4)'];

  for (let i = 0; i < 4; i++) {
    const slot = document.createElement('div');
    slot.className = 'player-slot ' + (i < players.length ? 'filled' : 'empty');

    if (i < players.length) {
      const p = players[i];
      slot.innerHTML = `
        <div class="slot-name">${p.name}${p.isCPU ? ' 🤖' : ''}</div>
        <div class="slot-team">${teamLabels[i]}</div>
        ${p.isHost ? '<div class="slot-badge">HOST</div>' : ''}
      `;
    } else {
      slot.innerHTML = `<div class="slot-name" style="color:#555">Waiting...</div><div class="slot-team">${teamLabels[i]}</div>`;
    }

    grid.appendChild(slot);
  }

  const actionsEl = document.getElementById('lobby-actions');
  if (isHost) {
    const canAdd = players.length < 4;
    const canRemoveCPU = players.length > 1 && players[players.length - 1].isCPU;
    const canStart = players.length === 4;

    actionsEl.innerHTML = `
      <button class="btn btn-outline" id="btn-add-cpu" ${canAdd ? '' : 'disabled'}>+ Add CPU</button>
      <button class="btn btn-ghost" id="btn-fill-cpus" ${canAdd ? '' : 'disabled'}>Fill with CPUs</button>
      <button class="btn btn-primary" id="btn-start" ${canStart ? '' : 'disabled'}>Start Game</button>
    `;

    document.getElementById('btn-add-cpu').addEventListener('click', () => socket.emit('add-cpu'));
    document.getElementById('btn-fill-cpus').addEventListener('click', () => {
      const needed = 4 - players.length;
      for (let i = 0; i < needed; i++) setTimeout(() => socket.emit('add-cpu'), i * 150);
    });
    document.getElementById('btn-start').addEventListener('click', () => socket.emit('start-game'));

    document.getElementById('lobby-hint').textContent = `Share the room code with friends, or fill with CPUs to test locally.`;
  } else {
    actionsEl.innerHTML = '';
    document.getElementById('lobby-hint').textContent = 'Waiting for the host to start the game...';
  }
}

// ===== SIDE ANNOUNCEMENT =====
function showSideAnnouncement(data) {
  pendingSideData = data;
  const listEl = document.getElementById('side-list');
  listEl.innerHTML = '';

  let anySide = false;
  data.sides.forEach((suits, pos) => {
    if (suits.length > 0) {
      anySide = true;
      const div = document.createElement('div');
      div.className = 'side-item';
      const syms = suits.map(s => SUIT_SYM[s]).join(' ');
      div.textContent = `${data.players[pos].name}: "I am side" for ${syms} (${suits.join(', ')})`;
      listEl.appendChild(div);
    }
  });

  if (!anySide) {
    listEl.innerHTML = '<p class="no-sides">All players have cards from every suit.</p>';
  }

  const chooserName = data.players[data.trumpChooser].name;
  document.getElementById('trump-chooser-info').textContent =
    data.trumpChooser === myPosition
      ? 'You will choose the trump suit after seeing your cards!'
      : `${chooserName} will choose the trump suit.`;

  openModal('overlay-sides');
}

// Shows the inline trump banner so the player can see their hand while selecting
function showTrumpBanner(data) {
  const banner = document.getElementById('trump-banner');
  const msg = document.getElementById('trump-banner-msg');
  const suits = document.getElementById('trump-banner-suits');
  const isMyTurn = data.trumpChooser === myPosition;

  if (isMyTurn) {
    msg.textContent = 'Select the trump suit:';
    suits.style.display = 'flex';
  } else {
    const chooserName = data.players[data.trumpChooser].name;
    msg.textContent = `Waiting for ${chooserName} to select trump...`;
    suits.style.display = 'none';
  }

  banner.style.display = 'block';
}

// ===== SOCKET EVENTS =====

socket.on('room-created', ({ code, position }) => {
  myPosition = position;
  isHost = true;
  document.getElementById('display-code').textContent = code;
  closeModal('modal-host');
  showScreen('screen-lobby');
});

socket.on('room-joined', ({ code, position }) => {
  myPosition = position;
  isHost = false;
  document.getElementById('display-code').textContent = code;
  closeModal('modal-join');
  showScreen('screen-lobby');
});

socket.on('lobby-update', ({ players, matchCount }) => {
  renderLobby(players, matchCount);
});

socket.on('join-error', ({ msg }) => {
  document.getElementById('join-error').textContent = msg;
});

socket.on('game-error', ({ msg }) => {
  alert(msg);
});

socket.on('side-announcement', (data) => {
  showScreen('screen-game');
  renderTrick([]);
  document.getElementById('info-trump').textContent = '';
  document.getElementById('tricks-t1').textContent = '0';
  document.getElementById('tricks-t2').textContent = '0';
  document.getElementById('games-t1').textContent = data.currentGame > 1 ? (gameState ? gameState.gameScores.team1 : 0) + ' games' : '0 games';
  document.getElementById('games-t2').textContent = data.currentGame > 1 ? (gameState ? gameState.gameScores.team2 : 0) + ' games' : '0 games';
  document.getElementById('info-match-game').textContent = `Match ${data.currentMatch}/${data.matchCount} · Game ${data.currentGame}/4`;
  document.getElementById('my-hand').innerHTML = '';
  document.getElementById('btn-last-trick').style.display = 'none';
  setStatus('Cards dealt! Check the announcements.');
  showSideAnnouncement(data);
});

socket.on('trump-selected', ({ suit, chooserName, currentPlayer }) => {
  // Hide trump banner and any lingering side overlay
  document.getElementById('trump-banner').style.display = 'none';
  closeModal('overlay-sides');

  if (gameState) {
    gameState.trump = suit;
    gameState.currentPlayer = currentPlayer;
    gameState.phase = 'playing';
  }

  const sym = SUIT_SYM[suit];
  const trumpEl = document.getElementById('info-trump');
  trumpEl.textContent = `Trump: ${sym} ${suit}`;
  trumpEl.className = `trump-info trump-${suit}`;

  const who = currentPlayer === myPosition ? 'Your' : `${gameState ? gameState.players[currentPlayer]?.name : '?'}'s`;
  setStatus(`${chooserName} chose ${sym} ${suit} as trump. ${who} turn to lead!`);
  renderHand(); // re-render now that phase is 'playing'
});

socket.on('game-state', (state) => {
  gameState = state;
  myHand = state.hand;

  renderHand();
  renderTrick(state.currentTrick);
  renderPlayers(state.players, state.players.map(p => p.cardCount));
  updateScores();

  const lastBtn = document.getElementById('btn-last-trick');
  lastBtn.style.display = (state.lastTrick && state.lastTrick.length > 0) ? 'inline-block' : 'none';

  if (state.phase === 'playing') {
    if (state.currentPlayer === myPosition) {
      const msg = state.leadSuit
        ? `Your turn! Lead suit: ${SUIT_SYM[state.leadSuit]} ${state.leadSuit}`
        : 'Your turn to lead!';
      setStatus(msg);
    } else {
      const name = state.players[state.currentPlayer]?.name || '?';
      setStatus(`Waiting for ${name}...`);
    }
  }
});

socket.on('card-played', ({ playerPos, card, currentTrick, handSizes }) => {
  renderTrick(currentTrick);
  if (gameState) {
    gameState.currentTrick = currentTrick;
    gameState.players[playerPos].cardCount = handSizes[playerPos];
    // Advance currentPlayer indicator immediately (next in clockwise order within trick)
    if (currentTrick.length < 4) {
      gameState.currentPlayer = (playerPos + 1) % 4;
    }
    renderPlayers(gameState.players, handSizes);
    renderHand(); // update playable state for the next player
  }
  selectedCard = null;
});

socket.on('trick-resolved', ({ winnerPos, winnerName, tricks, lastTrick }) => {
  if (gameState) {
    gameState.tricks = tricks;
    gameState.lastTrick = lastTrick;
    // Immediately update currentPlayer so the winner's hand renders as playable
    // before the follow-up game-state event arrives.
    gameState.currentPlayer = winnerPos;
    gameState.leadSuit = null;
  }

  updateScores();
  document.getElementById('btn-last-trick').style.display = 'inline-block';

  const team = winnerPos % 2 === 0 ? 1 : 2;
  setStatus(`${winnerName} wins the trick! (Team ${team}: ${tricks['team' + team]} tricks)`);

  // Update player indicators so winner is shown as active immediately
  if (gameState) renderPlayers(gameState.players, gameState.players.map(p => p.cardCount));

  setTimeout(() => {
    renderTrick([]);
    renderHand(); // now show winner's cards as playable
  }, 900);
});

socket.on('game-over', ({ tricks, winner, gameScores, currentGame, isLastGame }) => {
  const title = document.getElementById('go-title');
  title.textContent = `Game ${currentGame} Complete!`;

  const t1w = winner === 1 ? ' ★' : '';
  const t2w = winner === 2 ? ' ★' : '';

  document.getElementById('go-body').innerHTML = `
    <div class="score-table" style="margin: 0 auto; width: fit-content;">
      <div class="sh">Team</div><div class="sh">Tricks</div><div class="sh">Games Won</div>
      <div${winner===1?' class="sw"':''}>Team 1${t1w}</div><div>${tricks.team1}</div><div>${gameScores.team1}</div>
      <div${winner===2?' class="sw"':''}>Team 2${t2w}</div><div>${tricks.team2}</div><div>${gameScores.team2}</div>
    </div>
    <p style="margin-top:16px; font-size:1.1rem; color:#ffd700">Team ${winner} wins Game ${currentGame}!</p>
    ${isLastGame ? '<p style="color:#888; margin-top:8px">Calculating match result...</p>' : ''}
  `;

  const actionsEl = document.getElementById('go-actions');
  actionsEl.innerHTML = '';

  if (!isLastGame && isHost) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = `Start Game ${currentGame + 1}`;
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Starting...';
      socket.emit('next-game');
    });
    actionsEl.appendChild(btn);
  } else if (!isLastGame && !isHost) {
    actionsEl.innerHTML = '<p style="color:#888">Waiting for host to start next game...</p>';
  }

  showScreen('screen-game-over');
});

socket.on('match-over', ({ gameScores, matchScores, winner, currentMatch, matchCount, isLastMatch }) => {
  document.getElementById('mo-title').textContent = `Match ${currentMatch} Complete!`;

  const t1w = winner === 1 ? ' ★' : '';
  const t2w = winner === 2 ? ' ★' : '';
  const winnerMsg = winner === 0 ? "It's a draw!" : `Team ${winner} wins Match ${currentMatch}!`;

  document.getElementById('mo-body').innerHTML = `
    <div class="score-table" style="margin: 0 auto; width: fit-content;">
      <div class="sh">Team</div><div class="sh">Games</div><div class="sh">Matches</div>
      <div${winner===1?' class="sw"':''}>Team 1${t1w}</div><div>${gameScores.team1}</div><div>${matchScores.team1}</div>
      <div${winner===2?' class="sw"':''}>Team 2${t2w}</div><div>${gameScores.team2}</div><div>${matchScores.team2}</div>
    </div>
    <p style="margin-top:16px; font-size:1.1rem; color:#ffd700">${winnerMsg}</p>
    ${isLastMatch ? '<p style="color:#888; margin-top:8px">Calculating final results...</p>' : ''}
  `;

  const actionsEl = document.getElementById('mo-actions');
  actionsEl.innerHTML = '';

  if (!isLastMatch && isHost) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = `Start Match ${currentMatch + 1}`;
    btn.addEventListener('click', () => {
      btn.disabled = true;
      socket.emit('next-match');
    });
    actionsEl.appendChild(btn);
  } else if (!isLastMatch && !isHost) {
    actionsEl.innerHTML = '<p style="color:#888">Waiting for host to start next match...</p>';
  }

  showScreen('screen-match-over');
});

socket.on('session-over', ({ matchScores, winner }) => {
  document.getElementById('so-title').textContent = `Team ${winner} Wins! 🏆`;

  document.getElementById('so-body').innerHTML = `
    <div class="score-table" style="margin: 0 auto; width: fit-content;">
      <div class="sh">Team</div><div class="sh">Matches Won</div>
      <div${winner===1?' class="sw"':''}>Team 1${winner===1?' ★':''}</div><div>${matchScores.team1}</div>
      <div${winner===2?' class="sw"':''}>Team 2${winner===2?' ★':''}</div><div>${matchScores.team2}</div>
    </div>
  `;

  const actionsEl = document.getElementById('so-actions');
  actionsEl.innerHTML = '';

  if (isHost) {
    const playAgain = document.createElement('button');
    playAgain.className = 'btn btn-primary';
    playAgain.textContent = 'Play Again';
    playAgain.addEventListener('click', () => socket.emit('return-to-lobby'));
    actionsEl.appendChild(playAgain);
  }

  const exitBtn = document.createElement('button');
  exitBtn.className = 'btn btn-outline';
  exitBtn.textContent = 'Exit to Menu';
  exitBtn.addEventListener('click', () => location.reload());
  actionsEl.appendChild(exitBtn);

  showScreen('screen-session-over');
});

socket.on('reset-to-lobby', () => {
  gameState = null;
  myHand = [];
  document.getElementById('trump-banner').style.display = 'none';
  document.getElementById('your-turn-flash').style.display = 'none';
  showScreen('screen-lobby');
});

socket.on('player-disconnected', ({ playerName, position }) => {
  setStatus(`${playerName} disconnected.`);
});

// ===== TRUMP ACK / SELECT =====
document.getElementById('btn-ack-sides').addEventListener('click', () => {
  closeModal('overlay-sides');
  // Show the trump banner inline (player can now see their hand while selecting)
  if (pendingSideData) showTrumpBanner(pendingSideData);
});

// Trump suit buttons in the inline banner
document.querySelectorAll('.tsb').forEach(btn => {
  btn.addEventListener('click', () => {
    const suit = btn.dataset.suit;
    socket.emit('select-trump', { suit });
    document.getElementById('trump-banner').style.display = 'none';
  });
});

// ===== LAST TRICK =====
document.getElementById('btn-last-trick').addEventListener('click', () => {
  if (!gameState || !gameState.lastTrick) return;
  const display = document.getElementById('last-trick-display');
  display.innerHTML = '';

  gameState.lastTrick.forEach(({ playerPos, card }) => {
    const item = document.createElement('div');
    item.className = 'last-trick-item';
    const cardEl = makeCard(card, false);
    cardEl.classList.remove('unplayable');
    cardEl.style.cursor = 'default';
    const label = document.createElement('div');
    label.className = 'lt-name';
    label.textContent = gameState.players[playerPos]?.name || `P${playerPos + 1}`;
    item.appendChild(cardEl);
    item.appendChild(label);
    display.appendChild(item);
  });

  openModal('modal-last-trick');
});

// ===== RULES BUTTON =====
document.getElementById('btn-rules').addEventListener('click', () => openModal('modal-rules'));

// ===== LANDING PAGE =====
document.getElementById('btn-open-host').addEventListener('click', () => {
  document.getElementById('host-name').value = '';
  openModal('modal-host');
  setTimeout(() => document.getElementById('host-name').focus(), 50);
});

document.getElementById('btn-open-join').addEventListener('click', () => {
  document.getElementById('join-name').value = '';
  document.getElementById('join-code').value = '';
  document.getElementById('join-error').textContent = '';
  openModal('modal-join');
  setTimeout(() => document.getElementById('join-name').focus(), 50);
});

document.getElementById('btn-create-room').addEventListener('click', () => {
  const name = document.getElementById('host-name').value.trim();
  if (!name) { document.getElementById('host-name').focus(); return; }
  const matchCount = parseInt(document.getElementById('match-count').value);
  socket.emit('create-room', { playerName: name, matchCount });
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim();
  document.getElementById('join-error').textContent = '';
  if (!name) { document.getElementById('join-name').focus(); return; }
  if (!code || code.length !== 6) {
    document.getElementById('join-error').textContent = 'Please enter a valid 6-digit code.';
    return;
  }
  socket.emit('join-room', { playerName: name, roomCode: code });
});

// Enter key support
document.getElementById('host-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-create-room').click(); });
document.getElementById('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-join-room').click(); });
document.getElementById('join-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('join-code').focus(); });

// Close modals on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) {
      // Only close dismissible modals (not trump/sides overlays)
      const id = backdrop.id;
      if (id === 'modal-host' || id === 'modal-join' || id === 'modal-rules' || id === 'modal-last-trick') {
        closeModal(id);
      }
    }
  });
});
