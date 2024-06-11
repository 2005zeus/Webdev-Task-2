// Initialization
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

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

// Temp variables
let gravity = true;

// Classes

class Bullet {
    constructor(x, y, angle) {
        this.position = {x, y};
        this.scale = {
            x: 10,
            y: 10,
        };
        this.angle = angle;
        this.bulletSpeed = 20;
        this.velocity = {
            x: Math.cos(this.angle) * this.bulletSpeed,
            y: Math.sin(this.angle) * this.bulletSpeed,
        }

        this.damage = 25;
    }
}

class Entity {
    constructor(x, y, width = 50, height = 150, maxHealth) {
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
    }
}

class Block extends Entity {
    constructor(x, y, width, height) {
        super(x, y, width, height, 100);

        this.health = super.maxHealth;
    }
}

class Player extends Entity {
    constructor(position, scale){
        super(position.x, position.y, scale.x, scale.y, 100);

        this.health = 100
        this.speed = 5
        this.jumpHeight = 10
        this.gunAngle = 0
    }
}

class Zombie extends Entity {
    constructor(x, y, width = 50, height = 150) {
        super(x, y, width, height, 50);

        this.health = 50;
        this.speed = 2;
        this.jumpHeight = 5;

        this.damage = 10;
        this.reach = 20;
        this.coolDown = 700;

        this.lastHitTime = 0;
    }

    jump () {
        this.collisionState.bottom = false;

        this.velocity.y = -this.jumpHeight;
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
            object.health -= this.damage;

            this.lastHitTime = cTime;
        }
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
            x: 50,
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

    zombies: [],
    bullets: [],
    blocks: [],
    powerUps: [],
    entities: [],

    score: 0,
    isPaused: false,
    isGameOver: false,
    timer: 0,
}

let keyState = {
    'cursor': false,
    'a': false,
    'd': false,
    'w': false,
}

// ----------------------------------------------------------------
// Functions

function initState () {
    // Initial state

    // Blocks
    let block1 = new Block(300, gameState.platform.position.y - 70, 70, 70);
    let block2 = new Block(800, gameState.platform.position.y - 70, 70, 70);

    gameState.blocks.push(block1);
    gameState.blocks.push(block2);

    // Zombies
    let zombie1 = new Zombie(200, 350)
    
    gameState.zombies.push(zombie1);

    // Update gravity objects
    let entities = gameState.entities;

    entities.push(gameState.player);
    entities.push(...gameState.zombies);
    entities.push(...gameState.powerUps);
    entities.push(...gameState.blocks);

}

function applyGravity(object) {
    object.velocity.y += g;
}

function sides(object) {
    // Coordinates for all sides and middle
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

// ----------------------------------------------------------------
// Core functions
function gameLoop(curTime) {
    cTime = curTime;

    if (!gameState.isPaused && !gameState.isGameOver) {
        updateGameState();
        renderGame();
    }
    requestAnimationFrame(gameLoop);
}

function updateGameState() {
    updatePlatform();

    updatePlayer();

    updateBullets();

    updateZombies();

    checkBlockCollisions();

    updatePowerUps();

    // Game over
    if (gameState.player.health <= 0) {
        gameState.isGameOver = true;
    }
}

function renderGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    drawPlatform();
    
    drawPlayer();

    drawZombies();

    drawBullets();

    drawBlocks();

    drawPowerUps();

    drawUI();
}

// ----------------------------------------------------------------

