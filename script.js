// --- GAME CONFIGURATION & STATE ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Responsive Scaling Setup
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let gameActive = false;
let score = 0;
let highScore = localStorage.getItem("zombieHighScore") || 0;
let wave = 1;
let zombies = [];
let bullets = [];
let powerups = [];
let particles = [];

// Track inputs
const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// --- GAME ENTITIES ---

// 1. Player Object (Centered, Blue Team)
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 16,
    speed: 4,
    hp: 100,
    maxHp: 100,
    ammo: 10,
    maxAmmo: 10,
    isReloading: false,
    reloadTimer: 0,
    reloadDuration: 1200, // ms
    angle: 0,
    activePowerups: {
        infiniteAmmo: 0,
        shield: 0,
        speed: 0
    }
};

// 2. Fixed Map Obstacles (Static Buildings)
const buildings = [
    { x: 300, y: 200, width: 120, height: 160 },
    { x: 750, y: 150, width: 140, height: 180 },
    { x: 550, y: 450, width: 100, height: 100 }
];

// --- MOBILE TOUCH OVERLAYS & CONTROLS ---
const touchControls = { active: false, moveX: 0, moveY: 0, isFiring: false };

function setupTouchControls() {
    const detectTouch = () => { touchControls.active = true; };
    window.addEventListener('touchstart', detectTouch, { passive: true });

    // D-Pad Configuration
    const setupDPadBtn = (id, mx, my) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[mx] = true; });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[mx] = false; });
    };
    setupDPadBtn('btnW', 'w');
    setupDPadBtn('btnA', 'a');
    setupDPadBtn('btnS', 's');
    setupDPadBtn('btnD', 'd');

    // Action Buttons
    const fireBtn = document.getElementById('btnFire');
    if (fireBtn) {
        fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); touchControls.isFiring = true; });
        fireBtn.addEventListener('touchend', (e) => { e.preventDefault(); touchControls.isFiring = false; });
    }

    const reloadBtn = document.getElementById('btnReload');
    if (reloadBtn) {
        reloadBtn.addEventListener('touchstart', (e) => { e.preventDefault(); handleReload(); });
    }
}

// --- CORE MECHANICS & LOGIC ---

function spawnZombies(count) {
    for (let i = 0; i < count; i++) {
        let x, y, distance;
        // Ensure they spawn off-screen or far from player
        do {
            x = Math.random() * (canvas.width * 1.5) - canvas.width * 0.25;
            y = Math.random() * (canvas.height * 1.5) - canvas.height * 0.25;
            distance = Math.hypot(x - player.x, y - player.y);
        } while (distance < 250);

        // Variant Zombie Typings
        const rand = Math.random();
        let type = 'normal';
        let hp = 1 + Math.floor(wave * 0.5);
        let speed = 1.2 + Math.random() * 0.8;
        let color = "#4E704D"; // Standard Undead Green
        let radius = 14;

        if (rand > 0.85) {
            type = 'runner';
            hp = Math.max(1, Math.floor(hp * 0.5));
            speed += 1.2;
            color = "#A63A2B"; // Fast Aggressive Red
            radius = 12;
        } else if (rand < 0.15 && wave > 2) {
            type = 'tank';
            hp *= 3;
            speed *= 0.6;
            color = "#2E3B59"; // Heavy Abomination Dark Blue
            radius = 20;
        }

        zombies.push({ x, y, radius, hp, maxHp: hp, speed, color, type });
    }
}

function fireBullet() {
    if (player.isReloading) return;
    if (player.ammo <= 0 && player.activePowerups.infiniteAmmo <= 0) {
        handleReload();
        return;
    }

    // Deduct ammo if no infinite ammo powerup active
    if (player.activePowerups.infiniteAmmo <= 0) {
        player.ammo--;
    }

    // Aim calculation (Defaults to player facing direction or touch destination)
    let targetAngle = player.angle;
    
    // Nearest zombie auto-lock for mobile support to improve firing feel
    if (touchControls.active && zombies.length > 0) {
        let nearest = zombies[0];
        let minDist = Math.hypot(zombies[0].x - player.x, zombies[0].y - player.y);
        for (let z of zombies) {
            let d = Math.hypot(z.x - player.x, z.y - player.y);
            if (d < minDist) { minDist = d; nearest = z; }
        }
        targetAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
        player.angle = targetAngle;
    }

    bullets.push({
        x: player.x + Math.cos(targetAngle) * player.radius,
        y: player.y + Math.sin(targetAngle) * player.radius,
        vx: Math.cos(targetAngle) * 8,
        vy: Math.sin(targetAngle) * 8,
        radius: 4
    });

    // Create Muzzle Flash Particles
    for(let i=0; i<3; i++) {
        particles.push({
            x: player.x + Math.cos(targetAngle) * player.radius,
            y: player.y + Math.sin(targetAngle) * player.radius,
            vx: (Math.cos(targetAngle) + (Math.random() - 0.5) * 0.5) * 3,
            vy: (Math.sin(targetAngle) + (Math.random() - 0.5) * 0.5) * 3,
            radius: Math.random() * 3 + 1,
            color: '#FFD700',
            alpha: 1,
            decay: 0.05
        });
    }

    updateHUD();
}

