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
  const SPEED = 120;
  const SAVE_KEY = 'rune-grove-rpg-real-map-v3-save';

  const images = {};
  const playerPaths = {
    up: ['player_back_0.png', 'player_back_1.png', 'player_back_2.png', 'player_back_3.png'],
    down: ['player_front_0.png', 'player_front_1.png', 'player_front_2.png', 'player_front_3.png'],
    left: ['player_left_0.png', 'player_left_1.png', 'player_left_2.png', 'player_left_3.png'],
    right: ['player_right_0.png', 'player_right_1.png', 'player_right_2.png', 'player_right_3.png'],
  };
  const npcPaths = { healer: 'npc_healer.png', merchant: 'npc_merchant.png', guardian: 'npc_guardian.png' };
  const enemyPaths = { mossling: 'enemy_mossling.png', pebble_pup: 'enemy_pebble_pup.png', shadow_beetle: 'enemy_shadow_beetle.png' };

  const map = [
    'ttttttttttttttttttttttttt',
    't.......ggg.............pt',
    't..hhh...ggg...tt.....tt.t',
    't..hhh........ttt.....tt.t',
    't.........................t',
    't...ggg.............ggg...t',
    't...ggg....wwwww....ggg...t',
    't..........wwwww..........t',
    't.....tt...........tt.....t',
    't.....tt....sss....tt.....t',
    't..gggg.....sss.....ggg...t',
    't..gggg..tt.........ggg...t',
    't........tt....hhh........t',
    't..............hhh........t',
    'ttttttttttttttttttttttttt',
  ];
  const tileInfo = {
    '.': { walkable: true },
    'g': { walkable: true, encounter: true },
    's': { walkable: true },
    'p': { walkable: true },
    't': { walkable: false },
    'w': { walkable: false },
    'h': { walkable: false },
  };

  const npcs = [
    { id: 'healer', x: 7, y: 4, sprite: 'healer',
      talk: () => showDialogue('Grove Healer: Rest here and I will restore your HP and energy.', [
        { label: 'Heal for free', onClick: () => { player.hp = player.maxHp; player.energy = player.maxEnergy; log('You feel refreshed.'); updateStats(); closeDialogue(); } },
        { label: 'Bye', onClick: closeDialogue },
      ])
    },
    { id: 'merchant', x: 18, y: 11, sprite: 'merchant',
      talk: () => showDialogue('Potion Merchant: A potion costs 5 coins. It restores 15 HP in battle.', [
        { label: 'Buy potion', onClick: () => { if (player.coins >= 5) { player.coins -= 5; player.potions++; log('Bought 1 potion.'); } else log('Not enough coins.'); updateStats(); } },
        { label: 'Bye', onClick: closeDialogue },
      ])
    },
    { id: 'guardian', x: 21, y: 2, sprite: 'guardian',
      talk: () => showDialogue('Portal Guardian: The portal opens for brave heroes. Reach Level 3, then step into the glow.', [
        { label: 'Got it', onClick: closeDialogue },
      ])
    },
  ];

  const enemyTypes = [
    { name: 'Mossling', sprite: 'mossling', hp: 18, attack: 4, xp: 8, coins: 3 },
    { name: 'Pebble Pup', sprite: 'pebble_pup', hp: 22, attack: 5, xp: 10, coins: 4 },
    { name: 'Shadow Beetle', sprite: 'shadow_beetle', hp: 26, attack: 6, xp: 12, coins: 5 },
  ];

  function defaultPlayer() {
    return {
      x: 2.2 * TILE, y: 2.8 * TILE, facing: 'down', animFrame: 0, animClock: 0,
      level: 1, hp: 30, maxHp: 30, energy: 12, maxEnergy: 12,
      xp: 0, xpToNext: 20, coins: 0, potions: 2, wins: 0, encounterDistance: 0
    };
  }

  let player = defaultPlayer();
  let mode = 'world';
  let battle = null;
  let loaded = false;
  let last = 0;
  const keys = new Set();

  function loadImages() {
    const jobs = [];
    const add = (key, file) => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { images[key] = img; resolve(); };
      img.onerror = resolve;
      img.src = `assets/${file}`;
    });
    for (const [dir, files] of Object.entries(playerPaths)) files.forEach((file, i) => jobs.push(add(`player_${dir}_${i}`, file)));
    for (const [key, file] of Object.entries(npcPaths)) jobs.push(add(`npc_${key}`, file));
    for (const [key, file] of Object.entries(enemyPaths)) jobs.push(add(`enemy_${key}`, file));
    return Promise.all(jobs).then(() => loaded = true);
  }

  function updateStats() {
    statsEl.innerHTML = `
      <div class="stat-line"><span>Level</span><span>${player.level}</span></div>
      <div class="stat-line"><span class="hp">HP</span><span>${player.hp}/${player.maxHp}</span></div>
      <div class="stat-line"><span class="energy">Energy</span><span>${player.energy}/${player.maxEnergy}</span></div>
      <div class="stat-line"><span class="xp">XP</span><span>${player.xp}/${player.xpToNext}</span></div>
      <div class="stat-line"><span class="coins">Coins</span><span>${player.coins}</span></div>
      <div class="stat-line"><span>Potions</span><span>${player.potions}</span></div>
      <div class="stat-line"><span>Battles won</span><span>${player.wins}</span></div>`;
  }

  function log(text) {
    const p = document.createElement('p');
    p.textContent = text;
    logEl.prepend(p);
    while (logEl.children.length > 14) logEl.removeChild(logEl.lastChild);
  }

  function tileAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return 't';
    return map[ty][tx];
  }

  function playerRect(x = player.x, y = player.y) {
    return { x: x + 11, y: y + 24, w: 10, h: 7 };
  }

  function npcRect(npc) {
    return { x: npc.x * TILE + 9, y: npc.y * TILE + 21, w: 14, h: 9 };
  }

  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function canMoveTo(x, y) {
    const r = playerRect(x, y);
    const points = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
    for (const [px, py] of points) {
      if (!tileInfo[tileAt(px, py)].walkable) return false;
    }
    for (const npc of npcs) if (hit(r, npcRect(npc))) return false;
    return true;
  }

  function imageFit(img, x, y, w, h) {
    if (!img) return;
    const scale = Math.min(w / img.width, h / img.height);
    const nw = img.width * scale;
    const nh = img.height * scale;
    ctx.drawImage(img, x + (w - nw) / 2, y + (h - nh) / 2, nw, nh);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function noise(x, y, s = 1) {
    let n = x * 374761393 + y * 668265263 + s * 2246822519;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }

  function grass(x, y) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = noise(x, y) > .5 ? '#77b866' : '#6ead5e';
    ctx.fillRect(px, py, TILE, TILE);
    if (noise(x, y, 2) > .84) {
      ctx.fillStyle = '#f5e8a7';
      ctx.beginPath();
      ctx.arc(px + 10, py + 10, 2, 0, Math.PI * 2);
      ctx.arc(px + 14, py + 11, 2, 0, Math.PI * 2);
      ctx.arc(px + 12, py + 14, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tallGrass(x, y) {
    grass(x, y);
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = 'rgba(45, 112, 55, .75)';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.ellipse(px + 5 + i * 4, py + 22 - (i % 3) * 2, 2, 8, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function water(x, y) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = '#3b94c9';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.fillRect(px + 5, py + 10, 18, 2);
    ctx.fillRect(px + 12, py + 22, 14, 2);
  }

  function stone(x, y) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = '#b69b6e';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#908878';
    ctx.beginPath();
    ctx.ellipse(px + 12, py + 12, 9, 6, .2, 0, Math.PI * 2);
    ctx.ellipse(px + 24, py + 22, 7, 5, -.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function tree(x, y) {
    grass(x, y);
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = '#6a4226';
    ctx.fillRect(px + 13, py + 17, 6, 14);
    ctx.fillStyle = '#2f7c43';
    ctx.beginPath(); ctx.arc(px + 16, py + 12, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4fa45d';
    ctx.beginPath(); ctx.arc(px + 9, py + 13, 8, 0, Math.PI * 2); ctx.arc(px + 22, py + 10, 9, 0, Math.PI * 2); ctx.fill();
  }

  function cottage(x, y) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = '#d7b985';
    ctx.fillRect(px + 2, py + 8, TILE - 4, TILE - 8);
    ctx.fillStyle = '#1c86a5';
    ctx.beginPath(); ctx.moveTo(px, py + 13); ctx.lineTo(px + 16, py + 2); ctx.lineTo(px + 32, py + 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a452b';
    ctx.fillRect(px + 12, py + 19, 8, 13);
  }

  function portal(x, y) {
    grass(x, y);
    const px = x * TILE, py = y * TILE;
    const pulse = .55 + Math.sin(Date.now() / 180) * .2;
    ctx.fillStyle = `rgba(163, 234, 255, ${pulse})`;
    ctx.beginPath(); ctx.ellipse(px + 16, py + 15, 11, 17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(228, 252, 255, .9)'; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawMap() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        const t = map[y][x];
        if (t === 'g') tallGrass(x, y);
        else if (t === 'w') water(x, y);
        else if (t === 's') stone(x, y);
        else if (t === 't') tree(x, y);
        else if (t === 'h') cottage(x, y);
        else if (t === 'p') portal(x, y);
        else grass(x, y);
      }
    }

    // Painted dirt path.
    ctx.strokeStyle = '#c3a16d'; ctx.lineWidth = 40; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(78, 88); ctx.bezierCurveTo(190, 120, 300, 170, 365, 235); ctx.bezierCurveTo(475, 330, 620, 325, 735, 395); ctx.stroke();
    ctx.strokeStyle = '#d6bc83'; ctx.lineWidth = 27;
    ctx.beginPath(); ctx.moveTo(78, 88); ctx.bezierCurveTo(190, 120, 300, 170, 365, 235); ctx.bezierCurveTo(475, 330, 620, 325, 735, 395); ctx.stroke();

    // Bigger cottage drawings over house blocks.
    drawCottageBlock(3 * TILE, 2 * TILE);
    drawCottageBlock(16 * TILE, 12 * TILE);
  }

  function drawCottageBlock(x, y) {
    ctx.fillStyle = '#9f6b43'; ctx.fillRect(x + 4, y + 30, 88, 50);
    ctx.fillStyle = '#e4c990'; ctx.fillRect(x + 10, y + 38, 76, 42);
    ctx.fillStyle = '#167d9d';
    ctx.beginPath(); ctx.moveTo(x, y + 38); ctx.lineTo(x + 48, y + 4); ctx.lineTo(x + 96, y + 38); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5f3d25'; ctx.fillRect(x + 41, y + 56, 15, 24);
    ctx.fillStyle = '#70b0d2'; ctx.fillRect(x + 16, y + 49, 12, 12); ctx.fillRect(x + 68, y + 49, 12, 12);
  }

  function drawNpc(npc) {
    const px = npc.x * TILE, py = npc.y * TILE;
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(px + 16, py + 29, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    imageFit(images[`npc_${npc.sprite}`], px - 2, py - 10, 36, 40);
  }

  function drawPlayer() {
    const img = images[`player_${player.facing}_${player.animFrame}`] || images.player_down_0;
    ctx.fillStyle = 'rgba(0,0,0,.26)';
    ctx.beginPath(); ctx.ellipse(player.x + 16, player.y + 29, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    imageFit(img, player.x - 5, player.y - 10, 42, 42);
  }

  function drawWorld() {
    drawMap();
    const sprites = [...npcs.map(n => ({ kind: 'npc', y: n.y * TILE + 29, n })), { kind: 'player', y: player.y + 29 }]
      .sort((a, b) => a.y - b.y);
    for (const s of sprites) s.kind === 'npc' ? drawNpc(s.n) : drawPlayer();

    ctx.fillStyle = 'rgba(28, 20, 10, .72)';
    roundRect(10, 10, 500, 42, 12);
    ctx.fillStyle = '#fff8e5'; ctx.font = '16px Georgia'; ctx.textAlign = 'left';
    ctx.fillText('Explore the Grove. Press E near characters. Tall grass can start battles.', 22, 36);

    if (mode === 'win') {
      ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff6dd'; ctx.textAlign = 'center'; ctx.font = '44px Georgia';
      ctx.fillText('You opened the Rune Portal!', canvas.width / 2, 205);
      ctx.font = '20px Georgia'; ctx.fillText('You can keep expanding this into a bigger adventure.', canvas.width / 2, 245);
    }
  }

  function drawBar(x, y, w, h, pct, color, label) {
    ctx.fillStyle = 'rgba(34, 25, 17, .82)'; roundRect(x, y, w, h, 10);
    ctx.fillStyle = color; roundRect(x + 3, y + 3, Math.max(12, (w - 6) * Math.max(0, pct)), h - 6, 8);
    ctx.fillStyle = '#fff4da'; ctx.font = '14px Georgia'; ctx.textAlign = 'left'; ctx.fillText(label, x + 10, y + 18);
  }

  function drawBattle() {
    drawMap();
    ctx.fillStyle = 'rgba(17, 26, 14, .50)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 246, 225, .95)'; roundRect(18, 20, 764, 440, 20);
    ctx.fillStyle = '#4a321b'; ctx.font = '24px Georgia'; ctx.textAlign = 'center';
    ctx.fillText(`Battle: ${battle.enemy.name}`, canvas.width / 2, 62);

    drawBar(70, 88, 250, 24, battle.enemy.hp / battle.enemy.maxHp, '#d26b60', `${battle.enemy.name} HP ${battle.enemy.hp}/${battle.enemy.maxHp}`);
    drawBar(480, 320, 250, 24, player.hp / player.maxHp, '#d26b60', `Hero HP ${player.hp}/${player.maxHp}`);
    drawBar(480, 352, 250, 24, player.energy / player.maxEnergy, '#5a91d8', `Energy ${player.energy}/${player.maxEnergy}`);

    imageFit(images[`enemy_${battle.enemy.sprite}`], 74, 130, 230, 175);
    imageFit(images.player_right_1 || images.player_down_0, 500, 180, 125, 145);
    ctx.fillStyle = '#5a3a1f'; ctx.font = '18px Georgia'; ctx.textAlign = 'left';
    ctx.fillText('Choose your action below.', 70, 400);
  }

  function makeEnemy() {
    const base = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
    const s = player.level - 1;
    return { ...base, hp: base.hp + s * 6, maxHp: base.hp + s * 6, attack: base.attack + s * 2, xp: base.xp + s * 5, coins: base.coins + s * 2 };
  }

  function startBattle(reason) {
    mode = 'battle';
    battle = { enemy: makeEnemy(), defending: false };
    showBattle(`${reason} ${battle.enemy.name} wants to battle!`);
  }

  function showBattle(text) {
    showDialogue(`${text}\n\nEnemy HP: ${battle.enemy.hp}/${battle.enemy.maxHp}`, [
      { label: 'Strike', onClick: () => playerAttack('strike') },
      { label: 'Spark -3 energy', onClick: () => playerAttack('spark'), disabled: player.energy < 3 },
      { label: `Potion (${player.potions})`, onClick: usePotion, disabled: player.potions <= 0 || player.hp >= player.maxHp },
      { label: 'Defend', onClick: defend },
      { label: 'Run', onClick: runAway },
    ], 'battle');
  }

  function playerAttack(type) {
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

  function defend() { battle.defending = true; log('You brace for the next hit.'); enemyTurn(); }

  function usePotion() {
    if (player.potions <= 0 || player.hp >= player.maxHp) return;
    player.potions--;
    const healed = Math.min(15, player.maxHp - player.hp);
    player.hp += healed;
    log(`You used a potion and healed ${healed} HP.`);
    updateStats();
    enemyTurn();
  }

  function runAway() {
    if (Math.random() < .55) {
      log('You escaped safely.');
      battle = null; closeDialogue(); mode = 'world';
    } else {
      log('Could not escape!');
      enemyTurn();
    }
  }

  function enemyTurn() {
    let damage = rand(battle.enemy.attack - 1, battle.enemy.attack + 2);
    if (battle.defending) { damage = Math.ceil(damage / 2); battle.defending = false; }
    player.hp = Math.max(0, player.hp - damage);
    log(`${battle.enemy.name} hits you for ${damage} damage.`);
    updateStats();
    if (player.hp <= 0) {
      player.hp = Math.ceil(player.maxHp * .6);
      player.energy = Math.ceil(player.maxEnergy * .6);
      player.x = 2.2 * TILE; player.y = 2.8 * TILE;
      battle = null; closeDialogue(); mode = 'world';
      log('You fainted and woke up near the path.');
      updateStats();
      return;
    }
    showBattle('Your turn. Choose an action.');
  }

  function winBattle() {
    const e = battle.enemy;
    player.xp += e.xp; player.coins += e.coins; player.wins++; player.energy = Math.min(player.maxEnergy, player.energy + 2);
    log(`You won! +${e.xp} XP, +${e.coins} coins.`);
    battle = null;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      player.level++; player.xpToNext += 15; player.maxHp += 8; player.maxEnergy += 3;
      player.hp = player.maxHp; player.energy = player.maxEnergy;
      log(`Level up! You are now Level ${player.level}.`);
    }
    updateStats();
    showDialogue('Battle won! You can keep exploring.', [{ label: 'Continue', onClick: () => { closeDialogue(); mode = 'world'; } }]);
  }

  function showDialogue(text, choices, dialogueMode = 'dialogue') {
    if (dialogueMode !== 'battle' && mode !== 'win') mode = 'dialogue';
    dialogueEl.classList.remove('hidden');
    dialogueTextEl.textContent = text;
    choicesEl.innerHTML = '';
    for (const choice of choices) {
      const btn = document.createElement('button');
      btn.textContent = choice.label;
      btn.disabled = !!choice.disabled;
      btn.onclick = choice.onClick;
      choicesEl.appendChild(btn);
    }
  }

  function closeDialogue() {
    dialogueEl.classList.add('hidden');
    choicesEl.innerHTML = '';
    if (mode === 'dialogue') mode = 'world';
  }

  function nearbyNpc() {
    const px = player.x + 16, py = player.y + 28;
    let best = null;
    for (const npc of npcs) {
      const nx = npc.x * TILE + 16, ny = npc.y * TILE + 24;
      const d = Math.hypot(px - nx, py - ny);
      if (d < 42 && (!best || d < best.d)) best = { npc, d };
    }
    return best?.npc;
  }

  function interact() {
    if (mode !== 'world') return;
    const npc = nearbyNpc();
    if (npc) return npc.talk();

    const t = tileAt(player.x + 16, player.y + 28);
    if (t === 'p') {
      if (player.level >= 3) { mode = 'win'; log('The portal opens!'); }
      else showDialogue('The portal hums quietly. It needs a stronger hero. Come back at Level 3.', [{ label: 'Continue', onClick: closeDialogue }]);
      return;
    }
    log('Nothing to interact with here.');
  }

  function updateMovement(dt) {
    if (mode !== 'world') { player.animFrame = 0; player.animClock = 0; return; }

    let dx = 0, dy = 0;
    if (keys.has('arrowup') || keys.has('w')) dy--;
    if (keys.has('arrowdown') || keys.has('s')) dy++;
    if (keys.has('arrowleft') || keys.has('a')) dx--;
    if (keys.has('arrowright') || keys.has('d')) dx++;

    if (!dx && !dy) { player.animFrame = 0; player.animClock = 0; return; }

    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    player.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');

    const step = SPEED * dt;
    let moved = false;
    if (canMoveTo(player.x + dx * step, player.y)) { player.x += dx * step; moved = true; }
    if (canMoveTo(player.x, player.y + dy * step)) { player.y += dy * step; moved = true; }

    if (moved) {
      player.animClock += dt;
      if (player.animClock >= .14) { player.animClock = 0; player.animFrame = (player.animFrame + 1) % 4; }
    }

    const t = tileAt(player.x + 16, player.y + 28);
    if (tileInfo[t].encounter && moved) {
      player.encounterDistance += step;
      if (player.encounterDistance > 30) {
        player.encounterDistance = 0;
        if (Math.random() < .16) startBattle('The tall grass rustles!');
      }
    } else {
      player.encounterDistance = 0;
    }

    if (t === 'p') interact();
  }

  function saveGame() { localStorage.setItem(SAVE_KEY, JSON.stringify(player)); log('Game saved in this browser.'); }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return log('No saved game found.');
    try {
      player = { ...defaultPlayer(), ...JSON.parse(raw) };
      battle = null; mode = 'world'; closeDialogue(); updateStats(); log('Game loaded.');
    } catch { log('Save file could not be read.'); }
  }

  function newGame() {
    player = defaultPlayer(); battle = null; mode = 'world'; closeDialogue();
    localStorage.removeItem(SAVE_KEY); logEl.innerHTML = ''; log('New game started.'); updateStats();
  }

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'e'].includes(key)) e.preventDefault();
    if ((key === 'e' || key === ' ') && mode === 'world') interact();
    keys.add(key);
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  saveBtn.onclick = saveGame;
  loadBtn.onclick = loadGame;
  newGameBtn.onclick = newGame;

  function loop(time) {
    if (!last) last = time;
    const dt = Math.min((time - last) / 1000, .033);
    last = time;

    if (!loaded) {
      ctx.fillStyle = '#173524'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff5dd'; ctx.font = '28px Georgia'; ctx.textAlign = 'center';
      ctx.fillText('Loading Rune Grove art...', canvas.width / 2, canvas.height / 2);
    } else {
      updateMovement(dt);
      if (mode === 'battle' && battle) drawBattle();
      else drawWorld();
    }
    requestAnimationFrame(loop);
  }

  updateStats();
  log('Welcome! This version uses a real playable map, not the finished scene art as a background.');
  loadImages().finally(() => requestAnimationFrame(loop));
})();
