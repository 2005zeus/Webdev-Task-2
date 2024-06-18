// Initialization
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

const sprites = {
    'Player': 'sprites/playerSheet.png',
    'Background': 'sprites/background.png',

    'Normal': 'sprites/z1.png',
    'Jumper': 'sprites/z2.png',

    'Pistol': 'sprites/pistol.png',
    'Rifle': 'sprites/rifle.png',
}

canvas.width = innerWidth;
canvas.height = innerHeight;

// Consts and variables
const g = 0.3;
const cameraOffset = 0.10; // 10%
const cameraRange = {
    min: (canvas.width / 2) - (cameraOffset * canvas.width),
    max: (canvas.width / 2) + (cameraOffset * canvas.width),
}

let cTime = 0;

// Classes

class Bullet {
    constructor([x, y, angle], [damage, bulletSpeed, size]) {
        this.position = {x, y};
        this.scale = {
            x: size,
            y: size,
        };
        this.radius = size/2;

        this.angle = angle;

        this.bulletSpeed = powerUpState["Increased Range"] ? bulletSpeed + 5 : bulletSpeed;
        this.velocity = {
            x: Math.cos(this.angle) * this.bulletSpeed,
            y: Math.sin(this.angle) * this.bulletSpeed,
        }

        this.damage = damage;
    }
}

class Block {
    constructor(x, y, width, height, maxHealth = 100) {
        this.position = {x, y};
        this.scale = {
            x: width,
            y: height,
        };

        this.maxHealth = maxHealth;
        this.health = 100;
    }
}

class Entity {
    constructor(x, y, width = 50, height = 150, maxHealth, maxSpriteIndex = null) {
        this.position = {x, y};
        this.scale = {
            x: width,
            y: height,
        };
        this.velocity = {
            x: 0,
            y: 0,
        };

        this.maxHealth = maxHealth;

        this.collisionState = {
            top: false,
            bottom: false,
            left: false,
            right: false,
        };
        
        if (maxSpriteIndex) {
            this.spriteindex = {
                current: 0,
                max: maxSpriteIndex,
            }
        }
    }
}

class Player extends Entity {
    constructor(position, scale){
        super(position.x, position.y, scale.x, scale.y, 100, 5);

        this.health = 100
        this.speed = 5
        this.jumpHeight = 10

        this.gunAngle = 0
    }

    currentWeapon() {
        return gameState.inventory[keyState.inventoryIndex];
    }

    shoot() {
        if (this.currentWeapon() instanceof Placeable) return;
        this.currentWeapon().shoot(this.position, this.scale)
    }
}

class Zombie extends Entity {
    constructor(
        type,
        [x, y, width = 85, height = 150],
        [health, speed, jumpHeight = 0]
    ) {
        super(x, y, width, height, health, 3);

        this.type = type;

        this.health = health;
        this.speed = speed;
        this.jumpHeight = jumpHeight;

        this.damage = 10;
        this.reach = 20;
        this.coolDown = 700;

        this.lastHitTime = 0;

        this.frozen = false;
    }

    jump () {
        if (this.collisionState.bottom) {
            this.collisionState.bottom = false;

            this.velocity.y = -this.jumpHeight;
        }
    }

    objectInRange (object) {
        // Hitbox
        const hitbox = {
            position: {
                x: this.position.x - this.reach,
                y: this.position.y - this.reach,
            },
            scale: {
                x: this.scale.x + 2 * this.reach,
                y: this.scale.y + 2 * this.reach,
            }
        }

        // Check collision of object with range hitbox
        return detectCollision(hitbox, object);
    }

    attack (object) {
        if (cTime - this.lastHitTime >= this.coolDown){
            if (object instanceof Player && powerUpState.Immunity) return;

            object.health -= this.damage;

            this.lastHitTime = cTime;

            if (object instanceof Player) { gameState.score -= 1; }
        }
    }
}

class PowerUp extends Entity {
    constructor(type, x, y) {
        super(x, y, 50, 50, 100);
        
        this.type = type;

        this.duration = 10000; // 10 seconds
        this.appliedTime = 0;
    }

    applyEffect() {
        for (i in powerUpState) powerUpState[i] = false;

        this.appliedTime = cTime;
        powerUpState[this.type] = this;
    }

    removeEffect() {
        powerUpState[this.type] = false;
    }
}

class Gun {
    constructor(name, damage, bulletSpeed, bulletSize, coolDown) {
        this.name = name;
        this.damage = damage;
        this.bulletSpeed = bulletSpeed;
        this.bulletSize = bulletSize;

        this.coolDown = coolDown;
        this.recoil = {
            amount: bulletSize * bulletSpeed / 100,
            active: false,
            last: 0,
        };
    }

    shoot(position, scale, angle = gameState.player.gunAngle, yPos = null) {
        if (this.recoil.active) return;

        let bullet = new Bullet(
            [
                position.x + scale.x / 2,
                yPos? yPos : position.y + scale.y / 2,
                angle,
            ],
            [
                this.damage,
                this.bulletSpeed,
                this.bulletSize,
            ]
        );
    
        gameState.bullets.push(bullet);

        this.performRecoil(true);
    }

    performRecoil(enableRecoil = false) {
        if (enableRecoil) {
            this.recoil.active = true;
            this.recoil.last = cTime;
        } else if (this.recoil.last + this.coolDown <= cTime) {
            this.recoil.active = false;
        }

        return this.recoil.active;
    }
}

class Placeable {
    constructor(type, [width, height], damage = 0, count = null) {
        this.type = type;
        this.count = count;

        this.position = null;
        this.scale = {
            x: width,
            y: height,
        };
        this.damage = damage;

        if (this.type == "Mine") {
            this.coolDown = 200
            this.color = "brown";
        } else if (this.type == "Freeze trap") {
            this.coolDown = 3000
            this.color = "cyan";
        } else {
            this.coolDown = 100
        }

        this.active = false;
        this.usedTime = false;

        this.range = width * 1.5;
        this.displayHeight = 80;
        this.effect = null;
        this.frozen = [];

        this.gunAngle = false;
        this.weapon = new Gun("Turret", 1, 20, 7, this.coolDown);
        this.target = false;
    }

