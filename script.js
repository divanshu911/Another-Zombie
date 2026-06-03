const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 1. STATE & PERSISTENCE ---
let gameState = 'START';
let isPaused = false;
let wave = 1;
let animationId;
let screenShake = 0;
let biteSoundTimer = 0;
let highWave = localStorage.getItem('highWave') || 1;

// WAVE TIMER CONFIGURATION ENGINE
let waveTimer = 0;
const WAVE_DURATION = 30; // Seconds player has to clear a wave before stacking occurs

// MAP SELECTOR ENGINE CONFIGURATION
const backgrounds = {
    grass: 'https://raw.githubusercontent.com/divanshu911/New-things/736c8aca12961f3145a8257b1efde09b8e704130/IMG_GRASS911.jpg',
    desert: 'https://raw.githubusercontent.com/divanshu911/New-things/refs/heads/main/IMG_Desert612.png',
    snow: 'https://raw.githubusercontent.com/divanshu911/New-things/refs/heads/main/IMG_Snow117.png'
};

// --- PRELOADER ENGINE ---
// Instantly cache images in memory to prevent screen flicker when switching fields
const preloadedImages = {};
for (const key in backgrounds) {
    preloadedImages[key] = new Image();
    preloadedImages[key].src = backgrounds[key];
}

let bgImage = preloadedImages['grass']; 

