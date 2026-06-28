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

// Economy and Upgrades Persistence
let coins = parseInt(localStorage.getItem('zombieCoins')) || 0;
let upgrades = JSON.parse(localStorage.getItem('zombieUpgrades')) || { health: 0, ammo: 0, speed: 0, bonusHealth: 0, piercing: 0, reloadDelay: 0 };
upgrades.health = upgrades.health || 0;
upgrades.ammo = upgrades.ammo || 0;
upgrades.speed = upgrades.speed || 0;
upgrades.bonusHealth = upgrades.bonusHealth || 0;
upgrades.piercing = upgrades.piercing || 0;
upgrades.reloadDelay = upgrades.reloadDelay || 0;

const UPGRADE_BASE_COST = { health: 150, ammo: 120, speed: 160, bonusHealth: 250, piercing: 220, reloadDelay: 280 };
let waveTimer = 0;
const WAVE_DURATION = 30;

// --- ASSET LOADING ENGINE ---
let totalAssetsToLoad = 6; // 3 Maps + 3 Buildings
let currentlyLoaded = 0;

function checkAssetLoaded() {
    currentlyLoaded++;
    if (currentlyLoaded >= totalAssetsToLoad) {
        document.getElementById('loadingScreen').classList.add('hidden');
        document.getElementById('startScreen').classList.remove('hidden');
    }
}

// --- MAP SELECTOR ENGINE ---
const backgrounds = {
    grass: 'https://raw.githubusercontent.com/divanshu911/New-things/736c8aca12961f3145a8257b1efde09b8e704130/IMG_GRASS911.jpg',
    desert: 'https://raw.githubusercontent.com/divanshu911/New-things/refs/heads/main/IMG_Desert612.png',
    snow: 'https://raw.githubusercontent.com/divanshu911/New-things/refs/heads/main/IMG_Snow117.png'
}; // Added missing closing bracket here

const preloadedImages = {};
for (const key in backgrounds) {
    preloadedImages[key] = new Image();
    preloadedImages[key].onload = checkAssetLoaded;
    preloadedImages[key].onerror = checkAssetLoaded; // Proceed even if an image fails
    preloadedImages[key].src = backgrounds[key];
}

let bgImage = preloadedImages['grass'];

const buildingImages = [];
const buildingUrls = [
    'https://raw.githubusercontent.com/divanshu911/New-things/refs/heads/main/IMG_bluehouse6.jpg',
    'https://raw.githubusercontent.com/divanshu911/New-things/refs/heads/main/IMG_circle6_1.jpg',
    'https://raw.githubusercontent.com/divanshu911/New-things/refs/heads/main/IMG_vent_4.jpg'
]; // Added missing closing bracket here

buildingUrls.forEach(url => {
    let img = new Image();
    img.onload = checkAssetLoaded;
    img.onerror = checkAssetLoaded;
    img.src = url;
    buildingImages.push(img);
});

