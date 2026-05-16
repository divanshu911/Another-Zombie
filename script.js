const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 1. STATE & PERSISTENCE ---
let gameState = 'START';
let wave = 1;
let animationId;
let screenShake = 0; 
let biteSoundTimer = 0; 
let highWave = localStorage.getItem('highWave') || 1;

let grassPattern; 

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
sounds.bgMusic.volume = 0.3;

function playSound(audio) { audio.currentTime = 0; audio.play().catch(() => {}); }

// --- 3. ENGINE & WORLD ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    generateBuildings(); 
    createGrassPattern(); 
}

function createGrassPattern() {
    const grassCanvas = document.createElement('canvas');
    grassCanvas.width = 100; grassCanvas.height = 100;
    const gCtx = grassCanvas.getContext('2d');
    gCtx.fillStyle = '#2d5a27'; 
    gCtx.fillRect(0, 0, 100, 100);
    gCtx.strokeStyle = '#244d1f'; 
    for(let i = 0; i < 40; i++) {
        let x = Math.random() * 100, y = Math.random() * 100;
        gCtx.beginPath(); gCtx.moveTo(x, y);
        gCtx.lineTo(x + (Math.random()-0.5)*2, y - 4);
        gCtx.stroke();
    }
    grassPattern = ctx.createPattern(grassCanvas, 'repeat');
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

function spawnBlood(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, 
            y: y, 
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
    if(player.isReloading || gameState !== 'PLAYING') return;
    if(player.ammo > 0 || player.ammoTimer > 0) {
        if(player.ammoTimer <= 0) player.ammo--;
        bullets.push({ x: player.x, y: player.y, dx: Math.cos(player.angle)*12, dy: Math.sin(player.angle)*12 });
        playSound(sounds.shoot); updateHUD();
    } else {
        playSound(sounds.empty);
    }
}

function reload() {
    if(player.isReloading || player.ammo === player.maxAmmo) return;
    player.isReloading = true; playSound(sounds.reload); updateHUD();
    setTimeout(() => { if(gameState === 'PLAYING') { player.ammo = player.maxAmmo; player.isReloading = false; updateHUD(); } }, 1200);
}

function triggerExplosion(x, y) {
    playSound(sounds.explosion);
    screenShake = 15;
    explosions.push({ x, y, r: 10, maxR: 140, timer: 20 });
    spawnBlood(x, y, 25);
    if (player.shieldTimer <= 0 && Math.hypot(player.x - x, player.y - y) < 140) player.hp -= 40;
    
    for (let i = zombies.length - 1; i >= 0; i--) {
        let z = zombies[i];
        if (Math.hypot(z.x - x, z.y - y) < 140) {
            z.hp -= 100;
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
        if(!checkBuildingCol(nx, player.y, player.radius)) player.x = Math.max(15, Math.min(canvas.width-15, nx));
        if(!checkBuildingCol(player.x, ny, player.radius)) player.y = Math.max(15, Math.min(canvas.height-15, ny));
    }

    if(player.shieldTimer > 0) player.shieldTimer--;
    if(player.ammoTimer > 0) player.ammoTimer--;
    if(player.speedTimer > 0) { player.speedTimer--; if(player.speedTimer <= 0) player.speed = player.baseSpeed; }
    if(biteSoundTimer > 0) biteSoundTimer--;

    // Dynamic Spawners
    if(Math.random() < 0.005 && bombs.length < 3) spawnItem('bomb');
    if(Math.random() < 0.005 && medkits.length < 2) spawnItem('medkit');
    if(Math.random() < 0.008 && powerups.length < 3) spawnItem('powerup');

    // Pickups loops - Medkits
    for (let i = medkits.length - 1; i >= 0; i--) {
        if (Math.hypot(player.x - medkits[i].x, player.y - medkits[i].y) < 30) {
            player.hp = Math.min(100, player.hp + 30); 
            medkits.splice(i, 1); 
            playSound(sounds.powerup); 
            updateHUD();
        }
    }
    
    // Pickups loops - Powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
        let p = powerups[i];
        if (Math.hypot(player.x - p.x, player.y - p.y) < 30) {
            if (p.type === 'shield') player.shieldTimer = 600;
            if (p.type === 'speed') { player.speed = 4.5; player.speedTimer = 420; }
            if (p.type === 'ammo') player.ammoTimer = 600;
            powerups.splice(i, 1); 
            playSound(sounds.powerup); 
            updateHUD();
        }
    }

    // ADDED: Pickups loops - Bombs Detonation Activation Logic
    for (let i = bombs.length - 1; i >= 0; i--) {
        let b = bombs[i];
        if (Math.hypot(player.x - b.x, player.y - b.y) < 30) {
            bombs.splice(i, 1); 
            triggerExplosion(b.x, b.y);
        }
    }

    // Zombie AI Movement, Bites, and Zombie-to-Zombie Collision Physics
    zombies.forEach((z, idx) => {
        let ang = Math.atan2(player.y-z.y, player.x-z.x);
        let vx = Math.cos(ang) * z.speed, vy = Math.sin(ang) * z.speed;
        if(!checkBuildingCol(z.x + vx, z.y, z.radius)) z.x += vx;
        if(!checkBuildingCol(z.x, z.y + vy, z.radius)) z.y += vy;
        
        // Player contact damage check
        if(Math.hypot(player.x-z.x, player.y-z.y) < player.radius + z.radius) {
            if(player.shieldTimer <= 0) {
                player.hp -= z.isBoss ? 0.4 : 0.15;
                if(biteSoundTimer <= 0) { playSound(sounds.bite); biteSoundTimer = 35; }
                if(player.hp <= 0) endGame("You Were Eaten!");
            }
        }

        // Zombie-to-Zombie Collision Resolution Logic
        for (let j = idx + 1; j < zombies.length; j++) {
            let other = zombies[j];
            let dx = other.x - z.x;
            let dy = other.y - z.y;
            let dist = Math.hypot(dx, dy);
            let minDist = z.radius + other.radius;

            if (dist < minDist) {
                if (dist === 0) {
                    dx = Math.random() - 0.5;
                    dy = Math.random() - 0.5;
                    dist = Math.hypot(dx, dy);
                }
                
                let overlap = minDist - dist;
                let pushX = (dx / dist) * overlap * 0.5;
                let pushY = (dy / dist) * overlap * 0.5;

                if(!checkBuildingCol(z.x - pushX, z.y, z.radius)) z.x -= pushX;
                if(!checkBuildingCol(z.x, z.y - pushY, z.radius)) z.y -= pushY;
                if(!checkBuildingCol(other.x + pushX, other.y, other.radius)) other.x += pushX;
                if(!checkBuildingCol(other.x, other.y + pushY, other.radius)) other.y += pushY;
            }
        }
    });

    // Core Bullet Hit Verification and Particle Triggering
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.dx; b.y += b.dy;
        let hit = false;
        
        for (let j = zombies.length - 1; j >= 0; j--) {
            let z = zombies[j];
            if (Math.hypot(b.x - z.x, b.y - z.y) < z.radius) {
                z.hp -= 5;
                spawnBlood(b.x, b.y, 4); 
                hit = true;
                break; 
            }
        }
        
        if (hit) {
            bullets.splice(i, 1);
        } else if (checkBuildingCol(b.x, b.y, 2) || b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
        }
    }

    // Safely remove dead targets and spawn impact burst locally
    for (let i = zombies.length - 1; i >= 0; i--) {
        if (zombies[i].hp <= 0) {
            spawnBlood(zombies[i].x, zombies[i].y, 12);
            zombies.splice(i, 1);
        }
    }

    // Short-lived Particles Processing Engine
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.dx; p.y += p.dy; p.alpha -= p.decay; 
        if (p.alpha <= 0) { 
            particles.splice(i, 1); 
        }
    }

    if(screenShake > 0) screenShake *= 0.9;
    for (let i = explosions.length - 1; i >= 0; i--) {
        let e = explosions[i];
        e.r += 5; e.timer--; 
        if (e.timer <= 0) explosions.splice(i, 1);
    }
    
    if(zombies.length === 0 && gameState === 'PLAYING') { wave++; startWave(); }
    updateHUD();
}