// Unified Selector Sync Routine
function selectBackground(bgKey) {
    if (!preloadedImages[bgKey]) return;
    
    // Swap directly to the preloaded cache in memory
    bgImage = preloadedImages[bgKey];
    localStorage.setItem('selectedBg', bgKey);
    
    // Cycle and re-assign active classes globally to sync both menus
    document.querySelectorAll('.map-btn').forEach(btn => {
        if (btn.classList.contains('map-' + bgKey)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Initializing the default map or player preference
let savedBg = localStorage.getItem('selectedBg') || 'grass';
selectBackground(savedBg);

let bullets = [], zombies = [], buildings = [], medkits = [], powerups = [], bombs = [], explosions = [], particles = [];
const keys = { w: false, a: false, s: false, d: false };

const player = {
    x: 0, y: 0, radius: 15, baseSpeed: 2.5, speed: 2.5, angle: 0,
    hp: 100, ammo: 10, maxAmmo: 10, isReloading: false,
    ammoTimer: 0, shieldTimer: 0, speedTimer: 0
};

// --- 2. AUDIO SETUP ---
const sounds = {
    shoot: new Audio('https://raw.githubusercontent.com/divanshu911/New-things/1ec9f8b4f865017f9f14d54a7a44f4d63a2b9f91/363698__jofae__retro-gun-shot.mp3'),
    death: new Audio('https://raw.githubusercontent.com/divanshu911/New-things/1ec9f8b4f865017f9f14d54a7a44f4d63a2b9f91/475347__fupicat__videogame-death-sound.wav'),
    powerup: new Audio('https://raw.githubusercontent.com/divanshu911/New-things/1ec9f8b4f865017f9f14d54a7a44f4d63a2b9f91/503459__lilmati__powerup-02.wav'),
    explosion: new Audio('https://raw.githubusercontent.com/divanshu911/New-things/1ec9f8b4f865017f9f14d54a7a44f4d63a2b9f91/522572__lilmati__retro-bomb-explosion.wav'),
    reload: new Audio('https://raw.githubusercontent.com/divanshu911/New-things/1ec9f8b4f865017f9f14d54a7a44f4d63a2b9f91/693125__serutonin-deprivd__22lr-revolver-ejecting-bullets-from-cylinder.wav'),
    bgMusic: new Audio('https://raw.githubusercontent.com/divanshu911/New-things/1ec9f8b4f865017f9f14d54a7a44f4d63a2b9f91/778131__audiomirage__isolation-loop.wav'),
    bite: new Audio('https://raw.githubusercontent.com/divanshu911/New-things/1ec9f8b4f865017f9f14d54a7a44f4d63a2b9f91/445109__the-not-at-all-real-kanade-hise__crunching.wav'),
    empty: new Audio('https://raw.githubusercontent.com/divanshu911/New-things/main/709910__astronaut77890__p226-empty-trigger-pull.wav')
};
sounds.bgMusic.loop = true;
sounds.bgMusic.volume = 0.9;

function playSound(audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

// --- 3. ENGINE & WORLD ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    generateBuildings();
}

function generateBuildings() {
    const w = canvas.width, h = canvas.height;
    const bSize = Math.min(100, Math.max(50, w * 0.15));
    const pad = bSize;
    buildings = [
        { x: pad, y: pad, w: bSize, h: bSize },
        { x: w - bSize - pad, y: pad, w: bSize, h: bSize },
        { x: pad, y: h - bSize - pad, w: bSize, h: bSize },
        { x: w - bSize - pad, y: h - bSize - pad, w: bSize, h: bSize },
        { x: w/2 - bSize/2, y: h/2 - bSize/2, w: bSize, h: bSize }
    ];
}

function checkBuildingCol(nx, ny, r) {
    return buildings.some(b => nx + r > b.x && nx - r < b.x + b.w && ny + r > b.y && ny - r < b.y + b.h);
}

function checkItemCol(nx, ny, r) {
    const allItems = [...bombs, ...medkits, ...powerups];
    return allItems.some(item => Math.hypot(nx - item.x, ny - item.y) < r + 15);
}

function setControlVisibility(visible) {
    const hudElement = document.getElementById('hud');
    const touchControlsElement = document.getElementById('touchControls');
    const timerElement = document.getElementById('timerDisplay');
    
    if (visible) {
        hudElement.classList.remove('hidden');
        touchControlsElement.classList.remove('hidden');
        timerElement.classList.remove('hidden');
    } else {
        hudElement.classList.add('hidden');
        touchControlsElement.classList.add('hidden');
        timerElement.classList.add('hidden');
    }
}

function spawnBlood(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            dx: (Math.random() - 0.5) * 4,
            dy: (Math.random() - 0.5) * 4,
            radius: Math.random() * 2 + 1,
            alpha: 1,
            decay: Math.random() * 0.03 + 0.02
        });
    }
}

// --- 4. GAME ACTIONS ---
function shoot() {
    if(player.isReloading || gameState !== 'PLAYING' || isPaused) return;
    if(player.ammo > 0 || player.ammoTimer > 0) {
        if(player.ammoTimer <= 0) player.ammo--;
        bullets.push({ x: player.x, y: player.y, dx: Math.cos(player.angle)*12, dy: Math.sin(player.angle)*12 });
        playSound(sounds.shoot); updateHUD();
    } else {
        playSound(sounds.empty);
    }
}

function reload() {
    if(player.isReloading || player.ammo === player.maxAmmo || isPaused) return;
    player.isReloading = true; playSound(sounds.reload); updateHUD();
    setTimeout(() => { 
        if(gameState === 'PLAYING' && !isPaused) { 
            player.ammo = player.maxAmmo; player.isReloading = false; updateHUD(); 
        } 
    }, 1200);
}

function togglePause() {
    if (gameState !== 'PLAYING') return;
    isPaused = !isPaused;
    if (isPaused) {
        document.getElementById('pauseScreen').classList.remove('hidden');
        sounds.bgMusic.pause();
    } else {
        document.getElementById('pauseScreen').classList.add('hidden');
        sounds.bgMusic.play();
        gameLoop();
    }
}

function triggerExplosion(x, y) {
    screenShake = 15;
    explosions.push({ x, y, r: 10, maxR: 140, timer: 20 });
    spawnBlood(x, y, 25);
    if (player.shieldTimer <= 0 && Math.hypot(player.x - x, player.y - y) < 140) player.hp -= 40;
    for (let i = zombies.length - 1; i >= 0; i--) {
        let z = zombies[i];
        if (Math.hypot(z.x - x, z.y - y) < 140) {
            z.hp -= 100;
            z.flashTimer = 4; // Trigger flash on explosion hit
        }
    }
    updateHUD();
    if(player.hp <= 0) endGame("Exploded!");
}

// --- 5. UPDATE LOOP ---
function update() {
    let mx = 0, my = 0;
    if(keys.w) my -= 1; if(keys.s) my += 1;
    if(keys.a) mx -= 1; if(keys.d) mx += 1;
    if(mx !== 0 || my !== 0) {
        player.angle = Math.atan2(my, mx);
        let s = (mx!==0 && my!==0) ? player.speed * 0.707 : player.speed;
        let nx = player.x + mx * s, ny = player.y + my * s;
        let canMoveX = !checkBuildingCol(nx, player.y, player.radius);
        let canMoveY = !checkBuildingCol(player.x, ny, player.radius);
        if (canMoveX) player.x = nx;
        if (canMoveY) player.y = ny;
        if (!canMoveY && canMoveX && mx === 0) {
            let leftClear = !checkBuildingCol(player.x - 5, player.y, player.radius);
            let rightClear = !checkBuildingCol(player.x + 5, player.y, player.radius);
            if (leftClear && !rightClear) player.x -= player.speed * 0.8;
            else if (rightClear && !leftClear) player.x += player.speed * 0.8;
        }
        if (!canMoveX && canMoveY && my === 0) {
            let upClear = !checkBuildingCol(player.x, player.y - 5, player.radius);
            let downClear = !checkBuildingCol(player.x, player.y + 5, player.radius);
            if (upClear && !downClear) player.y -= player.speed * 0.8;
            else if (downClear && !upClear) player.y += player.speed * 0.8;
        }
        player.x = Math.max(15, Math.min(canvas.width-15, player.x));
        player.y = Math.max(15, Math.min(canvas.height-15, player.y));
    }
    if(player.shieldTimer > 0) player.shieldTimer--;
    if(player.ammoTimer > 0) player.ammoTimer--;
    if(player.speedTimer > 0) { player.speedTimer--; if(player.speedTimer <= 0) player.speed = player.baseSpeed; }
    if(biteSoundTimer > 0) biteSoundTimer--;
    if(Math.random() < 0.005 && bombs.length < 3) spawnItem('bomb');
    if(Math.random() < 0.005 && medkits.length < 2) spawnItem('medkit');
    if(Math.random() < 0.008 && powerups.length < 3) spawnItem('powerup');
    for (let i = medkits.length - 1; i >= 0; i--) {
        if (Math.hypot(player.x - medkits[i].x, player.y - medkits[i].y) < 30) {
            player.hp = Math.min(100, player.hp + 30); medkits.splice(i, 1); playSound(sounds.powerup); updateHUD();
        }
    }
    for (let i = powerups.length - 1; i >= 0; i--) {
        let p = powerups[i];
        if (Math.hypot(player.x - p.x, player.y - p.y) < 30) {
            if (p.type === 'shield') player.shieldTimer = 600;
            if (p.type === 'speed') { player.speed = 4.5; player.speedTimer = 420; }
            if (p.type === 'ammo') player.ammoTimer = 600;
            powerups.splice(i, 1); playSound(sounds.powerup); updateHUD();
        }
    }
    for (let i = bombs.length - 1; i >= 0; i--) {
        let b = bombs[i];
        if (!b.ignited) {
            let triggered = false;
            if (Math.hypot(player.x - b.x, player.y - b.y) < 30) triggered = true;
            else {
                for (let j = 0; j < zombies.length; j++) {
                    if (Math.hypot(zombies[j].x - b.x, zombies[j].y - b.y) < 30) { triggered = true; break; }
                }
            }
            if (triggered) { b.ignited = true; playSound(sounds.explosion); }
        } else {
            b.fuse--; if (b.fuse <= 0) { bombs.splice(i, 1); triggerExplosion(b.x, b.y); }
        }
    }
    zombies.forEach((z, idx) => {
        // Decrement flash frames countdown
        if (z.flashTimer > 0) z.flashTimer--;

        let ang = Math.atan2(player.y-z.y, player.x-z.x);
        let vx = Math.cos(ang) * z.speed, vy = Math.sin(ang) * z.speed;
        let canMoveX = !checkBuildingCol(z.x + vx, z.y, z.radius);
        let canMoveY = !checkBuildingCol(z.x, z.y + vy, z.radius);
        if (canMoveX && canMoveY) { z.x += vx; z.y += vy; }
        else if (canMoveX && !canMoveY) { z.x += vx; z.x += (vx >= 0 ? z.speed : -z.speed) * 0.5; }
        else if (!canMoveX && canMoveY) { z.y += vy; z.y += (vy >= 0 ? z.speed : -z.speed) * 0.5; }
        else { z.x += (Math.random() - 0.5) * z.speed; z.y += (Math.random() - 0.5) * z.speed; }
        if(Math.hypot(player.x-z.x, player.y-z.y) < player.radius + z.radius) {
            if(player.shieldTimer <= 0) {
                player.hp -= z.isBoss ? 0.4 : 0.15;
                if(biteSoundTimer <= 0) { playSound(sounds.bite); biteSoundTimer = 35; }
                if(player.hp <= 0) endGame("You Were Eaten!");
            }
        }
        for (let j = idx + 1; j < zombies.length; j++) {
            let other = zombies[j];
            let dx = other.x - z.x, dy = other.y - z.y;
            let dist = Math.hypot(dx, dy), minDist = z.radius + other.radius;
            if (dist < minDist) {
                if (dist === 0) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = Math.hypot(dx, dy); }
                let overlap = minDist - dist;
                let pushX = (dx / dist) * overlap * 0.5, pushY = (dy / dist) * overlap * 0.5;
                if(!checkBuildingCol(z.x - pushX, z.y, z.radius)) z.x -= pushX;
                if(!checkBuildingCol(z.x, z.y - pushY, z.radius)) z.y -= pushY;
                if(!checkBuildingCol(other.x + pushX, other.y, other.radius)) other.x += pushX;
                if(!checkBuildingCol(other.x, other.y + pushY, other.radius)) other.x += pushY;
            }
        }
    });
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i]; b.x += b.dx; b.y += b.dy; let hit = false;
        for (let j = zombies.length - 1; j >= 0; j--) {
            let z = zombies[j];
            if (Math.hypot(b.x - z.x, b.y - z.y) < z.radius) { 
                z.hp -= 5; 
                z.flashTimer = 4; // Flash white for 4 rendering frames
                spawnBlood(b.x, b.y, 4); 
                hit = true; 
                break; 
            }
        }
        if (hit) bullets.splice(i, 1);
        else if (checkBuildingCol(b.x, b.y, 2) || b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) bullets.splice(i, 1);
    }
    for (let i = zombies.length - 1; i >= 0; i--) {
        if (zombies[i].hp <= 0) { spawnBlood(zombies[i].x, zombies[i].y, 12); zombies.splice(i, 1); }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; p.x += p.dx; p.y += p.dy; p.alpha -= p.decay; if (p.alpha <= 0) particles.splice(i, 1);
    }
    if(screenShake > 0) screenShake *= 0.9;
    for (let i = explosions.length - 1; i >= 0; i--) {
        let e = explosions[i]; e.r += 5; e.timer--; if (e.timer <= 0) explosions.splice(i, 1);
    }

    if (gameState === 'PLAYING') {
        if (waveTimer > 0) {
            waveTimer--;
        }
        if (zombies.length === 0 || waveTimer <= 0) {
            wave++;
            startWave();
        }
    }
    updateHUD();
}