function selectBackground(bgKey) {
    if (!preloadedImages[bgKey]) return;
    bgImage = preloadedImages[bgKey];
    localStorage.setItem('selectedBg', bgKey);
    
    document.querySelectorAll('.map-btn').forEach(btn => {
        if (btn.classList.contains('map-' + bgKey)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

let savedBg = localStorage.getItem('selectedBg') || 'grass';
selectBackground(savedBg);

// Arrays & Input
let bullets = [], zombies = [], buildings = [], medkits = [], powerups = [], bombs = [], explosions = [], particles = [], floatingTexts = [];
const keys = { w: false, a: false, s: false, d: false };

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
}; // Add closing bracket

sounds.bgMusic.loop = true;
sounds.bgMusic.volume = 0.9;

function playSound(audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

// --- 3. ES6 CLASSES ---
class GameObject {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
    }
}

class Player extends GameObject {
    constructor(x, y) {
        super(x, y, 15);
        this.baseSpeed = 2.5; this.speed = 2.5; this.angle = 0;
        this.hp = 100; this.maxHp = 100; this.ammo = 10; this.maxAmmo = 10;
        this.isReloading = false;
        this.ammoTimer = 0; this.shieldTimer = 0; this.speedTimer = 0; this.freezeTimer = 0; this.reloadTimer = 0;
    }
    applyUpgrades() {
        this.maxHp = 100 + (upgrades.health * 20);
        this.maxAmmo = 10 + (upgrades.ammo * 2);
        this.baseSpeed = 2.5 + (upgrades.speed * 0.3);
    }
    update() {
        let mx = 0, my = 0;
        if(keys.w) my -= 1; if(keys.s) my += 1;
        if(keys.a) mx -= 1; if(keys.d) mx += 1;
        
        if(mx !== 0 || my !== 0) {
            this.angle = Math.atan2(my, mx);
            let s = (mx!==0 && my!==0) ? this.speed * 0.707 : this.speed;
            let nx = this.x + mx * s, ny = this.y + my * s;
            let canMoveX = !checkBuildingCol(nx, this.y, this.radius);
            let canMoveY = !checkBuildingCol(this.x, ny, this.radius);
            if (canMoveX) this.x = nx;
            if (canMoveY) this.y = ny;
            
            if (!canMoveY && canMoveX && mx === 0) {
                let leftClear = !checkBuildingCol(this.x - 5, this.y, this.radius);
                let rightClear = !checkBuildingCol(this.x + 5, this.y, this.radius);
                if (leftClear && !rightClear) this.x -= this.speed * 0.8;
                else if (rightClear && !leftClear) this.x += this.speed * 0.8;
            }
            if (!canMoveX && canMoveY && my === 0) {
                let upClear = !checkBuildingCol(this.x, this.y - 5, this.radius);
                let downClear = !checkBuildingCol(this.x, this.y + 5, this.radius);
                if (upClear && !downClear) this.y -= this.speed * 0.8;
                else if (downClear && !upClear) this.y += this.speed * 0.8;
            }
            this.x = Math.max(15, Math.min(canvas.width-15, this.x));
            this.y = Math.max(15, Math.min(canvas.height-15, this.y));
        }
        if(this.shieldTimer > 0) this.shieldTimer--;
        if(this.ammoTimer > 0) this.ammoTimer--;
        if(this.speedTimer > 0) { this.speedTimer--; if(this.speedTimer <= 0) this.speed = this.baseSpeed; }
        if(this.freezeTimer > 0) this.freezeTimer--;
        
        if(this.isReloading) {
            if(this.reloadTimer > 0) {
                this.reloadTimer--;
            } else {
                this.ammo = this.maxAmmo;
                this.isReloading = false;
                updateHUD();
            }
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#2c3e50'; ctx.fillRect(0, -4, this.radius + 12, 8);
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#3498db'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        if(this.shieldTimer > 0) {
            ctx.beginPath(); ctx.arc(this.x, this.y, 25, 0, Math.PI*2);
            ctx.strokeStyle='cyan'; ctx.lineWidth = 3; ctx.stroke();
        }
    }
}

class Zombie extends GameObject {
    constructor(x, y, isBoss, wave) {
        let speed = isBoss ? 0.8 : Math.min(1.90, 1.2 + (wave * 0.05));
        let radius = isBoss ? 30 : 15;
        super(x, y, radius);
        this.hp = isBoss ? 100 : 15;
        this.maxHp = this.hp;
        this.speed = speed;
        this.isBoss = isBoss;
        this.flashTimer = 0;
    }
    update(target) {
        if (this.flashTimer > 0) this.flashTimer--;
        let ang = Math.atan2(target.y - this.y, target.x - this.x);
        let currentSpeed = target.freezeTimer > 0 ? 0 : this.speed;
        let vx = Math.cos(ang) * currentSpeed, vy = Math.sin(ang) * currentSpeed;
        
        if (currentSpeed > 0) {
            let canMoveX = !checkBuildingCol(this.x + vx, this.y, this.radius);
            let canMoveY = !checkBuildingCol(this.x, this.y + vy, this.radius);
            if (canMoveX && canMoveY) { this.x += vx; this.y += vy; }
            else if (canMoveX && !canMoveY) { this.x += vx; this.x += (vx >= 0 ? currentSpeed : -currentSpeed) * 0.5; }
            else if (!canMoveX && canMoveY) { this.y += vy; this.y += (vy >= 0 ? currentSpeed : -currentSpeed) * 0.5; }
            else { this.x += (Math.random() - 0.5) * currentSpeed; this.y += (Math.random() - 0.5) * currentSpeed; }
        }
    }
    draw(ctx, target) {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = target.freezeTimer > 0 ? '#a5f2ff' : (this.isBoss ? '#27ae60' : '#4E704D');
        ctx.fill(); ctx.strokeStyle = target.freezeTimer > 0 ? '#4ba3e3' : '#1e3f20'; ctx.lineWidth = 2; ctx.stroke();
        
        let ang = Math.atan2(target.y - this.y, target.x - this.x);
        ctx.fillStyle = target.freezeTimer > 0 ? '#4ba3e3' : '#e74c3c';
        ctx.beginPath(); ctx.arc(this.x + Math.cos(ang + 0.3) * (this.radius * 0.5), this.y + Math.sin(ang + 0.3) * (this.radius * 0.5), 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.x + Math.cos(ang - 0.3) * (this.radius * 0.5), this.y + Math.sin(ang - 0.3) * (this.radius * 0.5), 2.5, 0, Math.PI * 2); ctx.fill();
        
        ctx.fillStyle='red'; ctx.fillRect(this.x-15, this.y-this.radius-10, 30, 4);
        ctx.fillStyle='green'; ctx.fillRect(this.x-15, this.y-this.radius-10, 30 * (Math.max(0, this.hp) / this.maxHp), 4);
    }
}

class Bullet {
    constructor(x, y, angle) {
        this.x = x; this.y = y;
        this.dx = Math.cos(angle) * 12;
        this.dy = Math.sin(angle) * 12;
        this.hitZombies = [];
    }
    update() {
        this.x += this.dx; this.y += this.dy;
    }
    draw(ctx) {
        ctx.beginPath(); ctx.arc(this.x, this.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#ff0044'; ctx.fill();
        ctx.beginPath(); ctx.arc(this.x, this.y, 2, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    }
}

class Bomb {
    constructor(x, y) {
        this.x = x; this.y = y; this.ignited = false; this.fuse = 45;
    }
    draw(ctx) {
        ctx.beginPath(); ctx.arc(this.x, this.y, 10, 0, Math.PI * 2);
        if (this.ignited && Math.floor(this.fuse / 4) % 2 === 0) ctx.fillStyle = '#ff3333'; else ctx.fillStyle = '#111';
        ctx.fill(); ctx.fillStyle = '#ff3333'; ctx.fillRect(this.x - 2, this.y - 14, 4, 6);
    }
}

class Medkit {
    constructor(x, y) {
        this.x = x; this.y = y;
    }
    draw(ctx) {
        ctx.fillStyle = '#fff'; ctx.fillRect(this.x - 12, this.y - 12, 24, 24);
        ctx.fillStyle = '#ff3333'; ctx.fillRect(this.x - 3, this.y - 9, 6, 18); ctx.fillRect(this.x - 9, this.y - 3, 18, 6);
    }
}

class Powerup {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
    }
    draw(ctx) {
        ctx.beginPath(); ctx.arc(this.x, this.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = this.type === 'shield' ? 'cyan' : this.type === 'speed' ? 'magenta' : this.type === 'ammo' ? 'gold' : '#0055ff';
        ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        if (this.type === 'shield') {
            ctx.fillRect(this.x - 4, this.y - 1.5, 8, 3); ctx.fillRect(this.x - 1.5, this.y - 4, 3, 8);
        } else if (this.type === 'speed') {
            ctx.beginPath(); ctx.moveTo(this.x - 3, this.y - 3); ctx.lineTo(this.x + 1, this.y); ctx.lineTo(this.x - 3, this.y + 3);
            ctx.moveTo(this.x + 1, this.y - 3); ctx.lineTo(this.x + 5, this.y); ctx.lineTo(this.x + 1, this.y + 3); ctx.lineWidth = 2; ctx.stroke();
        } else if (this.type === 'ammo') {
            ctx.fillRect(this.x - 4.5, this.y - 3, 2, 6); ctx.fillRect(this.x - 1, this.y - 3, 2, 6); ctx.fillRect(this.x + 2.5, this.y - 3, 2, 6);
        } else if (this.type === 'freeze') {
            ctx.beginPath();
            ctx.moveTo(this.x - 5, this.y - 5); ctx.lineTo(this.x + 5, this.y + 5);
            ctx.moveTo(this.x + 5, this.y - 5); ctx.lineTo(this.x - 5, this.y + 5);
            ctx.moveTo(this.x, this.y - 6); ctx.lineTo(this.x, this.y + 6);
            ctx.moveTo(this.x - 6, this.y); ctx.lineTo(this.x + 6, this.y);
            ctx.lineWidth = 1.5; ctx.stroke();
        }
    }
}

class Particle {
    constructor(x, y, dx, dy, radius, decay) {
        this.x = x; this.y = y; this.dx = dx; this.dy = dy;
        this.radius = radius; this.alpha = 1; this.decay = decay;
    }
    update() {
        this.x += this.dx; this.y += this.dy; this.alpha -= this.decay;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.alpha); ctx.fillStyle = 'rgba(180, 0, 0, 1)';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill();
    }
}

class Explosion {
    constructor(x, y) {
        this.x = x; this.y = y; this.r = 10; this.maxR = 140; this.timer = 20;
    }
    update() {
        this.r += 5; this.timer--;
    }
    draw(ctx) {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,100,0,${this.timer/20})`; ctx.fill();
    }
}

class FloatingText {
    constructor(x, y, text) {
        this.x = x; this.y = y; this.text = text; this.alpha = 1.0;
    }
    update() {
        this.y -= 1; this.alpha -= 0.02;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.font = '900 24px "Segoe UI", Tahoma, sans-serif';
        ctx.lineWidth = 4; ctx.strokeStyle = '#000000'; ctx.strokeText(this.text, this.x - 15, this.y);
        ctx.fillStyle = '#ffd700'; ctx.fillText(this.text, this.x - 15, this.y);
    }
}

// Ensure player gets instantiated globally
const player = new Player(0, 0);
player.applyUpgrades();

// --- 4. ENGINE WORLD & SYSTEM ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    generateBuildings();
}

function generateBuildings() {
    const w = canvas.width, h = canvas.height;
    const bSize = Math.min(100, Math.max(50, w * 0.15));
    const pad = bSize;
    const centerY = h / 2 - bSize / 2;
    buildings = [
        { x: pad, y: centerY, w: bSize, h: bSize, img: buildingImages[0] },
        { x: w / 2 - bSize / 2, y: centerY, w: bSize, h: bSize, img: buildingImages[1] },
        { x: w - bSize - pad, y: centerY, w: bSize, h: bSize, img: buildingImages[2] }
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
        particles.push(new Particle(
            x, y,
            (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
            Math.random() * 2 + 1,
            Math.random() * 0.03 + 0.02
        ));
    }
}

// --- 5. GAME ACTIONS ---
function shoot() {
    if(player.isReloading || gameState !== 'PLAYING' || isPaused) return;
    if(player.ammo > 0 || player.ammoTimer > 0) {
        if(player.ammoTimer <= 0) player.ammo--;
        bullets.push(new Bullet(player.x, player.y, player.angle));
        playSound(sounds.shoot);
        updateHUD();
    } else {
        playSound(sounds.empty);
    }
}

function reload() {
    if(player.isReloading || player.ammo === player.maxAmmo || isPaused) return;
    player.isReloading = true;
    player.reloadTimer = 72 - (upgrades.reloadDelay * 6);
    playSound(sounds.reload);
    updateHUD();
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
        lastRenderTime = performance.now();
        if (animationId) cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(gameLoop);
    }
}

function triggerExplosion(x, y) {
    screenShake = 15;
    explosions.push(new Explosion(x, y));
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

// --- 6. UPDATE LOOP ---
function update() {
    player.update();
    if(biteSoundTimer > 0) biteSoundTimer--;
    
    if(Math.random() < 0.005 && bombs.length < 3) spawnItem('bomb');
    if(Math.random() < 0.005 && medkits.length < 2) spawnItem('medkit');
    if(Math.random() < 0.008 && powerups.length < 3) spawnItem('powerup');
    
    for (let i = medkits.length - 1; i >= 0; i--) {
        if (Math.hypot(player.x - medkits[i].x, player.y - medkits[i].y) < 30) {
            player.hp = Math.min(player.maxHp, player.hp + 30);
            medkits.splice(i, 1); playSound(sounds.powerup); updateHUD();
        }
    }
    for (let i = powerups.length - 1; i >= 0; i--) {
        let p = powerups[i];
        if (Math.hypot(player.x - p.x, player.y - p.y) < 30) {
            if (p.type === 'shield') player.shieldTimer = 600;
            if (p.type === 'speed') { player.speed = 4.5; player.speedTimer = 420; }
            if (p.type === 'ammo') player.ammoTimer = 600;
            if (p.type === 'freeze') player.freezeTimer = 720;
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
        z.update(player);
        if(Math.hypot(player.x - z.x, player.y - z.y) < player.radius + z.radius) {
            if(player.shieldTimer <= 0 && player.freezeTimer <= 0) {
                player.hp -= z.isBoss ? 0.4 : 0.15;
                if(biteSoundTimer <= 0) { playSound(sounds.bite); biteSoundTimer = 35; }
                if(player.hp <= 0) endGame("You Were Eaten!");
            }
        }
        if (player.freezeTimer <= 0) {
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
        }
    });
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.update();
        let hit = false;
        for (let j = zombies.length - 1; j >= 0; j--) {
            let z = zombies[j];
            if (Math.hypot(b.x - z.x, b.y - z.y) < z.radius && !b.hitZombies.includes(z)) {
                z.hp -= 5;
                spawnBlood(b.x, b.y, 4);
                b.hitZombies.push(z);
                let pierceChance = upgrades.piercing * 0.10;
                if (Math.random() >= pierceChance) {
                    hit = true; break;
                }
            }
        }
        if (hit) bullets.splice(i, 1);
        else if (checkBuildingCol(b.x, b.y, 2) || b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) bullets.splice(i, 1);
    }
    for (let i = zombies.length - 1; i >= 0; i--) {
        if (zombies[i].hp <= 0) {
            spawnBlood(zombies[i].x, zombies[i].y, 12);
            let reward = zombies[i].isBoss ? 30 : 5;
            coins += reward;
            localStorage.setItem('zombieCoins', coins);
            floatingTexts.push(new FloatingText(zombies[i].x, zombies[i].y, `+${reward}`));
            zombies.splice(i, 1);
        }
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].update();
        if (floatingTexts[i].alpha <= 0) floatingTexts.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].alpha <= 0) particles.splice(i, 1);
    }
    if(screenShake > 0) screenShake *= 0.9;
    for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].update();
        if (explosions[i].timer <= 0) explosions.splice(i, 1);
    }
    if (gameState === 'PLAYING') {
        if (waveTimer > 0 && player.freezeTimer <= 0) {
            waveTimer--;
        }
        if (zombies.length === 0 || waveTimer <= 0) {
            if (upgrades.bonusHealth > 0) {
                let healAmount = upgrades.bonusHealth * 10;
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                floatingTexts.push(new FloatingText(player.x, player.y - 20, `+${healAmount} HP`));
            }
            wave++;
            startWave();
        }
    }
    updateHUD();
}

// --- 7. DRAW ---
function draw() {
    ctx.save();
    if(screenShake > 0.5) ctx.translate((Math.random()-0.5)*screenShake, (Math.random()-0.5)*screenShake);
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    buildings.forEach(b => {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 8;
        ctx.shadowOffsetY = 15;
        if (b.img && b.img.complete) {
            ctx.drawImage(b.img, b.x, b.y, b.w, b.h);
        }
        ctx.restore();
    });
    bombs.forEach(b => b.draw(ctx));
    medkits.forEach(m => m.draw(ctx));
    powerups.forEach(p => p.draw(ctx));
    zombies.forEach(z => z.draw(ctx, player));
    particles.forEach(p => p.draw(ctx));
    floatingTexts.forEach(ft => ft.draw(ctx));
    ctx.globalAlpha = 1.0;
    player.draw(ctx);
    bullets.forEach(b => b.draw(ctx));
    explosions.forEach(e => e.draw(ctx));
    ctx.restore();
}

// --- 8. UTILS & SYSTEM ---
function spawnItem(type) {
    let rx, ry, s=0; let placed = false;
    while (s < 50) {
        rx = Math.random() * (canvas.width - 120) + 60; ry = Math.random() * (canvas.height - 120) + 60;
        if (!checkBuildingCol(rx, ry, 20) && !checkItemCol(rx, ry, 20)) { placed = true; break; } s++;
    }
    if (!placed) { rx = canvas.width / 2 + (Math.random() - 0.5) * 150; ry = canvas.height / 2 + (Math.random() - 0.5) * 150; }
    if(type==='bomb') bombs.push(new Bomb(rx, ry));
    else if(type==='medkit') medkits.push(new Medkit(rx, ry));
    else powerups.push(new Powerup(rx, ry, ['shield','speed','ammo','freeze'][Math.floor(Math.random()*4)]));
}

function updateHUD() {
    const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
    const barFillElement = document.getElementById('hpBarFill');
    if (barFillElement) {
        barFillElement.style.width = `${hpPct}%`;
        barFillElement.style.background = hpPct < 30 ? 'linear-gradient(90deg, #e74c3c, #c0392b)' : 'linear-gradient(90deg, #2ecc71, #27ae60)';
    }
    const hpTextElement = document.getElementById('hpText');
    if (hpTextElement) hpTextElement.innerText = `HP: ${Math.ceil(player.hp)}/${player.maxHp}`;
    document.getElementById('ammoDisplay').innerText = (player.isReloading) ? "RELOADING..." : (player.ammoTimer > 0 ? "INF AMMO" : `AMMO: ${player.ammo}/${player.maxAmmo}`);
    
    if(document.getElementById('coinDisplay')) {
        document.getElementById('coinDisplay').innerText = `🪙 ${coins}`;
    }
    const totalSeconds = Math.max(0, Math.ceil(waveTimer / 60));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timerElement = document.getElementById('timerDisplay');
    if (timerElement) {
        timerElement.innerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        if (player.freezeTimer > 0) {
            timerElement.style.backgroundColor = '#a5f2ff'; timerElement.style.color = '#0033aa';
            timerElement.style.boxShadow = '0 0 10px cyan'; timerElement.style.borderRadius = '5px'; timerElement.style.padding = '2px 8px';
        } else {
            timerElement.style.backgroundColor = 'transparent'; timerElement.style.color = '';
            timerElement.style.boxShadow = 'none'; timerElement.style.padding = '0';
        }
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
        zombies.push(new Zombie(zx, zy, false, wave));
    }
    if(wave % 5 === 0) {
        let edge = Math.floor(Math.random() * 4); let bx, by;
        if (edge === 0) { bx = Math.random() * canvas.width; by = -100; }
        else if (edge === 1) { bx = canvas.width + 100; by = Math.random() * canvas.height; }
        else if (edge === 2) { bx = Math.random() * canvas.width; by = canvas.height + 100; }
        else { bx = -100; by = Math.random() * canvas.height; }
        zombies.push(new Zombie(bx, by, true, wave));
    }
}

function startGame() {
    gameState = 'PLAYING'; wave = 1; isPaused = false;
    player.applyUpgrades();
    player.x = canvas.width / 2;
    player.y = canvas.height * 0.2;
    player.hp = player.maxHp; player.ammo = player.maxAmmo;
    player.shieldTimer = 0; player.speedTimer = 0; player.ammoTimer = 0; player.freezeTimer = 0; player.reloadTimer = 0;
    player.speed = player.baseSpeed; player.isReloading = false;
    zombies = []; bullets = []; bombs = []; powerups = []; medkits = []; particles = []; explosions = []; floatingTexts = [];
    waveTimer = WAVE_DURATION * 60;
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('endScreen').classList.add('hidden');
    document.getElementById('pauseScreen').classList.add('hidden');
    document.getElementById('shopScreen').classList.add('hidden');
    setControlVisibility(true);
    
    lastRenderTime = performance.now();
    sounds.bgMusic.play(); startWave();
    
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(gameLoop);
}

function endGame(msg) {
    gameState = 'END';
    document.getElementById('endScreen').classList.remove('hidden');
    document.getElementById('endTitle').innerText = msg;
    setControlVisibility(false);
    sounds.bgMusic.pause(); playSound(sounds.death);
}

let lastRenderTime = 0;
const FPS_INTERVAL = 1000 / 60;

function gameLoop(timestamp) {
    if(gameState === 'PLAYING' && !isPaused) {
        animationId = requestAnimationFrame(gameLoop);
        if (!timestamp) timestamp = performance.now();
        let elapsed = timestamp - lastRenderTime;
        if (elapsed >= FPS_INTERVAL) {
            lastRenderTime = timestamp - (elapsed % FPS_INTERVAL);
            update(); draw();
        }
    }
}

// --- 9. CONTROLS ---
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

// --- 10. SHOP & ECONOMY SYSTEM ---
let currentShopTier = 1;
function openShop() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('endScreen').classList.add('hidden');
    document.getElementById('shopScreen').classList.remove('hidden');
    currentShopTier = 2;
    toggleShopTier();
    updateShopUI();
}

function closeShop() {
    document.getElementById('shopScreen').classList.add('hidden');
    if (gameState === 'START') {
        document.getElementById('startScreen').classList.remove('hidden');
    } else {
        document.getElementById('endScreen').classList.remove('hidden');
    }
}

function toggleShopTier() {
    currentShopTier = currentShopTier === 1 ? 2 : 1;
    const tier1 = document.getElementById('tier1-wrapper');
    const tier2 = document.getElementById('tier2-wrapper');
    const toggleBtn = document.getElementById('toggleTierBtn');
    
    if (currentShopTier === 1) {
        tier1.style.display = 'flex';
        tier2.style.display = 'none';
        toggleBtn.innerText = 'View Tier 2 Upgrades';
        toggleBtn.style.background = '#3498db';
    } else {
        tier1.style.display = 'none';
        tier2.style.display = 'block';
        toggleBtn.innerText = 'View Tier 1 Upgrades';
        toggleBtn.style.background = '#e67e22';
    }
}

function getCost(type) {
    return Math.floor(UPGRADE_BASE_COST[type] * Math.pow(1.5, upgrades[type]));
}

function buyUpgrade(type) {
    if (upgrades[type] >= 5) return;
    let cost = getCost(type);
    if (coins >= cost) {
        coins -= cost;
        upgrades[type]++;
        localStorage.setItem('zombieCoins', coins);
        localStorage.setItem('zombieUpgrades', JSON.stringify(upgrades));
        playSound(sounds.powerup);
        player.applyUpgrades();
        updateShopUI();
        updateHUD();
    }
}

function updateShopUI() {
    const shopCoinText = document.getElementById('shopCoinText');
    if (shopCoinText) {
        shopCoinText.innerText = `🪙${coins}`;
    }
    const tier2Overlay = document.getElementById('tier2-overlay');
    if (tier2Overlay) {
        tier2Overlay.style.display = highWave >= 17 ? 'none' : 'flex';
    }
    ['health', 'ammo', 'speed', 'bonusHealth', 'piercing', 'reloadDelay'].forEach(type => {
        let lvlText = document.getElementById(`lvl-${type}`);
        let btn = document.getElementById(`btn-${type}`);
        if (!btn || !lvlText) return;
        
        let cost = getCost(type);
        lvlText.innerText = `Lvl ${upgrades[type]}/5`;
        if (upgrades[type] >= 5) {
            btn.innerText = "MAX";
            btn.disabled = true;
        } else {
            btn.innerText = `🪙${cost}`;
            let isTier2 = ['bonusHealth', 'piercing', 'reloadDelay'].includes(type);
            btn.disabled = (coins < cost) || (isTier2 && highWave < 17);
        }
    });
}