    groundPosition(groundY) {
        return {
            x: Math.round((keyState.cursor.x - this.scale.x/2)/50)*50,
            y: groundY - this.scale.y
        };
    }

    updatePosition(yPos) {
        this.position = this.groundPosition(yPos);

        this.effect = function() {
            return {
                position: {
                    x: sides(this, 'middle').x - this.range/2,
                    y: this.position.y - this.displayHeight
                },
                scale: {
                    x: this.range,
                    y: this.displayHeight,
                }
            }
        }
    }

    diffuse(){
        this.active = true;
        this.usedTime = cTime;

        gameState.zombies.forEach(zombie => {
            if (!detectCollision(zombie, this.effect())) return;

            if (this.type == "Mine") {
                zombie.health -= this.damage;
            } else if (this.type == "Freeze trap") {
                zombie.frozen = true;
                this.frozen.push(zombie);
            }
        });
    }

    updateStatus() {
        if (this.usedTime) {
            // console.log('r')
            if (this.usedTime + this.coolDown > cTime) {
                this.active = true;
            } else {
                if (this.type == "Shooter") {
                    this.active = false;
                    
                    this.weapon.recoil.active = false;
                    if(this.gunAngle && this.target) this.shoot();
                }
                else {
                    // If freeze trap, freeze zombies
                    if (this.type == "Freeze trap") {
                        this.frozen.forEach(zombie => {
                            zombie.frozen = false;
                        })

                        delete this.frozen;
                    }

                    // Remove object
                    gameState.placeables.splice(gameState.placeables.indexOf(this), 1);
                }
            }
        }
    }

    currentWeapon() {
        return this.weapon;
    }

    shoot() {
        if (!this.gunAngle) return;

        this.weapon.shoot(this.position, this.scale, this.gunAngle, sides(this, 'middle').y - this.scale.y/4);
        this.usedTime = cTime;
    }
}

// States
let gameState = {
    player: new Player(
        position= {
            y: 300,
            x: 700,
        },
        scale= {
            x: 85,
            y: 150,
        },
    ),

    platform: {
        position: {
            x: 0,
            y: canvas.height - 20,
        },
        scale: {
            x: canvas.width,
            y: 20,
        },
    },

    jetpack: {
        maxFuel: 100,
        fuel: 100,
    },

    spawnerLocations: [0, canvas.width],

    zombies: [],
    bullets: [],
    blocks: [],
    powerUps: [],
    entities: [],

    inventory: [
        // new Gun("Rifle", 25, 20, 20, 300),
        // new Gun("Pistol", 10, 15, 10, 100),
        new Placeable("Block", [70, 70], undefined, 5),
        new Placeable("Shooter", [80, 80]),
        new Placeable("Mine", [75, -15], 25),
        new Placeable("Freeze trap", [80, -15])
    ],
    placeables: [],

    score: 0,
    isPaused: true,
    isStarted: false,
    isGameOver: false,
    timer: 0,
}

let keyState = {
    'cursor': false,
    'cursorOnUI': false,
    'a': false,
    'd': false,
    'w': false,
    ' ': false,
    'inventoryIndex': 0,
}

let uiState = {
    "interactionFunction" : null,

    "optionsOpened": false,
    "screen": {
        "leaderboards": false,
        "exit": false
    },
    "placeItems": false,
}

let powerUpState = {
    ["Immunity"]: false,
    ["Increased Range"]: false,
}

let spawnerState = {
    zombies: {
        hordeSize: {
            min: 1,
            max: 3,
        },
        coolDown: 10000,
        lastSpawn: 0,
    },
    powerups: {
        min: 1,
        max: 3,
        coolDown: 10000,
        lastSpawn: 0,
    }
}

// ----------------------------------------------------------------
// Functions

function initState () {
    // Initial state

    // Blocks
    let block1 = new Block(300, gameState.platform.position.y - 70, 70, 70);
    let block2 = new Block(800, gameState.platform.position.y - 70, 70, 70);
    let block3 = new Block(300, gameState.platform.position.y - 140, 70, 70);
    // let block4 = new Block(300, gameState.platform.position.y - 210, 70, 70);
    let block5 = new Block(1000, gameState.platform.position.y - 280, 70, 70);

    gameState.blocks.push(block1);
    gameState.blocks.push(block2);
    gameState.blocks.push(block3);
    // gameState.blocks.push(block4);
    gameState.blocks.push(block5);

    // Zombies
    let zombie1 = new Zombie("Normal", [200, 350], [50, 2])
    let zombie2 = new Zombie("Jumper", [100, 350], [50, 1, 10])
    
    // gameState.zombies.push(zombie1);
    gameState.zombies.push(zombie2);

    // Powerups
    let power1 = new PowerUp("Immunity", 300, 300)

    // gameState.powerUps.push(power1);
}

function preperation() {
    uiState.placeItems = gameState.player.currentWeapon();
}

function updateGravityObjects() {
    let entities = gameState.entities;

    entities.push(gameState.player);
    entities.push(...gameState.zombies);
    entities.push(...gameState.powerUps);
}

function applyGravity(object) {
    object.velocity.y += g;
}

function sides(object, key = null) {
    // Coordinates for all sides and middle
    // return {
    //     top: object.position.y,
    //     bottom: object.position.y + object.scale.y,
    //     left: object.position.x,
    //     right: object.position.x + object.scale.x,

    //     middle: {
    //         x: object.position.x + object.scale.x / 2,
    //         y: object.position.y + object.scale.y / 2,
    //     }
    // }

    if (key == 'middle') {
        return {
            x: object.position.x + object.scale.x / 2,
            y: object.position.y + object.scale.y / 2,
        }
    } else if (key == 'top') {
        return object.position.y
    } else if (key == 'bottom') {
        return object.position.y + object.scale.y
    } else if (key == 'left') {
        return object.position.x
    } else if (key == 'right') {
        return object.position.x + object.scale.x
    } else {
        return {
            top: object.position.y,
            bottom: object.position.y + object.scale.y,
            left: object.position.x,
            right: object.position.x + object.scale.x,

            middle: {
                x: object.position.x + object.scale.x / 2,
                y: object.position.y + object.scale.y / 2,
            }
        }
    }
}