// --- 6. DRAW ---
function draw() {
    ctx.save();
    if(screenShake > 0.5) ctx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake);
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    buildings.forEach(b => {
        ctx.fillStyle = '#3e3e3e'; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(b.x + b.w - 10, b.y, 10, b.h); ctx.fillRect(b.x, b.y + b.h - 10, b.w, 10);
        ctx.fillStyle = '#1a2a3a';
        for(let wx = b.x + 15; wx < b.x + b.w - 15; wx += 25) {
            for(let wy = b.y + 15; wy < b.y + b.h - 15; wy += 25) {
                ctx.fillRect(wx, wy, 12, 12);
                ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(wx+1, wy+1, 3, 3); ctx.fillStyle = '#1a2a3a';
            }
        }
    });
    bombs.forEach(b => {
        ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2);
        if (b.ignited && Math.floor(b.fuse / 4) % 2 === 0) ctx.fillStyle = '#ff3333'; else ctx.fillStyle = '#111';
        ctx.fill(); ctx.fillStyle = '#ff3333'; ctx.fillRect(b.x - 2, b.y - 14, 4, 6);
    });
    medkits.forEach(m => {
        ctx.fillStyle = '#fff'; ctx.fillRect(m.x - 12, m.y - 12, 24, 24);
        ctx.fillStyle = '#ff3333'; ctx.fillRect(m.x - 3, m.y - 9, 6, 18); ctx.fillRect(m.x - 9, m.y - 3, 18, 6);
    });
    powerups.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = p.type === 'shield' ? 'cyan' : p.type === 'speed' ? 'magenta' : 'gold';
        ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        if (p.type === 'shield') {
            ctx.fillRect(p.x - 4, p.y - 1.5, 8, 3); ctx.fillRect(p.x - 1.5, p.y - 4, 3, 8);
        } else if (p.type === 'speed') {
            ctx.beginPath(); ctx.moveTo(p.x - 3, p.y - 3); ctx.lineTo(p.x + 1, p.y); ctx.lineTo(p.x - 3, p.y + 3);
            ctx.moveTo(p.x + 1, p.y - 3); ctx.lineTo(p.x + 5, p.y); ctx.lineTo(p.x + 1, p.y + 3); ctx.lineWidth = 2; ctx.stroke();
        } else {
            ctx.fillRect(p.x - 4.5, p.y - 3, 2, 6); ctx.fillRect(p.x - 1, p.y - 3, 2, 6); ctx.fillRect(p.x + 2.5, p.y - 3, 2, 6);
        }
    });
    zombies.forEach(z => {
        ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        
        // Flash Engine Processing Assignment
        if (z.flashTimer > 0) {
            ctx.fillStyle = '#ffffff'; // Fill absolute white on impact frame
        } else {
            ctx.fillStyle = z.isBoss ? '#27ae60' : '#4E704D';
        }
        
        ctx.fill(); ctx.strokeStyle = '#1e3f20'; ctx.lineWidth = 2; ctx.stroke();
        let ang = Math.atan2(player.y - z.y, player.x - z.x); ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(z.x + Math.cos(ang + 0.3) * (z.radius * 0.5), z.y + Math.sin(ang + 0.3) * (z.radius * 0.5), 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(z.x + Math.cos(ang - 0.3) * (z.radius * 0.5), z.y + Math.sin(ang - 0.3) * (z.radius * 0.5), 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle='red'; ctx.fillRect(z.x-15, z.y-z.radius-10, 30, 4);
        ctx.fillStyle='green'; ctx.fillRect(z.x-15, z.y-z.radius-10, 30 * (Math.max(0, z.hp) / z.maxHp), 4);
    });
    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.alpha); ctx.fillStyle = 'rgba(180, 0, 0, 1)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1.0; ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle);
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(0, -4, player.radius + 12, 8);
    ctx.beginPath(); ctx.arc(0, 0, player.radius, 0, Math.PI * 2); ctx.fillStyle = '#3498db'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    if(player.shieldTimer > 0) { ctx.beginPath(); ctx.arc(player.x, player.y, 25, 0, Math.PI*2); ctx.strokeStyle='cyan'; ctx.lineWidth = 3; ctx.stroke(); }
    
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff0044'; 
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    });

    explosions.forEach(e => { ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fillStyle=`rgba(255,100,0,${e.timer/20})`; ctx.fill(); });
    ctx.restore();
}

