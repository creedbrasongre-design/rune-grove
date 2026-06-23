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
  const PLAYER_SPEED = 118;
  const SAVE_KEY = 'rune-grove-rpg-save-v3-smooth';
  const PLAYER_DRAW_W = 58;
  const PLAYER_DRAW_H = 58;
  const PLAYER_DRAW_OFF_X = -12;
  const PLAYER_DRAW_OFF_Y = -14;
  const PLAYER_HITBOX = { x: 10, y: 22, w: 12, h: 8 };

  const imagePaths = {
    village: 'assets/village_scene.png',
    player: {
      up: ['assets/player_back_0.png', 'assets/player_back_1.png', 'assets/player_back_2.png', 'assets/player_back_3.png'],
      down: ['assets/player_front_0.png', 'assets/player_front_1.png', 'assets/player_front_2.png', 'assets/player_front_3.png'],
      left: ['assets/player_left_0.png', 'assets/player_left_1.png', 'assets/player_left_2.png', 'assets/player_left_3.png'],
      right: ['assets/player_right_0.png', 'assets/player_right_1.png', 'assets/player_right_2.png', 'assets/player_right_3.png'],
    },
    npc: {
      healer: 'assets/npc_healer.png',
      merchant: 'assets/npc_merchant.png',
      guardian: 'assets/npc_guardian.png',
    },
    enemy: {
      mossling: 'assets/enemy_mossling.png',
      pebble_pup: 'assets/enemy_pebble_pup.png',
      shadow_beetle: 'assets/enemy_shadow_beetle.png',
    },
  };

  const images = {};

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
      id: 'healer', x: 6, y: 3, sprite: 'healer', name: 'Grove Healer',
      talk: () => showDialogue('Grove Healer: Rest here and I will restore your HP and energy.', [
        {
          label: 'Heal for free', onClick: () => {
            player.hp = player.maxHp;
            player.energy = player.maxEnergy;
            log('You feel refreshed.');
            closeDialogue();
            updateStats();
          }
        },
        { label: 'Bye', onClick: closeDialogue },
      ])
    },
    {
      id: 'merchant', x: 18, y: 12, sprite: 'merchant', name: 'Potion Merchant',
      talk: () => showDialogue('Potion Merchant: A potion costs 5 coins. It restores 15 HP in battle.', [
        {
          label: 'Buy potion', onClick: () => {
            if (player.coins >= 5) {
              player.coins -= 5;
              player.potions += 1;
              log('Bought 1 potion.');
            } else {
              log('Not enough coins.');
            }
            updateStats();
          }
        },
        { label: 'Bye', onClick: closeDialogue },
      ])
    },
    {
      id: 'guardian', x: 20, y: 2, sprite: 'guardian', name: 'Portal Guardian',
      talk: () => showDialogue('Portal Guardian: The portal opens for brave heroes. Reach Level 3, then step into the glow.', [
        { label: 'Got it', onClick: closeDialogue },
      ])
    }
  ];

  const enemyTypes = [
    { name: 'Mossling', sprite: 'mossling', hp: 18, attack: 4, xp: 8, coins: 3 },
    { name: 'Pebble Pup', sprite: 'pebble_pup', hp: 22, attack: 5, xp: 10, coins: 4 },
    { name: 'Shadow Beetle', sprite: 'shadow_beetle', hp: 26, attack: 6, xp: 12, coins: 5 },
  ];

  function defaultPlayer() {
    return {
      x: 2 * TILE,
      y: 2 * TILE,
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
      animFrame: 0,
      animClock: 0,
      encounterDistance: 0,
    };
  }

  let player = defaultPlayer();
  let gameMode = 'world';
  let battle = null;
  const keys = new Set();
  let loaded = false;
  let lastTime = 0;

  const portalTile = (() => {
    for (let y = 0; y < map.length; y++) {
      const x = map[y].indexOf('p');
      if (x !== -1) return { x, y };
    }
    return { x: 23, y: 1 };
  })();

  function log(message) {
    const p = document.createElement('p');
    p.textContent = message;
    logEl.prepend(p);
    while (logEl.children.length > 14) logEl.removeChild(logEl.lastChild);
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

  function getTile(tx, ty) {
    if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return 't';
    return map[ty][tx];
  }

  function playerFootCenter(px = player.x, py = player.y) {
    return {
      x: px + PLAYER_HITBOX.x + PLAYER_HITBOX.w / 2,
      y: py + PLAYER_HITBOX.y + PLAYER_HITBOX.h / 2,
    };
  }

  function tileAtPixel(px, py) {
    return getTile(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  function playerTileUnderfoot(px = player.x, py = player.y) {
    const foot = playerFootCenter(px, py);
    return tileAtPixel(foot.x, foot.y);
  }

  function rectsIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function playerRect(px = player.x, py = player.y) {
    return {
      x: px + PLAYER_HITBOX.x,
      y: py + PLAYER_HITBOX.y,
      w: PLAYER_HITBOX.w,
      h: PLAYER_HITBOX.h,
    };
  }

  function npcRect(npc) {
    return {
      x: npc.x * TILE + 8,
      y: npc.y * TILE + 18,
      w: 16,
      h: 10,
    };
  }

  function isAreaWalkable(nextX, nextY) {
    const rect = playerRect(nextX, nextY);
    const samplePoints = [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x, rect.y + rect.h],
      [rect.x + rect.w, rect.y + rect.h],
      [rect.x + rect.w / 2, rect.y + rect.h / 2],
    ];

    for (const [sx, sy] of samplePoints) {
      const tile = tileAtPixel(sx, sy);
      if (!tileInfo[tile].walkable) return false;
    }

    for (const npc of npcs) {
      if (rectsIntersect(rect, npcRect(npc))) return false;
    }

    return true;
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

  function loadAllImages() {
    const jobs = [];
    const store = (key, path) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { images[key] = img; resolve(); };
      img.onerror = () => { console.warn('Failed to load', path); resolve(); };
      img.src = path;
    });

    jobs.push(store('village', imagePaths.village));
    Object.entries(imagePaths.player).forEach(([dir, arr]) => arr.forEach((path, i) => jobs.push(store(`player_${dir}_${i}`, path))));
    Object.entries(imagePaths.npc).forEach(([key, path]) => jobs.push(store(`npc_${key}`, path)));
    Object.entries(imagePaths.enemy).forEach(([key, path]) => jobs.push(store(`enemy_${key}`, path)));
    return Promise.all(jobs).then(() => { loaded = true; });
  }

  function drawImageFit(img, x, y, w, h) {
    if (!img) return;
    const scale = Math.min(w / img.width, h / img.height);
    const nw = img.width * scale;
    const nh = img.height * scale;
    ctx.drawImage(img, x + (w - nw) / 2, y + (h - nh) / 2, nw, nh);
  }

  function drawWorldBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (images.village) {
      ctx.drawImage(images.village, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#7bb169';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawPortal() {
    const px = portalTile.x * TILE;
    const py = portalTile.y * TILE;
    const pulse = 0.55 + Math.sin(Date.now() / 180) * 0.2;
    ctx.save();
    ctx.fillStyle = `rgba(163, 234, 255, ${pulse})`;
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 15, 13, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(228, 252, 255, .9)';
    ctx.stroke();
    ctx.restore();
  }

  function drawNpc(npc) {
    const img = images[`npc_${npc.sprite}`];
    const px = npc.x * TILE;
    const py = npc.y * TILE;
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 28, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawImageFit(img, px - 12, py - 12, 56, 56);
  }

  function currentPlayerImage() {
    const dir = player.facing === 'up' ? 'up' : player.facing === 'left' ? 'left' : player.facing === 'right' ? 'right' : 'down';
    return images[`player_${dir}_${player.animFrame}`] || images[`player_${dir}_0`];
  }

  function drawPlayer() {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(player.x + 16, player.y + 28, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawImageFit(currentPlayerImage(), player.x + PLAYER_DRAW_OFF_X, player.y + PLAYER_DRAW_OFF_Y, PLAYER_DRAW_W, PLAYER_DRAW_H);
  }

  function drawWorld() {
    drawWorldBackground();
    drawPortal();
    npcs.forEach(drawNpc);
    drawPlayer();

    ctx.fillStyle = 'rgba(28, 20, 10, .72)';
    drawRoundedRect(10, 10, 500, 42, 12);
    ctx.fillStyle = '#fff8e5';
    ctx.font = '16px Georgia';
    ctx.textAlign = 'left';
    ctx.fillText('Explore the Grove. Press E near characters. Tall grass can start battles.', 22, 36);

    if (gameMode === 'win') {
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff6dd';
      ctx.textAlign = 'center';
      ctx.font = '44px Georgia';
      ctx.fillText('You opened the Rune Portal!', canvas.width / 2, 205);
      ctx.font = '20px Georgia';
      ctx.fillText('You can keep expanding this into a bigger adventure.', canvas.width / 2, 245);
    }
  }

  function drawBattleBar(x, y, w, h, pct, color, label) {
    ctx.fillStyle = 'rgba(34, 25, 17, .82)';
    drawRoundedRect(x, y, w, h, 10);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    drawRoundedRect(x + 3, y + 3, w - 6, h - 6, 8);
    ctx.fillStyle = color;
    drawRoundedRect(x + 3, y + 3, Math.max(12, (w - 6) * Math.max(0, pct)), h - 6, 8);
    ctx.fillStyle = '#fff4da';
    ctx.font = '14px Georgia';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 10, y + 18);
  }

  function drawBattleScene() {
    drawWorldBackground();
    ctx.fillStyle = 'rgba(17, 26, 14, .44)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 246, 225, .93)';
    drawRoundedRect(18, 20, 764, 440, 20);
    ctx.fillStyle = 'rgba(69, 51, 28, .22)';
    drawRoundedRect(30, 32, 740, 416, 16);

    const enemy = battle.enemy;
    const enemyImg = images[`enemy_${enemy.sprite}`];
    const playerImg = images['player_right_1'] || currentPlayerImage();

    ctx.fillStyle = '#4a321b';
    ctx.font = '24px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(`Battle: ${enemy.name}`, canvas.width / 2, 62);

    drawBattleBar(70, 88, 250, 24, enemy.hp / enemy.maxHp, '#d26b60', `${enemy.name} HP ${enemy.hp}/${enemy.maxHp}`);
    drawBattleBar(480, 320, 250, 24, player.hp / player.maxHp, '#d26b60', `Hero HP ${player.hp}/${player.maxHp}`);
    drawBattleBar(480, 352, 250, 24, player.energy / player.maxEnergy, '#5a91d8', `Energy ${player.energy}/${player.maxEnergy}`);

    drawImageFit(enemyImg, 74, 130, 240, 180);
    drawImageFit(playerImg, 480, 165, 180, 180);

    ctx.fillStyle = 'rgba(38, 27, 15, .14)';
    ctx.beginPath();
    ctx.ellipse(200, 300, 85, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(575, 352, 75, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#5a3a1f';
    ctx.font = '18px Georgia';
    ctx.textAlign = 'left';
    ctx.fillText('Choose your action in the panel below.', 70, 400);
    ctx.font = '16px Georgia';
    ctx.fillStyle = '#725536';
    ctx.fillText('Strike • Spark • Potion • Defend • Run', 70, 427);
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
    showBattle(`${reason} ${battle.enemy.name} wants to battle!`);
  }

  function showBattle(text) {
    const enemy = battle.enemy;
    showDialogue(`${text}\n\nEnemy HP: ${enemy.hp}/${enemy.maxHp}`, [
      { label: 'Strike', onClick: () => playerAttack('strike') },
      { label: 'Spark -3 energy', onClick: () => playerAttack('spark'), disabled: player.energy < 3 },
      { label: `Potion (${player.potions})`, onClick: usePotion, disabled: player.potions <= 0 || player.hp >= player.maxHp },
      { label: 'Defend', onClick: defend },
      { label: 'Run', onClick: tryRun },
    ], 'battle');
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
      player.x = 2 * TILE;
      player.y = 2 * TILE;
      player.animFrame = 0;
      player.animClock = 0;
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
    ], 'dialogue');
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

  function showDialogue(text, choices, mode = 'dialogue') {
    if (mode !== 'battle' && gameMode !== 'win') gameMode = 'dialogue';
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
    if (gameMode === 'dialogue') gameMode = 'world';
  }

  function nearestNpc(maxDistance = 44) {
    const foot = playerFootCenter();
    let best = null;
    for (const npc of npcs) {
      const npcCenter = { x: npc.x * TILE + 16, y: npc.y * TILE + 24 };
      const dist = Math.hypot(foot.x - npcCenter.x, foot.y - npcCenter.y);
      if (dist <= maxDistance && (!best || dist < best.dist)) best = { npc, dist };
    }
    return best?.npc || null;
  }

  function interact() {
    if (gameMode !== 'world') return;
    const npc = nearestNpc();
    if (npc) {
      npc.talk();
      return;
    }
    const tile = playerTileUnderfoot();
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

  function updateMovement(dt) {
    if (gameMode !== 'world') {
      player.animFrame = 0;
      player.animClock = 0;
      return;
    }

    let dx = 0;
    let dy = 0;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;

    const moving = dx !== 0 || dy !== 0;
    if (!moving) {
      player.animFrame = 0;
      player.animClock = 0;
      return;
    }

    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    if (Math.abs(dx) > Math.abs(dy)) player.facing = dx < 0 ? 'left' : 'right';
    else player.facing = dy < 0 ? 'up' : 'down';

    const step = PLAYER_SPEED * dt;
    const nextX = player.x + dx * step;
    const nextY = player.y + dy * step;

    if (isAreaWalkable(nextX, player.y)) player.x = nextX;
    if (isAreaWalkable(player.x, nextY)) player.y = nextY;

    player.animClock += dt;
    if (player.animClock >= 0.14) {
      player.animClock = 0;
      player.animFrame = (player.animFrame + 1) % 4;
    }

    const tile = playerTileUnderfoot();
    if (tileInfo[tile].encounter) {
      player.encounterDistance += step;
      if (player.encounterDistance >= 28) {
        player.encounterDistance = 0;
        if (Math.random() < 0.18) {
          startBattle('The tall grass rustles!');
        }
      }
    } else {
      player.encounterDistance = 0;
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
      const loadedPlayer = JSON.parse(raw);
      player = { ...defaultPlayer(), ...loadedPlayer };
      if (typeof player.x !== 'number' || typeof player.y !== 'number') {
        player.x = 2 * TILE;
        player.y = 2 * TILE;
      }
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
    if ((key === 'e' || key === ' ') && gameMode === 'world') interact();
    keys.add(key);
  });

  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  saveBtn.addEventListener('click', saveGame);
  loadBtn.addEventListener('click', loadGame);
  newGameBtn.addEventListener('click', newGame);

  function render() {
    if (gameMode === 'battle' && battle) drawBattleScene();
    else drawWorld();
  }

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.033);
    lastTime = timestamp;

    if (loaded) {
      updateMovement(dt);
      render();
    } else {
      ctx.fillStyle = '#173524';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff5dd';
      ctx.font = '28px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('Loading Rune Grove art...', canvas.width / 2, canvas.height / 2);
    }

    requestAnimationFrame(gameLoop);
  }

  updateStats();
  log('Welcome! Walk through grass to find battles. Talk to the healer or merchant.');
  loadAllImages().finally(() => requestAnimationFrame(gameLoop));
})();