function handleReload() {
    if (player.isReloading || player.ammo === player.maxAmmo) return;
    player.isReloading = true;
    player.reloadTimer = Date.now();
    updateHUD();
}

function checkCollisions() {
    // Wall and Building collisions for player
    for (let b of buildings) {
        let closestX = Math.max(b.x, Math.min(player.x, b.x + b.width));
        let closestY = Math.max(b.y, Math.min(player.y, b.y + b.height));
        let distanceX = player.x - closestX;
        let distanceY = player.y - closestY;
        let distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

        if (distanceSquared < (player.radius * player.radius)) {
            // Push player back out of structure boundary smoothly
            let dist = Math.sqrt(distanceSquared);
            let overlap = player.radius - dist;
            if (dist === 0) { player.x -= player.speed; } else {
                player.x += (distanceX / dist) * overlap;
                player.y += (distanceY / dist) * overlap;
            }
        }
    }

    // Bullet impacts with Zombies or Structures
    for (let bIdx = bullets.length - 1; bIdx >= 0; bIdx--) {
        let bullet = bullets[bIdx];
        let bulletRemoved = false;

        // Structure hitting
        for (let wall of buildings) {
            if (bullet.x > wall.x && bullet.x < wall.x + wall.width &&
                bullet.y > wall.y && bullet.y < wall.y + wall.height) {
                bullets.splice(bIdx, 1);
                bulletRemoved = true;
                break;
            }
        }
        if (bulletRemoved) continue;

        // Zombie damage logic
        for (let zIdx = zombies.length - 1; zIdx >= 0; zIdx--) {
            let z = zombies[zIdx];
            if (Math.hypot(bullet.x - z.x, bullet.y - z.y) < z.radius + bullet.radius) {
                z.hp--;
                
                // Explode blood particles
                for(let i=0; i<6; i++) {
                    particles.push({
                        x: z.x, y: z.y,
                        vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                        radius: Math.random() * 3 + 1,
                        color: '#8B0000', alpha: 1, decay: 0.03
                    });
                }

                bullets.splice(bIdx, 1);
                
                if (z.hp <= 0) {
                    // Item drop rolls on death
                    if (Math.random() < 0.20) {
                        const types = ['infiniteAmmo', 'shield', 'speed'];
                        powerups.push({
                            x: z.x, y: z.y,
                            type: types[Math.floor(Math.random() * types.length)],
                            radius: 12, pulse: 0
                        });
                    }
                    zombies.splice(zIdx, 1);
                    score += 10;
                }
                break;
            }
        }
    }

    // Zombie dealing damage to Player
    for (let z of zombies) {
        if (Math.hypot(player.x - z.x, player.y - z.y) < player.radius + z.radius) {
            if (player.activePowerups.shield <= 0) {
                player.hp -= 0.5; // Smooth incremental damage mapping
                if (player.hp <= 0) endGame();
            } else {
                // Flash shield impact feedback particles
                particles.push({
                    x: player.x + (Math.random()-0.5)*10, y: player.y + (Math.random()-0.5)*10,
                    vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2,
                    radius: 2, color: '#00FFFF', alpha: 1, decay: 0.05
                });
            }
            updateHUD();
        }
    }

    // Power-up collections
    for (let pIdx = powerups.length - 1; pIdx >= 0; pIdx--) {
        let p = powerups[pIdx];
        if (Math.hypot(player.x - p.x, player.y - p.y) < player.radius + p.radius) {
            player.activePowerups[p.type] = 400; // Duration frame cycles (~7 seconds)
            powerups.splice(pIdx, 1);
            
            // Notification sparks
            for(let i=0; i<10; i++) {
                particles.push({
                    x: player.x, y: player.y,
                    vx: (Math.random()-0.5)*6, vy: (Math.random()-0.5)*6,
                    radius: Math.random()*3+1, color: '#FFFF00', alpha: 1, decay: 0.02
                });
            }
            updateHUD();
        }
    }
}