// --- 7. UTILS & SYSTEM ---
function spawnItem(type) {
    let rx, ry, s=0; let placed = false;
    while (s < 50) {
        rx = Math.random() * (canvas.width - 120) + 60; ry = Math.random() * (canvas.height - 120) + 60;
        if (!checkBuildingCol(rx, ry, 20) && !checkItemCol(rx, ry, 20)) { placed = true; break; } s++;
    }
    if (!placed) { rx = canvas.width / 2 + (Math.random() - 0.5) * 150; ry = canvas.height / 2 + (Math.random() - 0.5) * 150; }
    if(type==='bomb') bombs.push({x:rx, y:ry, ignited: false, fuse: 45});
    else if(type==='medkit') medkits.push({x:rx, y:ry});
    else powerups.push({x:rx, y:ry, type:['shield','speed','ammo'][Math.floor(Math.random()*3)]});
}

function updateHUD() {
    const hpPct = Math.max(0, Math.min(100, player.hp));
    const barFillElement = document.getElementById('hpBarFill');
    if (barFillElement) {
        barFillElement.style.width = `${hpPct}%`;
        if (hpPct < 30) {
            barFillElement.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
        } else {
            barFillElement.style.background = 'linear-gradient(90deg, #2ecc71, #27ae60)';
        }
    }

    const hpTextElement = document.getElementById('hpText');
    if (hpTextElement) {
        hpTextElement.innerText = `HP: ${Math.ceil(player.hp)}/100`;
    }

    document.getElementById('ammoDisplay').innerText = (player.isReloading) ? "RELOADING..." : (player.ammoTimer > 0 ? "INF AMMO" : `AMMO: ${player.ammo}/10`);
    
    // Digital Countdown Timer Interface Formatting Engine
    const totalSeconds = Math.max(0, Math.ceil(waveTimer / 60));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    
    const timerElement = document.getElementById('timerDisplay');
    if (timerElement) {
        timerElement.innerText = `${formattedMinutes}:${formattedSeconds}`;
    }

    document.getElementById('highScoreDisplay').innerText = `Best Wave: ${highWave}`;
    document.getElementById('waveDisplay').innerText = `Wave: ${wave}`;
}