// --- 6. DRAW ---
function draw() {
    ctx.save();
    if(screenShake > 0.5) ctx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake);

    // 1. Grass Texture base
    ctx.fillStyle = grassPattern; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Detailed Building Geometry
    buildings.forEach(b => {
        ctx.fillStyle = '#3e3e3e'; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(b.x + b.w - 10, b.y, 10, b.h); ctx.fillRect(b.x, b.y + b.h - 10, b.w, 10);
        
        ctx.fillStyle = '#1a2a3a'; 
        for(let wx = b.x + 15; wx < b.x + b.w - 15; wx += 25) {
            for(let wy = b.y + 15; wy < b.y + b.h - 15; wy += 25) {
                ctx.fillRect(wx, wy, 12, 12);
                ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(wx+1, wy+1, 3, 3);
                ctx.fillStyle = '#1a2a3a';
            }
        }
    });

    // 3. Drop Collectibles
    ctx.textAlign = 'center'; ctx.font = '24px Arial';
    bombs.forEach(b => ctx.fillText('馃挘', b.x, b.y + 8));
    medkits.forEach(m => ctx.fillText('馃拪', m.x, m.y + 8));
    powerups.forEach(p => ctx.fillText(p.type==='shield'?'馃洝锔�':p.type==='speed'?'鈿�':'猸�', p.x, p.y + 8));
    
    // 4. Enemy Rendering with Capped Non-Negative Health Bar
    zombies.forEach(z => {
        ctx.font = z.isBoss ? '40px Arial' : '28px Arial'; ctx.fillText('馃', z.x, z.y + 10);
        ctx.fillStyle='red'; ctx.fillRect(z.x-15, z.y-25, 30, 4);
        
        ctx.fillStyle='green'; 
        ctx.fillRect(z.x-15, z.y-25, 30 * (Math.max(0, z.hp) / z.maxHp), 4);
    });

    // 5. Short-lived Blood Particles Rendering Layer
    particles.forEach(p => { 
        ctx.globalAlpha = Math.max(0, p.alpha); ctx.fillStyle = 'rgba(180, 0, 0, 1)'; 
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill(); 
    });
    ctx.globalAlpha = 1.0; 

    // 6. Player Geometry Layout
    ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle + Math.PI/2);
    ctx.font = '32px Arial'; ctx.fillText('馃敽', 0, 12); ctx.restore();
    if(player.shieldTimer > 0) { ctx.beginPath(); ctx.arc(player.x, player.y, 25, 0, Math.PI*2); ctx.strokeStyle='cyan'; ctx.lineWidth = 3; ctx.stroke(); }
    
    ctx.fillStyle='yellow'; bullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill(); });
    explosions.forEach(e => { ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fillStyle=`rgba(255,100,0,${e.timer/20})`; ctx.fill(); });

    ctx.restore();
}