function updateHUD() {
    document.getElementById("hpDisplay").innerText = `HP: ${Math.max(0, Math.ceil(player.hp))}/${player.maxHp}`;
    document.getElementById("ammoDisplay").innerText = player.isReloading ? "Reloading..." : `Ammo: ${player.ammo}/${player.maxAmmo}`;
    document.getElementById("waveDisplay").innerText = `Wave: ${wave}`;
    document.getElementById("highScoreDisplay").innerText = `Best Wave: ${highScore}`;

    // Conditional indicators toggle matching HTML layout rules
    document.getElementById("ammoPowerup").classList.toggle("hidden", player.activePowerups.infiniteAmmo <= 0);
    document.getElementById("shieldPowerup").classList.toggle("hidden", player.activePowerups.shield <= 0);
    document.getElementById("speedPowerup").classList.toggle("hidden", player.activePowerups.speed <= 0);
    
    if (player.activePowerups.shield > 0) {
        document.getElementById("shieldPowerup").innerText = `Shield: ${Math.ceil(player.activePowerups.shield / 60)}s`;
    }
}

// --- VISUAL RENDERING LOOP (CANVAS ART SECTOR) ---

function draw() {
    // 1. Draw Field Background Grid
    ctx.fillStyle = "#557A46"; // Darker tactical flat arena green
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Contextual soft floor grass layout grids
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    const step = 50;
    for (let x = 0; x < canvas.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    // 2. Draw Obstacles / Strategic Buildings
    buildings.forEach(b => {
        // Drop Shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(b.x + 8, b.y + 8, b.width, b.height);
        
        // Base structure block
        ctx.fillStyle = "#2C3539"; // Dark steel graphite core
        ctx.fillRect(b.x, b.y, b.width, b.height);
        
        // Architecture borders
        ctx.strokeStyle = "#1A1F21";
        ctx.lineWidth = 4;
        ctx.strokeRect(b.x, b.y, b.width, b.height);

        // Windows details matrix
        ctx.fillStyle = "#566573";
        for (let wx = b.x + 15; wx < b.x + b.width - 10; wx += 25) {
            for (let wy = b.y + 15; wy < b.y + b.height - 10; wy += 35) {
                ctx.fillRect(wx, wy, 12, 18);
            }
        }
    });

    // 3. Draw Drop Items (Power-ups)
    powerups.forEach(p => {
        p.pulse += 0.1;
        let scaleFactor = 1 + Math.sin(p.pulse) * 0.15;

        ctx.shadowBlur = 15;
        if (p.type === 'infiniteAmmo') { ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; } // Yellow
        else if (p.type === 'shield') { ctx.fillStyle = '#00FFFF'; ctx.shadowColor = '#00FFFF'; }  // Cyan
        else if (p.type === 'speed') { ctx.fillStyle = '#FF00FF'; ctx.shadowColor = '#FF00FF'; }   // Magenta

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * scaleFactor, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0; // Clear performance leak
    });

    // 4. Draw Projectiles
    ctx.fillStyle = "#FFF9A6";
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
    });

    // 5. Draw Active Particles System
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 6. Draw AI Enemies (Zombies)
    zombies.forEach(z => {
        ctx.save();
        
        // Base Drop Shadow
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath(); ctx.arc(z.x + 3, z.y + 4, z.radius, 0, Math.PI*2); ctx.fill();

        // Core Body Rendering Instead of Broken Symbols Text
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#1C2833";
        ctx.stroke();

        // Zombie Aggression Directional Sight Pointer
        let targetAngle = Math.atan2(player.y - z.y, player.x - z.x);
        ctx.fillStyle = "#E74C3C"; // Glowing infection blood eyes
        
        // Left Eye
        let leX = z.x + Math.cos(targetAngle - 0.4) * (z.radius * 0.6);
        let leY = z.y + Math.sin(targetAngle - 0.4) * (z.radius * 0.6);
        ctx.beginPath(); ctx.arc(leX, leY, 2.5, 0, Math.PI * 2); ctx.fill();

        // Right Eye
        let reX = z.x + Math.cos(targetAngle + 0.4) * (z.radius * 0.6);
        let reY = z.y + Math.sin(targetAngle + 0.4) * (z.radius * 0.6);
        ctx.beginPath(); ctx.arc(reX, reY, 2.5, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    });

    // 7. Draw Hero Actor (The Player)
    ctx.save();
    
    // Smooth shadow drop
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.arc(player.x + 4, player.y + 5, player.radius, 0, Math.PI * 2); ctx.fill();

    // Shield Aura Layer Ring Effect
    if (player.activePowerups.shield > 0) {
        ctx.strokeStyle = `rgba(0, 255, 255, ${0.4 + Math.sin(Date.now()/100)*0.2})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // Main Player Character Body Circular Structure
    ctx.fillStyle = player.activePowerups.speed > 0 ? "#8E44AD" : "#2471A3"; // Purple if hyper-speed, blue default
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#FFFFFF";
    ctx.stroke();

    // Weapon/Gun Line Attachment Indicator
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = "#1C2833";
    ctx.fillRect(0, -3, player.radius + 10, 6); // Weapon Barrel

    ctx.restore();
}

// --- ENGINE REFRESH HEARTBEAT ---

function gameLoop() {
    if (!gameActive) return;

    // 1. Core Process Movement Mechanics
    let moveSpeed = player.speed;
    if (player.activePowerups.speed > 0) moveSpeed *= 1.6;

    let dx = 0; let dy = 0;
    if (keys['w']) dy -= 1; if (keys['s']) dy += 1;
    if (keys['a']) dx -= 1; if (keys['d']) dx += 1;

    // Direct diagonal vectors standardization scale tracking
    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
    player.x += dx * moveSpeed; player.y += dy * moveSpeed;

    // Handle weapon directional rotational look constraints via keyboard direction
    if (dx !== 0 || dy !== 0) { player.angle = Math.atan2(dy, dx); }

    // Screen map limit constraints
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

    // Continuous fire for touch or space holders
    if (keys[' '] || touchControls.isFiring) {
        if (Date.now() % 7 === 0 || keys[' ']) { // Automated interval frame fire rate
            fireBullet();
        }
    }

    // 2. Handle Reload Timers
    if (player.isReloading) {
        if (Date.now() - player.reloadTimer >= player.reloadDuration) {
            player.ammo = player.maxAmmo;
            player.isReloading = false;
            updateHUD();
        }
    }

    // 3. Update Buff/Power-up Timers
    for (let key in player.activePowerups) {
        if (player.activePowerups[key] > 0) {
            player.activePowerups[key]--;
            if (player.activePowerups[key] === 0) updateHUD();
        }
    }

    // 4. Projectiles Vector Mechanics Animation
    bullets.forEach((b, idx) => {
        b.x += b.vx; b.y += b.vy;
        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) { bullets.splice(idx, 1); }
    });

    // 5. Particles Physics Updates
    particles.forEach((p, idx) => {
        p.x += p.vx; p.y += p.vy; p.alpha -= p.decay;
        if(p.alpha <= 0) particles.splice(idx, 1);
    });

    // 6. AI Behavioral Pathfinding (Zombies track player position)
    zombies.forEach(z => {
        let angle = Math.atan2(player.y - z.y, player.x - z.x);
        z.x += Math.cos(angle) * z.speed;
        z.y += Math.sin(angle) * z.speed;
    });

    // 7. Process Boundary Mechanics and Checks
    checkCollisions();

    // 8. Waves Spawn Logic Process
    if (zombies.length === 0) {
        wave++;
        spawnZombies(4 + wave * 2);
        updateHUD();
    }

    // 9. Frame draw processing updates
    draw();
    requestAnimationFrame(gameLoop);
}

// --- APP INIT MANAGEMENT ---

function startGame() {
    // Attempt native screen canvas maximization full display request mapping
    const container = document.documentElement;
    if (container.requestFullscreen) container.requestFullscreen().catch(() => {});
    
    document.getElementById("startScreen").classList.add("hidden");
    document.getElementById("endScreen").classList.add("hidden");
    
    // Reset defaults state variables
    gameActive = true;
    player.hp = 100;
    player.ammo = player.maxAmmo;
    player.isReloading = false;
    player.activePowerups = { infiniteAmmo: 0, shield: 0, speed: 0 };
    score = 0;
    wave = 1;
    zombies = [];
    bullets = [];
    powerups = [];
    particles = [];

    updateHUD();
    setupTouchControls();
    spawnZombies(5);
    requestAnimationFrame(gameLoop);
}

function endGame() {
    gameActive = false;
    if (wave > highScore) {
        highScore = wave;
        localStorage.setItem("zombieHighScore", highScore);
    }
    document.getElementById("endTitle").innerText = `Game Over\nYou Survived to Wave ${wave}`;
    document.getElementById("endScreen").classList.remove("hidden");
}

// Setup Event Click Routing Rules
document.getElementById("startBtn").addEventListener('click', startGame);
document.getElementById("restartBtn").addEventListener('click', startGame);