function startWave() {
    if (wave > highWave) { highWave = wave; localStorage.setItem('highWave', highWave); }
    
    waveTimer = WAVE_DURATION * 60;

    for(let i=0; i<wave+2; i++) {
        let edge = Math.floor(Math.random() * 4); let zx, zy;
        if (edge === 0) { zx = Math.random() * canvas.width; zy = -50; }
        else if (edge === 1) { zx = canvas.width + 50; zy = Math.random() * canvas.height; }
        else if (edge === 2) { zx = Math.random() * canvas.width; zy = canvas.height + 50; }
        else { zx = -50; zy = Math.random() * canvas.height; }
        zombies.push({ x: zx, y: zy, hp: 15, maxHp: 15, speed: 1.2+(wave*0.05), radius: 15, isBoss: false, flashTimer: 0 });
    }
    if(wave%5===0) {
        let edge = Math.floor(Math.random() * 4); let bx, by;
        if (edge === 0) { bx = Math.random() * canvas.width; by = -100; }
        else if (edge === 1) { bx = canvas.width + 100; by = Math.random() * canvas.height; }
        else if (edge === 2) { bx = Math.random() * canvas.width; by = canvas.height + 100; }
        else { bx = -100; by = Math.random() * canvas.height; }
        zombies.push({ x: bx, y: by, hp: 100, maxHp: 100, speed: 0.8, radius: 30, isBoss: true, flashTimer: 0 });
    }
}