function detectCollision(object1, object2) {
    const a = sides(object1);
    const b = sides(object2);
    if (
        a.top <= b.bottom &&
        a.bottom >= b.top &&
        a.left <= b.right &&
        a.right >= b.left
    ) 
    { return true } else { return false }
}

function calculateProjectileAngle(startPos, endPos, initialVelocity) {
    const dx = endPos.x - startPos.x;
    const dy = startPos.y - endPos.y;
    const v = initialVelocity;

    // Quadratic formula components for calculating the angle
    const a = g * dx * dx / (2 * v * v);
    const b = dx;
    const c = dy + a;

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        return null;
    }

    const tanTheta1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    const tanTheta2 = (-b - Math.sqrt(discriminant)) / (2 * a);

    const angle1 = Math.atan(tanTheta1);
    const angle2 = Math.atan(tanTheta2);

    // Choose the angle that can be possible
    return Math.abs(angle1) < Math.abs(angle2) ? angle1 : angle2;
}

function drawParabolicPath(startPos, endPos, nonplayer = false, item = null) {    
    const weapon = !nonplayer? gameState.player.currentWeapon() : item.currentWeapon();
    const initialVelocity = weapon.bulletSpeed;
    
    const dx = endPos.x - startPos.x;
    let angle = calculateProjectileAngle(startPos, endPos, initialVelocity, g);

    if (!angle) return;

    // Adjust angle if the target is to the left of the start
    if (dx < 0) {
        angle = Math.PI - angle;
    } else {
        angle = -angle;
    }
    //
    if (nonplayer) {
        item.gunAngle = -angle
        return;
    }
    else { gameState.player.gunAngle = -angle }

    const velocityX = initialVelocity * Math.cos(angle);
    const velocityY = initialVelocity * Math.sin(angle);

    // Time to reach the target point
    const timeToTarget = Math.abs(dx / velocityX);
    const numPoints = 100;

    ctx.strokeStyle = "white";
    ctx.setLineDash([10, 5]);
    ctx.globalAlpha = 0.5;

    ctx.beginPath();

    ctx.moveTo(startPos.x, startPos.y);

    let bulletEnd = {};
    for (let t = 0; t <= timeToTarget; t += timeToTarget / numPoints) {
        const x = startPos.x + velocityX * t;
        const y = startPos.y - (velocityY * t - 0.5 * g * Math.pow(t, 2));

        let colliding = false;
        const size = weapon.bulletSize;
        const bulletHitBox = {
            position: {
                x: x,
                y: y,
            },
            scale: {x: size, y: size}
        }
        gameState.blocks.forEach(block => {
            if (detectCollision(block, bulletHitBox)) {
                colliding = true;
                bulletEnd.x = x;
                bulletEnd.y = y;
                return;
            }
        });
        if (colliding) break;

        ctx.lineTo(x, y);
    }

    // ctx.strokeStyle = 'gray';
    ctx.stroke();

    if (bulletEnd) {
        ctx.beginPath();
        ctx.arc(bulletEnd.x, bulletEnd.y, 15, 0, 2 * Math.PI);
        ctx.fillStyle = 'gray';
        ctx.fill(); 
    }

    // Reset transparency and line dash
    ctx.globalAlpha = 1.0;
    ctx.setLineDash([]);
    ctx.strokeStyle = "black";
}