// --- 7. UTILS & SYSTEM ---
function spawnItem(type) {
    let rx, ry, s=0;
    let placed = false;
    
    while (s < 50) {
        rx = Math.random() * (canvas.width - 120) + 60;
        ry = Math.random() * (canvas.height - 120) + 60;
        if (!checkBuildingCol(rx, ry, 20)) {
            placed = true;
            break;
        }
        s++;
    }
    
    if (!placed) {
        rx = canvas.width / 2 + (Math.random() - 0.5) * 150;
        ry = canvas.height / 2 + (Math.random() - 0.5) * 150;
    }

    if(type==='bomb') bombs.push({x:rx, y:ry});
    else if(type==='medkit') medkits.push({x:rx, y:ry});
    else powerups.push({x:rx, y:ry, type:['shield','speed','ammo'][Math.floor(Math.random()*3)]});
}

function updateHUD() {
    document.getElementById('hpDisplay').innerText = `HP: ${Math.ceil(player.hp)}/100`;
    document.getElementById('ammoDisplay').innerText = (player.isReloading) ? "RELOADING..." : (player.ammoTimer > 0 ? "INF AMMO" : `AMMO: ${player.ammo}/10`);
    document.getElementById('highScoreDisplay').innerText = `Best Wave: ${highWave}`;
    document.getElementById('waveDisplay').innerText = `Wave: ${wave}`;
}

function startWave() {
    if (wave > highWave) { highWave = wave; localStorage.setItem('highWave', highWave); }
    for(let i=0; i<wave+2; i++) {
        zombies.push({ x: Math.random()*canvas.width, y: -50, hp: 15, maxHp: 15, speed: 0.8+(wave*0.05), radius: 15, isBoss: false });
    }
    if(wave%5===0) zombies.push({ x: canvas.width/2, y: -100, hp: 100, maxHp: 100, speed: 0.5, radius: 30, isBoss: true });
}

function startGame() {
    gameState = 'PLAYING'; wave = 1;
    player.hp = 100; player.ammo = 10;
    zombies = []; bullets = []; bombs = []; powerups = []; medkits = []; particles = []; explosions = [];
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('endScreen').classList.add('hidden');
    sounds.bgMusic.play();
    startWave(); gameLoop();
}

function endGame(msg) {
    gameState = 'END'; document.getElementById('endScreen').classList.remove('hidden');
    document.getElementById('endTitle').innerText = msg; sounds.bgMusic.pause(); playSound(sounds.death);
}

function gameLoop() { if(gameState === 'PLAYING') { update(); draw(); animationId = requestAnimationFrame(gameLoop); } }

// --- 8. CONTROLS ---
window.addEventListener('keydown', e => { 
    const k = e.key.toLowerCase(); if(k in keys) keys[k] = true;
    if(e.key === ' ') shoot(); if(k === 'r' || k === 'g') reload();
});
window.addEventListener('keyup', e => { if(e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousedown', shoot);
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

function bindTouch(id, k) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => { e.preventDefault(); if(k==='fire') shoot(); else if(k==='reload') reload(); else keys[k]=true; });
    el.addEventListener('touchend', e => { if(k!=='fire' && k!=='reload') keys[k]=false; });
}
['w','a','s','d'].forEach(k => bindTouch('btn'+k.toUpperCase(), k));
bindTouch('btnFire', 'fire'); bindTouch('btnReload', 'reload');

window.addEventListener('resize', resize);
resize();