function startGame() {
    gameState = 'PLAYING'; wave = 1; isPaused = false; player.hp = 100; player.ammo = 10;
    zombies = []; bullets = []; bombs = []; powerups = []; medkits = []; particles = []; explosions = [];
    
    waveTimer = WAVE_DURATION * 60;

    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('endScreen').classList.add('hidden');
    document.getElementById('pauseScreen').classList.add('hidden');
    
    setControlVisibility(true);
    
    sounds.bgMusic.play(); startWave(); gameLoop();
}

function endGame(msg) {
    gameState = 'END'; 
    document.getElementById('endScreen').classList.remove('hidden');
    document.getElementById('endTitle').innerText = msg; 
    
    setControlVisibility(false);
    
    sounds.bgMusic.pause(); playSound(sounds.death);
}

function gameLoop() {
    if(gameState === 'PLAYING' && !isPaused) {
        update(); draw(); animationId = requestAnimationFrame(gameLoop);
    }
}

// --- 8. CONTROLS ---
window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); if(k in keys) keys[k] = true;
    if(e.key === ' ') shoot(); if(k === 'r' || k === 'g') reload(); if(k === 'p') togglePause();
});

window.addEventListener('keyup', e => { if(e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousedown', shoot);
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', togglePause);

document.getElementById('pauseBtn').addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
document.getElementById('pauseBtn').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); togglePause(); });

function bindTouch(id, k) {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('touchstart', e => { e.preventDefault(); if(k==='fire') shoot(); else if(k==='reload') reload(); else keys[k]=true; });
    el.addEventListener('touchend', e => { if(k!=='fire' && k!=='reload') keys[k]=false; });
}
['w','a','s','d'].forEach(k => bindTouch('btn'+k.toUpperCase(), k));
bindTouch('btnFire', 'fire'); bindTouch('btnReload', 'reload');

window.addEventListener('load', () => {
    window.addEventListener('resize', resize); resize(); 
    setControlVisibility(false);
    updateHUD();
});