function drawBackground() {
    ctx.beginPath();
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function updatePlatform() {
    // Check collision with gravity objects
    gameState.entities.forEach(entity => {
        if (sides(entity).bottom >= gameState.platform.position.y) {
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

    function moveCamera(direction) {
        // Move everything other than player to the opposite direction (direction can be 1 or -1)
        gameState.zombies.forEach(zombie => { zombie.position.x -= direction * player.speed });
        gameState.blocks.forEach(block => { block.position.x -= direction * player.speed });
    }

    // Movement
    if (keyState['a'] && !collisionState.left) {
        if (player.position.x <= cameraRange.min) {
            moveCamera(-1)
        } else {
            position.x -= player.speed;
        }
    }
    if (keyState['d'] && !collisionState.right) {
        if (player.position.x >= cameraRange.max) {
            moveCamera(1)
        } else {
            position.x += player.speed;
        }
    }
    if (keyState['w'] && velocity.y == 0) {
        collisionState.bottom = false;

        velocity.y = -player.jumpHeight;
        position.y += velocity.y;
    }
    
    // Gravity
    if (!collisionState.bottom && gravity) {
        // Apply gravity
        applyGravity(player)
        position.y += velocity.y;

    } else {
        velocity.y = 0;
        position.y = sides(collisionState.bottom).top - gameState.player.scale.y
    }

    // ---
    // Gun
    // const dx = keyState.cursor.x - sides(player).middle.x;
    // const dy = keyState.cursor.y - sides(player).middle.y;

    // player.gunAngle = Math.atan2(dy, dx);
}

function drawPlayer() {
    // Player appearance
    let position = gameState.player.position;
    let scale = gameState.player.scale

    // Player
    ctx.beginPath();
    ctx.fillStyle = "blue"
    ctx.fillRect(position.x, position.y, scale.x, scale.y);
    ctx.rect(position.x, position.y, scale.x, scale.y);
    ctx.stroke();

    // ---
    // Gun (rectangle)
    let gunPosition = {
        x: position.x + scale.x / 2,
        y: position.y + scale.y / 2,
    }

    // #region Draw parabolic path
    function calculateProjectileAngle(startPos, endPos, initialVelocity, gravity) {
        const dx = endPos.x - startPos.x;
        const dy = startPos.y - endPos.y;
        const g = gravity;
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

    function drawParabolicPath(startPos, endPos, initialVelocity = 20, gravity = g){
        const dx = endPos.x - startPos.x;
        let angle = calculateProjectileAngle(startPos, endPos, initialVelocity, gravity);

        if (!angle) return;

        // Adjust angle if the target is to the left of the start
        if (dx < 0) {
            angle = Math.PI - angle;
        } else {
            angle = -angle;
        }
        gameState.player.gunAngle = -angle;

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
            const y = startPos.y - (velocityY * t - 0.5 * gravity * Math.pow(t, 2));

            let colliding = false;
            gameState.blocks.forEach(block => {
                if (detectCollision(block, {position: {x, y}, scale: {x: 0, y: 0}})) {
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

    const startPos = gunPosition;
    const endPos = {
        x: keyState.cursor.x,
        y: keyState.cursor.y,
    }

    drawParabolicPath(startPos, endPos);
    // #endregion

    // Draw gun
    ctx.beginPath();
    ctx.fillStyle = "gray";
    ctx.translate(gunPosition.x, gunPosition.y);
    ctx.rotate(gameState.player.gunAngle);
    ctx.fillRect(-10, -10, 80, 20)
    ctx.stroke();
    ctx.resetTransform();
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
        ctx.arc(bullet.position.x, bullet.position.y, 5, 0, Math.PI * 2);
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

        let playerDirection = Math.sign(gameState.player.position.x - position.x);

        if (Math.abs(gameState.player.position.x - position.x) < zombie.speed) {
            // Very small distance case
            playerDirection = 0;
        }

        // ---
        // #region Move zombie towards player
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
        }
        else if (zombie.objectInRange(gameState.player)) {zombie.attack(gameState.player)}
        else {
            gameState.blocks.forEach(block => {
                if (zombie.objectInRange(block)) {
                    zombie.attack(block)
                }
            });
        }
        // #endregion

        // ---
        // #region Gravity
        if (!collisionState.bottom && gravity) {
            // Apply gravity
            applyGravity(zombie)
            position.y += velocity.y;

        } else {
            velocity.y = 0;
            position.y = sides(collisionState.bottom).top - zombie.scale.y
        }
        // #endregion

        // ---
        // #region Remove zombie if dead
        if (zombie.health <= 0) {
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

        ctx.beginPath();
        ctx.fillStyle = "green"
        ctx.fillRect(position.x, position.y, scale.x, scale.y);
        ctx.rect(position.x, position.y, scale.x, scale.y);
        ctx.stroke();
    });
}

// Block Collision
function checkBlockCollisions() {
    gameState.blocks.forEach(block => {
        // Check collision for each block with each entities
        const {top, bottom, left, right,} = sides(block);
        gameState.entities.forEach(entity => {
            let eState = entity.collisionState;

            if (detectCollision(block, entity)) {
                // In collision, add collisionState to entity
                if (right == sides(entity).left) { eState.left = block } 
                if (left == sides(entity).right) { eState.right = block } 
                if (top <= sides(entity).bottom) { eState.bottom = block }
                if (bottom == sides(entity).top) { eState.top = block }
    
            } else {
                // Remove collisionState from entity
                Object.keys(eState).forEach(key => {
                    if (eState[key] == block) {
                        eState[key] = false;
                    }
                });
            }
        });
    });
}

function drawBlocks() {
    gameState.blocks.forEach(block => {
        // Draw block
        ctx.beginPath();
        ctx.fillStyle = "red";
        ctx.rect(block.position.x, block.position.y, block.scale.x, block.scale.y);
        ctx.fill();
        ctx.stroke();
    });
}

// Power-Ups
function updatePowerUps() {
    // Check collision with player
    // Apply power-up effect
}

function drawPowerUps() {
    gameState.powerUps.forEach(powerUp => {
        // Draw power-up
    });
}

// UI
function drawUI() {
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
            const top = sides(entity).top;

            // Health bar
            ctx.beginPath();
            ctx.fillStyle = "gray";
            ctx.fillRect(sides(entity).left, top + offsetTop, sides(entity).right - sides(entity).left, barHeight);
            ctx.fillStyle = "lime";
            ctx.fillRect(sides(entity).left, top + offsetTop, (sides(entity).right - sides(entity).left) * (ch/mh), barHeight);
            ctx.stroke();
        }
    });

    // #endregion
    // ---
    // #region Stationary UI

    // #endregion
}

// Start Game Loop after initialization
initState();
gameLoop();

// ----------------------------------------------------------------
// Event Handlers
window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
window.addEventListener('mousemove', handleMouseMove);
window.addEventListener('click', handleClick);


function handleKeyDown(event) {
    if (keyState[event.key.toLowerCase()] !== null) {
        keyState[event.key.toLowerCase()] = true;
    }
}

function handleKeyUp(event) {
    if (keyState[event.key.toLowerCase()] !== null) {
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
    // Shoot bullet
    let position = gameState.player.position;
    let scale = gameState.player.scale;

    let bullet = new Bullet(
        x = position.x + scale.x / 2,
        y = position.y + scale.y / 2,
        angle = gameState.player.gunAngle,
    );

    gameState.bullets.push(bullet);
}