(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const statsEl = document.getElementById('stats');
  const logEl = document.getElementById('log');
  const dialogueEl = document.getElementById('dialogue');
  const dialogueTextEl = document.getElementById('dialogueText');
  const choicesEl = document.getElementById('choices');
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  const newGameBtn = document.getElementById('newGameBtn');

  const TILE = 32;
  const SAVE_KEY = 'rune-grove-rpg-save-v1';

  // Tile key:
  // . = path, g = tall grass, t = tree, w = water, s = stone, h = house, p = portal
  const map = [
    'ttttttttttttttttttttttttt',
    't.......gggg......s....pt',
    't..hhh..gggg..tt.....tt.t',
    't..hhh........tt.....tt.t',
    't........wwww...........t',
    't..ggg...wwww....gggg...t',
    't..ggg...........gggg...t',
    't..........sssss........t',
    't...tt.....s...s..tt....t',
    't...tt.....s...s..tt....t',
    't..gggg............ggg..t',
    't..gggg..ttt.......ggg..t',
    't........ttt...hhh......t',
    't..............hhh......t',
    'ttttttttttttttttttttttttt',
  ];

  const tileInfo = {
    '.': { name: 'path', walkable: true },
    'g': { name: 'tall grass', walkable: true, encounter: true },
    't': { name: 'tree', walkable: false },
    'w': { name: 'water', walkable: false },
    's': { name: 'stone', walkable: true },
    'h': { name: 'house', walkable: false },
    'p': { name: 'portal', walkable: true },
  };

  const npcs = [
    {
      id: 'healer', x: 6, y: 3, emoji: '🧙', name: 'Grove Healer',
      talk: () => showDialogue('Grove Healer: Rest here and I will restore your HP and energy.', [
        { label: 'Heal for free', onClick: () => { player.hp = player.maxHp; player.energy = player.maxEnergy; log('You feel refreshed.'); closeDialogue(); updateStats(); } },
        { label: 'Bye', onClick: closeDialogue },
      ])
    },
    {
      id: 'merchant', x: 18, y: 12, emoji: '🧺', name: 'Potion Merchant',
      talk: () => showDialogue('Potion Merchant: A potion costs 5 coins. It restores 15 HP in battle.', [
        { label: 'Buy potion', onClick: () => {
          if (player.coins >= 5) {
            player.coins -= 5;
            player.potions += 1;
            log('Bought 1 potion.');
          } else {
            log('Not enough coins.');
          }
          updateStats();
        }},
        { label: 'Bye', onClick: closeDialogue },
      ])
    },
    {
      id: 'guardian', x: 20, y: 2, emoji: '🛡️', name: 'Portal Guardian',
      talk: () => showDialogue('Portal Guardian: The portal opens for brave heroes. Reach Level 3, then step into the glow.', [
        { label: 'Got it', onClick: closeDialogue },
      ])
    }
  ];

  const enemyTypes = [
    { name: 'Mossling', emoji: '🌿', hp: 18, attack: 4, xp: 8, coins: 3 },
    { name: 'Pebble Pup', emoji: '🐾', hp: 22, attack: 5, xp: 10, coins: 4 },
    { name: 'Shadow Beetle', emoji: '🪲', hp: 26, attack: 6, xp: 12, coins: 5 },
  ];

  const defaultPlayer = () => ({
    x: 2,
    y: 2,
    level: 1,
    hp: 30,
    maxHp: 30,
    energy: 12,
    maxEnergy: 12,
    xp: 0,
    xpToNext: 20,
    coins: 0,
    potions: 2,
    facing: 'down',
    wins: 0,
  });

  let player = defaultPlayer();
  let gameMode = 'world'; // world, dialogue, battle, win
  let battle = null;
  let messageTimer = 0;

  const keys = new Set();
  let moveCooldown = 0;

  function log(message) {
    const p = document.createElement('p');
    p.textContent = message;
    logEl.prepend(p);
    while (logEl.children.length > 12) logEl.removeChild(logEl.lastChild);
  }

  function updateStats() {
    statsEl.innerHTML = `
      <div class="stat-line"><span>Level</span><span>${player.level}</span></div>
      <div class="stat-line"><span class="hp">HP</span><span>${player.hp}/${player.maxHp}</span></div>
      <div class="stat-line"><span class="energy">Energy</span><span>${player.energy}/${player.maxEnergy}</span></div>
      <div class="stat-line"><span class="xp">XP</span><span>${player.xp}/${player.xpToNext}</span></div>
      <div class="stat-line"><span class="coins">Coins</span><span>${player.coins}</span></div>
      <div class="stat-line"><span>Potions</span><span>${player.potions}</span></div>
      <div class="stat-line"><span>Battles won</span><span>${player.wins}</span></div>
    `;
  }

  function getTile(x, y) {
    if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return 't';
    return map[y][x];
  }

  function isWalkable(x, y) {
    const npcHere = npcs.some(npc => npc.x === x && npc.y === y);
    return tileInfo[getTile(x, y)].walkable && !npcHere;
  }

  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawTile(tile, x, y) {
    const px = x * TILE;
    const py = y * TILE;
    if (tile === '.') {
      ctx.fillStyle = '#b89968';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(px + 3, py + 7, 4, 4);
      ctx.fillRect(px + 20, py + 21, 5, 3);
    }
    if (tile === 'g') {
      ctx.fillStyle = '#4c9f62';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#3b7e4f';
      for (let i = 0; i < 5; i++) {
        const gx = px + 4 + i * 6;
        ctx.fillRect(gx, py + 15 - (i % 2) * 4, 3, 12);
      }
    }
    if (tile === 't') {
      ctx.fillStyle = '#2f7d46';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#206139';
      ctx.beginPath();
      ctx.arc(px + 16, py + 15, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6f4b2d';
      ctx.fillRect(px + 13, py + 18, 6, 12);
    }
    if (tile === 'w') {
      ctx.fillStyle = '#2d7dbd';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(px + 4, py + 10, 18, 3);
      ctx.fillRect(px + 12, py + 22, 14, 3);
    }
    if (tile === 's') {
      ctx.fillStyle = '#8c929c';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.strokeRect(px + 3, py + 5, 26, 20);
    }
    if (tile === 'h') {
      ctx.fillStyle = '#a56a43';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#7f3434';
      ctx.beginPath();
      ctx.moveTo(px + 2, py + 14);
      ctx.lineTo(px + 16, py + 3);
      ctx.lineTo(px + 30, py + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#442b1f';
      ctx.fillRect(px + 13, py + 18, 7, 12);
    }
    if (tile === 'p') {
      ctx.fillStyle = '#314468';
      ctx.fillRect(px, py, TILE, TILE);
      const pulse = 0.5 + Math.sin(Date.now() / 180) * 0.2;
      ctx.fillStyle = `rgba(160, 230, 255, ${pulse})`;
      ctx.beginPath();
      ctx.ellipse(px + 16, py + 16, 9, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d2f7ff';
      ctx.stroke();
    }
  }

  function drawWorld() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        drawTile(map[y][x], x, y);
      }
    }

    // NPCs
    ctx.font = '24px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    npcs.forEach(npc => {
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(npc.x * TILE + 16, npc.y * TILE + 26, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(npc.emoji, npc.x * TILE + 16, npc.y * TILE + 15);
    });

    // Player
    const px = player.x * TILE;
    const py = player.y * TILE;
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 27, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5bbcff';
    ctx.beginPath();
    ctx.arc(px + 16, py + 12, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3455d1';
    ctx.fillRect(px + 8, py + 19, 16, 9);
    ctx.fillStyle = '#f5f7fb';
    if (player.facing === 'left') ctx.fillRect(px + 10, py + 10, 3, 3);
    else if (player.facing === 'right') ctx.fillRect(px + 19, py + 10, 3, 3);
    else {
      ctx.fillRect(px + 12, py + 10, 3, 3);
      ctx.fillRect(px + 18, py + 10, 3, 3);
    }

    // Top message
    ctx.fillStyle = 'rgba(10,14,22,.7)';
    drawRoundedRect(10, 10, 430, 38, 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('Explore the Grove. Press E near characters. Grass can start battles.', 24, 34);

    if (gameMode === 'win') {
      ctx.fillStyle = 'rgba(0,0,0,.68)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f5f7fb';
      ctx.textAlign = 'center';
      ctx.font = '44px system-ui';
      ctx.fillText('You opened the Rune Portal!', canvas.width / 2, 205);
      ctx.font = '20px system-ui';
      ctx.fillText('You can keep expanding this into a full RPG world.', canvas.width / 2, 245);
    }
  }

  function makeEnemy() {
    const base = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
    const scale = player.level - 1;
    return {
      ...base,
      hp: base.hp + scale * 6,
      maxHp: base.hp + scale * 6,
      attack: base.attack + scale * 2,
      xp: base.xp + scale * 5,
      coins: base.coins + scale * 2,
    };
  }

  function startBattle(reason = 'A wild creature appears!') {
    gameMode = 'battle';
    battle = {
      enemy: makeEnemy(),
      defending: false,
      turn: 'player',
    };
    showBattle(`${reason} ${battle.enemy.emoji} ${battle.enemy.name} wants to battle!`);
  }

  function showBattle(text) {
    const enemy = battle.enemy;
    showDialogue(`${text}\n\nEnemy HP: ${enemy.hp}/${enemy.maxHp}`, [
      { label: 'Strike', onClick: () => playerAttack('strike') },
      { label: 'Spark -3 energy', onClick: () => playerAttack('spark'), disabled: player.energy < 3 },
      { label: `Potion (${player.potions})`, onClick: usePotion, disabled: player.potions <= 0 || player.hp >= player.maxHp },
      { label: 'Defend', onClick: defend },
      { label: 'Run', onClick: tryRun },
    ]);
  }

  function playerAttack(type) {
    if (gameMode !== 'battle') return;
    let damage;
    if (type === 'spark') {
      if (player.energy < 3) return;
      player.energy -= 3;
      damage = rand(9, 14) + player.level * 2;
      log(`You cast Spark for ${damage} damage.`);
    } else {
      damage = rand(5, 9) + player.level;
      log(`You strike for ${damage} damage.`);
    }
    battle.enemy.hp = Math.max(0, battle.enemy.hp - damage);
    if (battle.enemy.hp <= 0) return winBattle();
    enemyTurn();
  }

  function defend() {
    battle.defending = true;
    log('You brace for the next hit.');
    enemyTurn();
  }

  function usePotion() {
    if (player.potions <= 0 || player.hp >= player.maxHp) return;
    player.potions -= 1;
    const healed = Math.min(15, player.maxHp - player.hp);
    player.hp += healed;
    log(`You used a potion and healed ${healed} HP.`);
    updateStats();
    enemyTurn();
  }

  function tryRun() {
    if (Math.random() < 0.55) {
      log('You escaped safely.');
      battle = null;
      closeDialogue();
      gameMode = 'world';
    } else {
      log('Could not escape!');
      enemyTurn();
    }
  }

  function enemyTurn() {
    const enemy = battle.enemy;
    let damage = rand(enemy.attack - 1, enemy.attack + 2);
    if (battle.defending) {
      damage = Math.ceil(damage / 2);
      battle.defending = false;
    }
    player.hp = Math.max(0, player.hp - damage);
    log(`${enemy.name} hits you for ${damage} damage.`);
    updateStats();

    if (player.hp <= 0) {
      player.hp = Math.ceil(player.maxHp * 0.6);
      player.energy = Math.ceil(player.maxEnergy * 0.6);
      player.x = 2;
      player.y = 2;
      battle = null;
      log('You fainted and woke up near the path.');
      closeDialogue();
      gameMode = 'world';
      updateStats();
      return;
    }
    showBattle('Your turn. Choose an action.');
  }

  function winBattle() {
    const enemy = battle.enemy;
    player.xp += enemy.xp;
    player.coins += enemy.coins;
    player.wins += 1;
    player.energy = Math.min(player.maxEnergy, player.energy + 2);
    log(`You won! +${enemy.xp} XP, +${enemy.coins} coins.`);
    battle = null;
    checkLevelUp();
    updateStats();
    showDialogue('Battle won! You can keep exploring.', [
      { label: 'Continue', onClick: () => { closeDialogue(); gameMode = 'world'; } },
    ]);
  }

  function checkLevelUp() {
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      player.level += 1;
      player.xpToNext += 15;
      player.maxHp += 8;
      player.maxEnergy += 3;
      player.hp = player.maxHp;
      player.energy = player.maxEnergy;
      log(`Level up! You are now Level ${player.level}.`);
    }
  }

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function showDialogue(text, choices) {
    gameMode = gameMode === 'battle' ? 'battle' : 'dialogue';
    dialogueEl.classList.remove('hidden');
    dialogueTextEl.textContent = text;
    choicesEl.innerHTML = '';
    choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.textContent = choice.label;
      btn.disabled = !!choice.disabled;
      btn.addEventListener('click', choice.onClick);
      choicesEl.appendChild(btn);
    });
  }

  function closeDialogue() {
    dialogueEl.classList.add('hidden');
    choicesEl.innerHTML = '';
    if (gameMode !== 'battle' && gameMode !== 'win') gameMode = 'world';
  }

  function adjacentNpc() {
    const offsets = [
      { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }
    ];
    for (const o of offsets) {
      const found = npcs.find(npc => npc.x === player.x + o.x && npc.y === player.y + o.y);
      if (found) return found;
    }
    return null;
  }

  function interact() {
    if (gameMode !== 'world') return;
    const npc = adjacentNpc();
    if (npc) {
      npc.talk();
      return;
    }
    const tile = getTile(player.x, player.y);
    if (tile === 'p') {
      if (player.level >= 3) {
        gameMode = 'win';
        closeDialogue();
        log('The portal opens!');
      } else {
        showDialogue('The portal hums quietly. It needs a stronger hero. Come back at Level 3.', [
          { label: 'Continue', onClick: closeDialogue },
        ]);
      }
      return;
    }
    log('Nothing to interact with here.');
  }

  function move(dx, dy, facing) {
    if (gameMode !== 'world') return;
    player.facing = facing;
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (!isWalkable(nx, ny)) {
      log('Blocked. Try another path.');
      return;
    }
    player.x = nx;
    player.y = ny;
    const tile = getTile(player.x, player.y);
    if (tileInfo[tile].encounter && Math.random() < 0.18) {
      startBattle('The tall grass rustles!');
    }
    if (tile === 'p') interact();
  }

  function saveGame() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(player));
    log('Game saved in this browser.');
  }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      log('No saved game found.');
      return;
    }
    try {
      player = { ...defaultPlayer(), ...JSON.parse(raw) };
      gameMode = 'world';
      battle = null;
      closeDialogue();
      updateStats();
      log('Game loaded.');
    } catch {
      log('Save file could not be read.');
    }
  }

  function newGame() {
    player = defaultPlayer();
    battle = null;
    gameMode = 'world';
    closeDialogue();
    localStorage.removeItem(SAVE_KEY);
    logEl.innerHTML = '';
    log('New game started.');
    updateStats();
  }

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'e'].includes(key)) {
      e.preventDefault();
    }
    if (key === 'e' || key === ' ') interact();
    keys.add(key);
  });

  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  saveBtn.addEventListener('click', saveGame);
  loadBtn.addEventListener('click', loadGame);
  newGameBtn.addEventListener('click', newGame);

  function gameLoop(timestamp) {
    if (moveCooldown > 0) moveCooldown -= 1;
    if (gameMode === 'world' && moveCooldown <= 0) {
      if (keys.has('arrowup') || keys.has('w')) { move(0, -1, 'up'); moveCooldown = 9; }
      else if (keys.has('arrowdown') || keys.has('s')) { move(0, 1, 'down'); moveCooldown = 9; }
      else if (keys.has('arrowleft') || keys.has('a')) { move(-1, 0, 'left'); moveCooldown = 9; }
      else if (keys.has('arrowright') || keys.has('d')) { move(1, 0, 'right'); moveCooldown = 9; }
    }
    drawWorld();
    requestAnimationFrame(gameLoop);
  }

  updateStats();
  log('Welcome! Walk through grass to find battles. Talk to the healer or merchant.');
  requestAnimationFrame(gameLoop);
})();