function aimNearestZombie(position, item) {
    function calculateDistance(pos1, pos2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    function isShootable(defensePos, zombiePos, range, blocks) {
        // Check if within range
        const distance = calculateDistance(defensePos, zombiePos);
        if (distance > range) {
            return false;
        }
    
        // Check for obstructions
        const steps = 100;
        const dx = (zombiePos.x - defensePos.x) / steps;
        const dy = (zombiePos.y - defensePos.y) / steps;
    
        for (let i = 0; i <= steps; i++) {
            const x = defensePos.x + dx * i;
            const y = defensePos.y + dy * i;
    
            const bulletHitBox = {
                position: { x: x, y: y },
                scale: { x: 1, y: 1 }  // Assuming a point hitbox for simplicity
            };
    
            for (let block of blocks) {
                if (detectCollision(block, bulletHitBox)) {
                    return false;
                }
            }
        }
    
        return true;
    }
    
    function findNearestShootableZombie(defensePos, range, zombies, blocks) {
        let nearestZombie = null;
        let minDistance = Infinity;
    
        for (let zombie of zombies) {
            const zombiePos = {
                x: sides(zombie, 'middle').x,
                y: sides(zombie, 'middle').y,
            }
            if (isShootable(defensePos, zombiePos, range, blocks)) {
                const distance = calculateDistance(defensePos, zombiePos);
                if (distance < minDistance) {
                    nearestZombie = zombie;
                    minDistance = distance;
                }
            }
        }
    
        return nearestZombie;
    }
    
    function automatedDefenseShoot(defensePos, range, zombies, blocks) {
        const nearestZombie = findNearestShootableZombie(defensePos, range, zombies, blocks);
    
        if (nearestZombie) {
            const endPos = {
                x: sides(nearestZombie, 'middle').x,
                y: sides(nearestZombie, 'middle').y,
            }
    
            drawParabolicPath(defensePos, endPos, true, item);
            item.target = true;
        } else {
            item.target = false;
        }
    }
    
    // Example usage
    const defensePos = position;  // Position of the automated defense
    const range = item.weapon.bulletSpeed * item.weapon.bulletSpeed / g;  // Shooting range of the defense
    automatedDefenseShoot(defensePos, range, gameState.zombies, gameState.blocks);
    
}

function leaderboards(GETorSET = "GET") {
    if (GETorSET.toUpperCase() === "GET") {
        let lb = JSON.parse(localStorage.getItem('leaderboards'));
        return lb;
    }
    else if (GETorSET.toUpperCase() === "SET") {
        let lb = JSON.parse(localStorage.getItem('leaderboards')) ? JSON.parse(localStorage.getItem('leaderboards')) : [];
        lb.push({
            score: gameState.score
        });
        lb.sort((a, b) => b.score - a.score);
        localStorage.setItem("leaderboards", JSON.stringify(lb));
    }
}

function getSprite (spriteName) {
    const sprite = new Image();
    sprite.src = sprites[spriteName];

    return sprite;
}

// ----------------------------------------------------------------
// Core functions
function gameLoop(curTime) {
    cTime = curTime;

    if (!gameState.isStarted) {
        preperation();
    }

    if (!gameState.isPaused && !gameState.isGameOver) {
        updateGameState();
    }

    if (gameState.isGameOver) {
        renderGameOver();
    } else {
        renderGame();
    }

    requestAnimationFrame(gameLoop);
}

function updateGameState() {
    spawner();
    updateGravityObjects();

    updatePlatform();

    updatePlayer();

    updateBullets();

    updateZombies();

    updatePlaceables();

    checkBlockCollisions();

    updatePowerUps();

    updateJetpack();

    // Game over
    if (gameState.player.health <= 0) {
        gameState.isGameOver = true;
        leaderboards("SET");
    }
}

function renderGame() {
    drawBackground();

    // drawPlatform();
    
    drawPlayer();

    drawZombies();
    
    drawPlaceables();

    drawBullets();

    drawBlocks();

    drawPowerUps();

    drawUI();

}

function startGame() {
    uiState.placeItems = false;

    gameState.isStarted = true;
    gameState.isPaused = false;

    gameState.inventory = [
        new Gun("Rifle", 25, 20, 20, 300),
        new Gun("Pistol", 10, 15, 10, 100),
    ]
}

// ----------------------------------------------------------------

function spawner() {
    function spawnZombie() {
        // let location = Math.round(gameState.spawnerLocations[Math.floor(Math.random() * 2)]/50)*50
        let location = Math.round(gameState.spawnerLocations[0]/50)*50

        const hSize = spawnerState.zombies.hordeSize;
        const radomHordeSize = Math.floor(Math.random() * (hSize.max - hSize.min + 1)) + hSize.min;

        for (let i = 0; i < radomHordeSize; i++) {
            let zombie = new Zombie(
                Math.random() > 0.7 ? "Normal" : "Jumper",
                [location, canvas.height/3],
                [50, 2]
            )
    
            gameState.zombies.push(zombie);
        }
    }

    function spawnPowerup() {
        let location = Math.round((Math.random() * canvas.width)/50)*50;

        let powerup = new PowerUp(
            Math.random() > 0.5? "Immunity" : "Increased Range",
            location,
            canvas.height/3,
        )
        gameState.powerUps.push(powerup);
    }

    if (spawnerState.zombies.lastSpawn + spawnerState.zombies.coolDown <= cTime) {
        spawnZombie();
        spawnerState.zombies.lastSpawn = cTime;
    }

    // if (spawnerState.powerups.lastSpawn + spawnerState.powerups.coolDown <= cTime) {
    //     spawnPowerup();
    //     spawnerState.powerups.lastSpawn = cTime;
    // }
}

function drawBackground() {
    ctx.beginPath();
    // ctx.fillStyle = "black";
    // ctx.fillRect(0, 0, canvas.width, gameState.platform.position.y);
    ctx.drawImage(
        getSprite("Background"),
        0, 0,
        canvas.width, canvas.height + 30
    )
}

function updatePlatform() {
    // Check collision with gravity objects
    gameState.entities.forEach(entity => {
        if (sides(entity, 'bottom') >= gameState.platform.position.y) {
            entity.collisionState.bottom = gameState.platform;
        }
    });
}

function drawPlatform() {
    // Platform
    const platform = gameState.platform;

    ctx.beginPath();
    ctx.fillStyle = "gray";
    ctx.lineWidth = 3;
    ctx.fillRect(
        platform.position.x,
        platform.position.y,
        platform.scale.x,
        platform.scale.y,
    );
    ctx.stroke();
}

function updatePlayer() {
    let player = gameState.player;

    let velocity = player.velocity;
    let position = player.position;
    let collisionState = player.collisionState;

    let spriteIndex = player.spriteindex;

    // Top collision
    if (collisionState.top) {
        velocity.y = 0;
    }

    // Gravity
    if (keyState[' '] && gameState.jetpack.fuel > 0) {
        collisionState.bottom = false;
        position.y -= 2;
        velocity.y = 0;

        gameState.jetpack.fuel -= 0.1;
    } else if (!collisionState.bottom) {
        // Apply gravity
        applyGravity(player)
        position.y += velocity.y;

    } else {
        velocity.y = 0;
        position.y = sides(collisionState.bottom, 'top') - player.scale.y;
    }

    function moveCamera(direction) {
        // Move everything other than player to the opposite direction (direction can be 1 or -1)
        const everything = ['zombies', 'blocks', 'bullets', 'powerUps', 'placeables'];

        everything.forEach(stuff => {
            gameState[stuff].forEach(thing => { thing.position.x -= direction * player.speed});
        })

        gameState.spawnerLocations[0] -= direction * player.speed;
        gameState.spawnerLocations[1] -= direction * player.speed;
    }

    // Movement
    if (keyState['w'] && velocity.y == 0 && !keyState[' ']) {
        velocity.y = -player.jumpHeight;
        position.y += velocity.y;

        collisionState.bottom = false;
    }
    if (keyState['a'] && !collisionState.left) {
        if (player.position.x <= cameraRange.min) {
            moveCamera(-1)
        } else {
            position.x -= player.speed;
        }

        spriteIndex.current = spriteIndex.current <= spriteIndex.max? spriteIndex.current + 0.1 : 0;
    }
    if (keyState['d'] && !collisionState.right) {
        if (player.position.x >= cameraRange.max) {
            moveCamera(1)
        } else {
            position.x += player.speed;
        }

        spriteIndex.current = spriteIndex.current <= spriteIndex.max? spriteIndex.current + 0.1 : 0;
    }
}

function drawPlayer() {
    if (!gameState.isStarted) return;
    // Player appearance
    let position = gameState.player.position;
    let scale = gameState.player.scale

    // Player
    let spriteIndex = Math.round(gameState.player.spriteindex.current);

    let sOffset;
    if (keyState['a']) { sOffset = 960 }
    else if (keyState['d']) { sOffset = 640 }
    else {
        sOffset = 0;
        spriteIndex = 2.05;
    }    

    let clipped = {
        x: (160 + 160)*spriteIndex,
        y: sOffset,
        w: 1790/6 - 150,
        h: 1190/4 - 70,
    }

    ctx.beginPath();
    ctx.drawImage(
        getSprite("Player"),
        clipped.x, clipped.y, clipped.w, clipped.h,
        position.x, position.y, scale.x, scale.y
    );

    // ---
    // #region Gun
    let gunPosition = {
        x: position.x + scale.x / 2,
        y: position.y + scale.y / 2,
    }

    // #region Draw parabolic path
    if (!keyState.cursorOnUI && !gameState.isPaused && gameState.player.currentWeapon() instanceof Gun) {
        const startPos = gunPosition;
        const endPos = {
            x: keyState.cursor.x,
            y: keyState.cursor.y,
        }

        drawParabolicPath(startPos, endPos);
    }

    // #endregion

    // Recoil
    if (!(gameState.player.currentWeapon() instanceof Gun)) return;

    let recoil = 0;
    if (gameState.player.currentWeapon().performRecoil()) {
        recoil = gameState.player.currentWeapon().recoil.amount * 2;
    }

    // Gun sprite
    let imageAngle = gameState.player.gunAngle;
    let image = getSprite(gameState.player.currentWeapon().name);

    ctx.beginPath();
    ctx.translate(gunPosition.x, gunPosition.y);
    if (imageAngle < -Math.PI/2) {
        ctx.scale(-1, 1);
        imageAngle = Math.PI - imageAngle;
    }
    ctx.rotate(imageAngle);
    ctx.drawImage(image, scale.x - 110 - recoil, -60, 120, 120);
    ctx.resetTransform();

    // #endregion

}

// Bullet Movement and Collision
function updateBullets() {
    function removeBullet(bullet) {
        gameState.bullets.splice(gameState.bullets.indexOf(bullet), 1);
    }

    gameState.bullets.forEach(bullet => {
        // Move bullet
        bullet.position.x += bullet.velocity.x;
        bullet.position.y += bullet.velocity.y;

        applyGravity(bullet);
        // ---
        // #region Check collision
        // Platform
        if (bullet.position.y >= gameState.platform.position.y) {
            removeBullet(bullet);
        }

        // Block
        gameState.blocks.forEach(block => {
            if (detectCollision(bullet, block)) {
                removeBullet(bullet);
            }
        })

        // Zombie
        gameState.zombies.forEach(zombie => {
            if (detectCollision(bullet, zombie)) {
                zombie.health -= bullet.damage;
                removeBullet(bullet);
            }
        })

        // #endregion
    });
}

function drawBullets() {
    gameState.bullets.forEach(bullet => {
        // Draw bullet
        ctx.beginPath();
        ctx.arc(bullet.position.x, bullet.position.y, bullet.radius, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
    });
}

// Zombie Movement and Collision
function updateZombies() {
    gameState.zombies.forEach(zombie => {
        let collisionState = zombie.collisionState;
        let velocity = zombie.velocity;
        let position = zombie.position;
        let spriteIndex = zombie.spriteindex;

        let playerDirection = Math.sign(gameState.player.position.x - position.x);

        if (Math.abs(gameState.player.position.x - position.x) < zombie.speed) {
            // Very small distance case
            playerDirection = 0;
        }

        // Top collision
        if (collisionState.top) {
            velocity.y = 0;
        }

        // ---
        // #region Move zombie towards player
        if (!zombie.frozen) {
            if (
                (
                    playerDirection > 0 && !zombie.collisionState.right
                    ||
                    playerDirection < 0 && !zombie.collisionState.left
                )
                &&
                !zombie.objectInRange(gameState.player)
            ) {
                zombie.position.x += zombie.speed * playerDirection;
                spriteIndex.current = spriteIndex.current <= spriteIndex.max? spriteIndex.current + 0.03 : 0;
            }
            else if (zombie.objectInRange(gameState.player)) {zombie.attack(gameState.player)}
            else {
                if (zombie.type == "Jumper") {
                    zombie.jump();
                }
    
                gameState.blocks.forEach(block => {
                    if (zombie.objectInRange(block)) {
                        zombie.attack(block)
                    }
                });
            }
        }
        // #endregion

        // ---
        // #region Gravity
        if (!collisionState.bottom) {
            // Apply gravity
            applyGravity(zombie)
            position.y += velocity.y;

        } else {
            velocity.y = 0;
            position.y = sides(collisionState.bottom, 'top') - zombie.scale.y
        }
        // #endregion

        // ---
        // #region Remove zombie if dead
        if (zombie.health <= 0) {
            gameState.score += 10;
            gameState.zombies.splice(gameState.zombies.indexOf(zombie), 1);
        }
        // #endregion
    });
}

function drawZombies() {
    gameState.zombies.forEach(zombie => {
        // Draw zombie sprite
        let position = zombie.position
        let scale = zombie.scale

        let playerDirection = Math.sign(gameState.player.position.x - position.x);

        if (Math.abs(gameState.player.position.x - position.x) < zombie.speed) {
            // Very small distance case
            playerDirection = 0;
        }

        let image = getSprite(zombie.type);
        let spriteIndex = Math.round(zombie.spriteindex.current);

        let sOffset;
        if (playerDirection < 0) { sOffset = 1 * 192/4 }
        else if (playerDirection > 0) { sOffset = 2 * 192/4 }
        else {
            sOffset = 0;
            spriteIndex = 0;
        }    
    
        let clipped = {
            x: 128/4 * spriteIndex,
            y: sOffset,
            w: 128/4,
            h: 192/4,
        }
    
        ctx.beginPath();
        ctx.drawImage(
            image,
            clipped.x, clipped.y, clipped.w, clipped.h,
            position.x, position.y - 10, scale.x + 10, scale.y + 20,
        );
    });
}

// Placeables
function updatePlaceables() {
    gameState.placeables.forEach(item => {
        const position = item.position;
        const scale = item.scale;

        if (item.type == "Shooter") {
            const spherePos = {
                x: sides(item, 'middle').x,
                y: sides(item, 'middle').y - scale.y/4,
            }

            if (!item.active) {
                aimNearestZombie(spherePos, item);
            }
        }
        else {
            const hitbox = {
                position: {
                    x: position.x,
                    y: 0,
                },
                scale: {
                    x: scale.x,
                    y: canvas.height,
                },
            }

            gameState.zombies.forEach(zombie => {
                if (!item.active && detectCollision(hitbox, zombie)) {
                    item.diffuse();
                    return;
                }
            });
        }

        item.updateStatus();
    });
}

function drawPlaceables() {
    gameState.placeables.forEach(item => {
        const position = item.position;
        const scale = item.scale;
        const effect = item.effect();

        if (item.type == "Shooter") {
            const spherePos = {
                x: sides(item, 'middle').x,
                y: sides(item, 'middle').y - scale.y/4,
            }

            ctx.beginPath()
            ctx.save();

            // Stand
            ctx.strokeStyle = "white";
            ctx.moveTo(sides(item, 'middle').x, sides(item, 'middle').y);
            ctx.lineTo(position.x + scale.x/4, sides(item, 'bottom'));
            ctx.lineTo(sides(item, 'right') - scale.x/4, sides(item, 'bottom'));
            ctx.lineTo(sides(item, 'middle').x, sides(item, 'middle').y);
            ctx.stroke();

            // Sphere
            ctx.moveTo(spherePos.x + scale.x/2, spherePos.y);
            ctx.arc(spherePos.x, spherePos.y, scale.x/2, 0, Math.PI * 2);
            ctx.fillStyle = "white";
            ctx.fill();

            // Gun barrel
            let recoil = 0;
            if (item.usedTime + item.coolDown/2 > cTime) {
                recoil = item.weapon.recoil.amount * 3;
            }

            ctx.strokeStyle = "black";
            ctx.translate(spherePos.x, spherePos.y);
            ctx.rotate(item.gunAngle);
            ctx.fillRect(-10 - recoil, -10, 80, 20);
            ctx.stroke();

            // Restore
            ctx.restore();

        } else {
            ctx.beginPath()
            ctx.fillStyle = item.color;

            if (item.active) {
                ctx.fillRect(effect.position.x, effect.position.y, effect.scale.x, effect.scale.y);
            } else {
                ctx.fillRect(position.x, position.y, scale.x, scale.y);
            }
        }
    });
}

// Block Collision
function checkBlockCollisions() {
    gameState.blocks.forEach(block => {
        // Check collision for each block with each entities
        const {top, bottom, left, right,} = sides(block);
        gameState.entities.forEach(entity => {
            let eState = entity.collisionState;
            // const {etop, ebottom, eleft, eright,} = sides(entity);

            if (detectCollision(block, entity)) {
                // In collision, add collisionState to entity
                if (right <= sides(entity, 'left')) { eState.left = block } 
                else if (left <= sides(entity, 'right')) { eState.right = block }
                
                if (eState.left != block && eState.right != block) {
                    if (bottom >= sides(entity, 'top') && top <= sides(entity, 'top')) { eState.top = block }
                    else if (Math.abs(top-sides(entity, 'bottom')) < 2) { eState.bottom = block }
                }
            } else {
                // Remove collisionState from entity
                Object.keys(eState).forEach(key => {
                    if (eState[key] == block) {
                        eState[key] = false;
                    }
                });
            }

            // Block broken
            if (block.health <= 0) {
                for (i in entity.collisionState) {
                    if (entity.collisionState[i] === block) {
                        entity.collisionState[i] = false;
                    }
                }
            }
        });

        // Block broken
        if (block.health <= 0) {
            gameState.blocks.splice(gameState.blocks.indexOf(block), 1);
        }
    });
}

function drawBlocks() {
    gameState.blocks.forEach(block => {
        // Draw block
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 0, 0, ${block.health/block.maxHealth * 100}%)`;
        ctx.rect(block.position.x, block.position.y, block.scale.x, block.scale.y);
        ctx.fill();
        ctx.stroke();
    });
}

// Power-Ups
function updatePowerUps() {
    gameState.powerUps.forEach(powerUp => {
        let collisionState = powerUp.collisionState;
        let position = powerUp.position;
        let velocity = powerUp.velocity;


        // #region Gravity
        if (!collisionState.bottom) {
            // Apply gravity
            applyGravity(powerUp)
            position.y += velocity.y;

        } else {
            velocity.y = 0;
            position.y = sides(collisionState.bottom, 'top') - powerUp.scale.y
        }
        // #endregion
        // ---
        // Check collision with player

        if (detectCollision(gameState.player, powerUp)) {
            powerUp.applyEffect();
            gameState.powerUps.splice(gameState.powerUps.indexOf(powerUp), 1);
        }
    });

    for (i in powerUpState) {
        // For handling power up effects
        if (!powerUpState[i]) continue;

        if (cTime - powerUpState[i].appliedTime >= powerUpState[i].duration) {
            powerUpState[i].removeEffect();
        }
    }
}

function drawPowerUps() {
    gameState.powerUps.forEach(powerUp => {
        const position = powerUp.position;
        const scale = powerUp.scale;

        // Draw power-up
        ctx.beginPath();
        ctx.fillStyle = "yellow";
        ctx.fillRect(position.x, position.y, scale.x, scale.y);
        ctx.stroke();
    });
}

// Jetpack
function updateJetpack () {
    const jet = gameState.jetpack;

    if (!keyState[' '] && jet.fuel <= jet.maxFuel) {
        jet.fuel += 0.01;
    }
}

// UI
function drawUI() {
    const cw = canvas.width;
    const ch = canvas.height;

    // #region Non Stationary UI
    // Cursor
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(keyState.cursor.x, keyState.cursor.y, 15, 0, 2 * Math.PI);
    ctx.fillStyle = 'gray';
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Health bars
    gameState.entities.forEach(entity => {
        const ch = entity.health;
        const mh = entity.maxHealth;

        const barHeight = 10;
        const offsetTop = -15;

        if (ch < mh && ch > 0) {
            const top = sides(entity, 'top');

            // Health bar
            ctx.beginPath();
            ctx.fillStyle = "gray";
            ctx.fillRect(entity.position.x, top + offsetTop, sides(entity, 'right') - entity.position.x, barHeight);
            ctx.fillStyle = "lime";
            ctx.fillRect(entity.position.x, top + offsetTop, (sides(entity, 'right') - entity.position.x) * (ch/mh), barHeight);
            ctx.stroke();
        }
    });

    // #region Placeable
    if (uiState.placeItems) {
        const item = uiState.placeItems;

        // Check if cursor.y is colliding with any objects
        // Change scale to width of item
        const cursorLine = {
            position: keyState.cursor,
            scale: {x: 2, y: ch}
        }

        let topY = gameState.platform.position.y;
        let roundedX = 
        gameState.blocks.forEach(block => {
            if (detectCollision(cursorLine, block)) {
                if (block.position.y < topY) topY = block.position.y;
            }
        });
        item.updatePosition(topY)

        const placeLoc = item.groundPosition(topY);

        // Draw item
        ctx.beginPath();
        ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
        ctx.fillRect(placeLoc.x, placeLoc.y, item.scale.x, item.scale.y);
    }
    // #endregion
    

    // #endregion
    // ---
    // #region Stationary UI

    const uiS = ch * 0.05; // 5%
    const o = uiS / 3; // Offset
    const f = 3 * uiS / 4; // Default font size

    let player = gameState.player;
    let jetpack = gameState.jetpack;
    uiState.interactionFunction = null;

    function drawRect (
        type = ["text", "box"], // either can be removed, "button" can be added
        [x, y, w, h = uiS, color = "white"],
        [offsetX = o, offsetY = o],
        [text = "", fontSize = f, textColor = "white", textAlign = "center", textBaseline = "middle", p = 2.5],
        buttonFunction = null,
    ) {
        if (type.indexOf("box") !== -1) {
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.fillRect(x + offsetX, y + offsetY, w, h);
            ctx.stroke();
        }
        if (type.indexOf("text") !== -1) {
            const fontFamily = 'Sans-Serif';
        
            ctx.fillStyle = textColor;
            ctx.font = `${fontSize}px ${fontFamily}`;
            ctx.textBaseline = textBaseline;
            ctx.textAlign = textAlign;
            ctx.fillText(text, x + w/2 + offsetX, y + offsetY + h/2 + p);
            ctx.stroke();
        }
        if (type.indexOf("button") !== -1) {
            if (
                keyState.cursor.x >= x + offsetX && keyState.cursor.x <= x + offsetX + w
                &&
                keyState.cursor.y >= y + offsetY && keyState.cursor.y <= y + offsetY + h
            ) {
                keyState.cursorOnUI = true;
                uiState.interactionFunction = buttonFunction;
            }
            else if (keyState.cursorOnUI && !uiState.interactionFunction) {
                keyState.cursorOnUI = false;
            }
        }
    }

    // #region Display active power ups

    for (i in powerUpState) {
        if (!powerUpState[i]) continue;

        let effect = powerUpState[i];
        let durText = effect.appliedTime - cTime + effect.duration>0?Math.round((effect.appliedTime - cTime + effect.duration)/1000):"";

        drawRect(["text"], [0, uiS*2, cw], [0,], [`${i} powerup enabled for ${durText}s`]);
    }

    // #endregion

    // #region Drawing UI elements

    if (gameState.isStarted) {
        // Healthbar
        drawRect(["box"], [cw - 5*uiS, 0, 5*uiS, undefined, "gray"], [-o], []);
        drawRect(["box"], [cw - 5*uiS, 0, (player.health/player.maxHealth * 5*uiS), undefined, "green"], [-o], []);
        drawRect(["text"], [cw - 5*uiS, 0, 5*uiS, undefined, "gray"], [-o], [`${player.health} / ${player.maxHealth}`]);

        // Fuelbar
        drawRect(["box"], [cw - 5*uiS, uiS, 5*uiS, uiS/2, "gray"], [-o, o*2], []);
        drawRect(["box"], [cw - 5*uiS, uiS, (jetpack.fuel/jetpack.maxFuel * 5*uiS), uiS/2, "orange"], [-o, o*2], []);
        drawRect(["text"], [cw - 5*uiS, uiS, 5*uiS, uiS/2, "gray"], [-o, o*2], [`${Math.round(jetpack.fuel)} / ${jetpack.maxFuel}`, f/2]);

        // Score
        drawRect(["text"], [cw - 5*uiS, uiS * 2, 5*uiS], [-o, o*2], [`Score: ${gameState.score}`])
    }

    // Inventory
    const itemWidth = uiS*2;
    const inventoryWidth = gameState.inventory.length * (itemWidth + o/2);
    const invX = (cw - inventoryWidth)/2

    drawRect(["box"], [invX, 0, inventoryWidth, uiS*2, "transparent"], [], []);
    gameState.inventory.forEach((item, i) => {
        let text = (item.name?item.name:item.type) + (item.count? `\n(${item.count})` : '');
        let selectedColor = i==keyState.inventoryIndex ? "green":undefined;

        drawRect(undefined, [invX + i*(itemWidth + o/2), 0, itemWidth, uiS*2, selectedColor], [], [`${text}`, f/2, "black"]);
    });

    // Paused and resumed states
    if (!gameState.isPaused && gameState.isStarted) {
        // Resumed state
        drawRect(["text", "box", "button"], [0, 0, uiS], [], ["❚❚", uiS, "black"], "pause");
    } else {
        // Paused state
        if (gameState.isStarted) {
            drawRect(["text", "box", "button"], [0, 0, uiS], [], ["▶", uiS, "black"], "resume");
            drawRect(["text"], [uiS, 0, uiS*4], [], ["PAUSED"])
        } else {
            drawRect(["text", "box", "button"], [0, 0, uiS*5], [], ["▶ Start Game", f, "black"], "start");
        }

        // More options
        drawRect(["text", "box", "button"], [0, uiS, uiS*5], [undefined, o*2], ["More options", undefined, "black"], "options")
        if (uiState.optionsOpened) {
            // Options opened
            // "Leaderboards", "Change player name", "Exit game"
            drawRect(["text", "box", "button"], [0, uiS*2, uiS*5], [undefined, o*2 + 2], ["Leaderboards", undefined, "black"], "leaderboards")
            drawRect(["text", "box", "button"], [0, uiS*3, uiS*5, undefined, "red"], [undefined, o*2 + 4], ["Exit game", undefined], "exit")
            
        }
    }
    // #endregion

    // #region Display Screens
    const dScreen = uiState.screen;

    function clearScreen() {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (dScreen.leaderboards) {
        // Show leaderboards screen and list the top 10 leaderboards through loop
        // Load leaderboards from local history
        const lb = leaderboards();
        
        clearScreen();
        drawRect(["text"], [0, uiS, cw, uiS*2], [0], ["Leaderboards", f*3])
        drawRect(["text", "box", "button"], [0, 0, uiS], [], ["X", uiS, "black"], "closeScreen");

        if (!lb) return;
        for (i = 0; i < 10; i++) {
            if (!lb[i]) break;
            drawRect(["text"], [0, uiS * (i + 4), cw, uiS], [0, o*(i+1)], [`${i + 1}. ${lb[i].score}`])
        }
    }

    // #endregion

    // #endregion
}

function uiFunctions() {
    const iFunc = uiState.interactionFunction;

    if (iFunc === "pause") {
        // Pause
        gameState.isPaused = true;
    }
    else if (iFunc === "resume") {
        // Resume
        gameState.isPaused = false;
    }
    else if (iFunc === "start") {
        // Start
        startGame();
    }
    else if (iFunc === "options") {
        // Options
        uiState.optionsOpened = true;
    }
    else if (iFunc === "leaderboards") { uiState.screen[iFunc] = true }
    else if (iFunc === "exit") {
        if (confirm("Exit and restart game?")) {
            location.reload();
        }
    }
    else if (iFunc === "closeScreen") { for (i in uiState.screen) uiState.screen[i] = false; }

    if (uiState.placeItems && !uiState.interactionFunction) {
        // Place the item
        if (gameState.player.currentWeapon().type != "Block") {
            let item = gameState.inventory.splice(gameState.inventory.indexOf(gameState.player.currentWeapon()), 1);

            gameState.placeables.push(item[0]);
            if (item[0].type == "Shooter") item[0].usedTime = true;

            keyState.inventoryIndex = 0;
        } else {
            // Placing a block
            // Reduce count
            let item = gameState.player.currentWeapon();
            item.count -= 1;

            // Place block
            let block = new Block(item.position.x, item.position.y, item.scale.x, item.scale.y);
            gameState.blocks.push(block);

            // Remove item from inventory if count is 0
            if (item.count <= 0) {
                gameState.inventory.splice(gameState.inventory.indexOf(item), 1);
            }
        }
    }
}

// Game over
function renderGameOver() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "red";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "100px Sans-Serif";
    ctx.fillText("You Died", canvas.width/2, canvas.height/2 - 100);
    ctx.fillStyle = "white";
    ctx.font = "50px Sans-Serif";
    ctx.fillText("GAME OVER", canvas.width/2, canvas.height/2);
    ctx.font = "20px Sans-Serif";
    ctx.fillText(`Score: ${gameState.score}`, canvas.width/2, canvas.height/2 + 50);
    ctx.font = "15px Sans-Serif";
    ctx.fillText("Press any key to restart", canvas.width/2, canvas.height/2 + 100);
}

// ----------------------------------------------------------------
// Event Handlers
window.addEventListener('DOMContentLoaded', handleLoaded)
window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
window.addEventListener('mousemove', handleMouseMove);
window.addEventListener('click', handleClick);
window.addEventListener('wheel', handleMousewheel);

function handleLoaded() {
    // Start Game Loop after initialization
    // initState();
    preperation();

    updateGravityObjects();
    gameLoop();
}

function handleKeyDown(event) {
    if (Object.keys(keyState).indexOf(event.key) !== -1) {
        // w a d
        keyState[event.key.toLowerCase()] = true;
    } else if (event.key >= '1' && event.key <= gameState.inventory.length) {
        // numbers
        keyState.inventoryIndex = event.key - 1;
    } else if (event.key == 'Escape') {
        // Toggle paused
        gameState.isPaused = !gameState.isPaused;
    }
}

function handleKeyUp(event) {
    if (Object.keys(keyState).indexOf(event.key) !== -1) {
        keyState[event.key.toLowerCase()] = false;
    }
}

function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();

    keyState['cursor'] = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    }
}

function handleClick() {
    // UI functions
    if (uiState.interactionFunction || uiState.placeItems) {
        uiFunctions();
        return;
    } else {
        // #region uiState functions else block
        uiState.optionsOpened = false;
        // #endregion

        // Shoot gun
        if (gameState.isPaused) return;

        gameState.player.shoot();

    }
}

function handleMousewheel(event) {
    // Switch weapon
    let aNum = Math.round(event.deltaY/100);

    if (keyState.inventoryIndex + aNum < 0) {
        keyState.inventoryIndex = gameState.inventory.length - 1;
    } else if (keyState.inventoryIndex + aNum > gameState.inventory.length - 1) {
        keyState.inventoryIndex = 0;
    } else {
        keyState.inventoryIndex += aNum;
    }
}