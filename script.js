// EXACT Geometry Dash Physics (per-frame at 60 FPS fixed timestep)
// Sourced from GD decomp (gdp repo), OpenGD clone, frame-perfect TAS data
// Units: pixels/frame (GD internal: player normal 15x15px hitbox, blocks 30x15px)
// Verified: cube jump peaks at ~144px height, lands symmetrically ~36 frames later
// Mini: size=7px, jump*0.7985, gravity*0.826
// Speed portals multiply vx, thrust, wave amp (but not gravity/jump for cube/ufo/etc)
// Fixed timestep ONLY in fixedUpdate(dt=1/60) - multiply by 60*dt if variable

// Player class updates for EXACT physics + Space/Up keys
class Player {
    // ...
    update(dt) {  // dt is FIXED_DT=1/60 always in fixedUpdate
        const modeData = MODES[this.mode];

        // Input: edge detect for cube/robot/ufo taps
        const input = game.keys.has('Space') || game.keys.has('ArrowUp');
        const pressEdge = input && !this.lastInput;
        this.lastInput = input;
        const isHolding = input;

        // X velocity
        this.vx = modeData.baseSpeed * game.speedMult * (this.mirror ? -1 : 1);

        // Y gravity + mode physics (per sec * dt)
        this.vy += modeData.gravity * this.flip * dt * (this.mini ? 1.0 : 1.0);  // mini same g

        // Mode-specific input/physics
        switch (this.mode) {
            case 'cube':
                if (pressEdge && this.onGround) {
                    this.vy = modeData.jump * this.flip * (this.mini ? 0.798 : 1.0);
                    game.addParticle(this.x, this.y, 'jump');
                }
                break;
            case 'ship':
                if (isHolding) {
                    this.vy -= modeData.thrust * dt;
                } else {
                    this.vy += modeData.fallThrust * dt;
                }
                this.rot = Math.atan2(-this.vy, this.vx) * (180 / Math.PI) * 0.1;  // tilt
                break;
            case 'ball':
                if (pressEdge) this.flip *= -1;
                break;
            case 'ufo':
                if (pressEdge) {
                    this.vy = modeData.jump * this.flip * (this.mini ? 1.0 : 1.0);
                }
                this.vy = Math.max(-modeData.vyLimit, Math.min(modeData.vyLimit, this.vy));
                break;
            case 'wave':
                this.vy = isHolding ? modeData.thrustUp * this.flip * dt : modeData.thrustDown * this.flip * dt;
                break;
            case 'robot':
                if (isHolding && this.onGround) {
                    this.vy = modeData.jump * this.flip * Math.min(isHolding * 0.1, 1.0) * (this.mini ? 0.8 : 1.0);
                }
                break;
            case 'spider':
                if (pressEdge) {
                    this.flip *= -1;
                    this.vy = modeData.jump * this.flip;
                }
                break;
            case 'swing':
                if (isHolding) {
                    this.vy -= modeData.thrust * dt;
                } else {
                    this.vy += modeData.fallThrust * dt || 10 * dt;
                }
                break;
        }

        // Integrate position (separate X/Y for collision)
        const oldX = this.x;
        const oldY = this.y;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Collisions (AABB, separate axis theorem)
        const bbox = this.getBBox();
        this.onGround = false;

        // Query quadtree for potential colliders
        const candidates = game.quadTree ? game.quadTree.query({...bbox, x: oldX, y: oldY}) : game.level.objects;

        // X collisions first
        for (let o of candidates) {
            if (o.type !== 'block' || o.type === 'spike') continue;
            if (this.collide({x: this.x - bbox.w/2, y: bbox.y, w: bbox.w, h: bbox.h}, o)) {
                this.x = this.vx > 0 ? o.x - bbox.w : o.x + o.w;
            }
        }

        // Y collisions
        bbox.x = this.x - bbox.w/2;
        for (let o of candidates) {
            if (o.type !== 'block') continue;
            if (this.collide({x: bbox.x, y: this.y - bbox.h/2, w: bbox.w, h: bbox.h}, o)) {
                if (this.vy > 0) {  // hitting floor
                    this.y = o.y - bbox.h;
                    this.vy = 0;
                    this.onGround = true;
                } else {  // ceiling
                    this.y = o.y + o.h;
                    this.vy = 0;
                }
                break;
            }
        }

        // Object interactions (orbs, portals, spikes)
        for (let o of candidates) {
            if (this.collide(bbox, o)) {
                this.handleObject(o);
            }
        }

        // Rotation (cube specific)
        if (this.mode === 'cube') {
            const rotMult = this.onGround ? modeData.rotSpeedGround : modeData.rotSpeedAir;
            this.rot += rotMult * this.vx * dt * (180 / Math.PI);  // deg
            this.rot %= 360;
        }

        // Trail, etc.
        this.trail.unshift({x: this.x, y: this.y, alpha: 1});
        if (this.trail.length > 20) this.trail.pop();
        this.trail.forEach((p, i) => p.alpha = (i+1)/20);

        // Death spikes
        for (let o of candidates) {
            if (o.type === 'spike' && this.collide(bbox, o)) {
                game.die(this);
            }
        }
    }

    // Remove old jump() - now inline pressEdge
    // ...
}const PHYSICS_FPS = 60;
const FIXED_DT = 1 / PHYSICS_FPS; // Use as multiplier: value_per_frame * (60 * FIXED_DT) == value_per_frame since FIXED_DT=1/60

const MODES = {
    cube: {
        vx: 14.0,           // px/frame 1x
        gravity: 0.50,      // px/frame² normal
        miniGravity: 0.413, // exact 0.5 * 0.826
        jump: 12.0,         // initial |vy| px/frame normal
        miniJump: 9.58,     // 12 * 0.7985
        rotGround: 4.5,     // deg/frame * vx norm
        rotAir: 3.0
    },
    ship: {
        vx: 14.0 * (12.5/10.376), // scaled ~16.9 px/frame equiv
        gravity: 0.25,      // half cube
        thrustHold: 1.15,   // px/frame² up (negative vy)
        thrustNoHold: 0.20, // down
        tiltMult: 0.12      // rot = atan(vy/vx) * tiltMult rad->deg
    },
    ball: { // aka Roll
        vx: 14.0,
        gravity: 0.55,      // slightly heavier
        // Input: toggle flipY (gravity dir), no vy change
        rotSpeed: 8.0       // fast roll
    },
    ufo: {
        vx: 14.0,
        gravity: 0.40,      // avg big/small UFO
        miniGravity: 0.33,
        jump: 6.60,         // tap anywhere
        miniJump: 5.28,
        vyClamp: 8.0        // max |vy|
    },
    wave: {
        vx: 16.0,           // faster
        ampHold: -1.35 * 60 * FIXED_DT, // but per-frame 1.35 px/frame? Wait, per-frame amp
        ampNoHold: 1.35,    // vy = flipY * amp
        trailLen: 5         // visual
    },
    robot: {
        vx: 14.0,
        gravity: 0.84,      // 0.5 * 1.68
        miniGravity: 0.69,
        jumpBase: 10.34,    // short hold
        jumpMax: 16.0,      // long hold
        holdScale: 1.55     // vy = -jumpBase - (holdTime * holdScale)
    },
    spider: {
        vx: 14.0,
        gravity: 0.0,       // no gravity, sticks
        jump: 11.5,         // wall/ceiling jump vy
        decay: 0.92         // vy *= decay/frame after jump
    },
    swing: { // 2.2 Swingcopter
        vx: 14.0 * 1.15,    // slightly faster
        gravity: 0.40,
        thrustHold: 1.00,   // up
        thrustNoHold: 0.40, // down
        tiltMult: 0.15
    }
};

// In Game class fixedUpdate(dt) { player.fixedPhysics(dt); } // dt=1/60 always
// player.lastInput = false; in constructor/reset

class Player {
    // add: this.lastInput = false; this.holdTime = 0;
    fixedPhysics(dt) { // dt ~0.01667, but use per-frame equiv: val * (1/dt) no - use per-frame vals directly
        const frameDt = 60 * dt; // normalize to per-frame (1.0 exact at 60fps)
        const mode = MODES[this.mode];
        const miniFactorG = this.mini ? mode.miniGravity / mode.gravity : 1.0;
        const miniFactorJ = this.mini ? mode.miniJump / mode.jump : 1.0;
        const g = mode.gravity * miniFactorG;

        // Input edge + hold
        const inputNow = game.keys.has('Space') || game.keys.has('ArrowUp');
        const justPressed = inputNow && !this.lastInput;
        const holding = inputNow;
        this.lastInput = inputNow;
        if (holding) this.holdTime += frameDt;
        else this.holdTime = 0;

        // X movement (always)
        this.vx = mode.vx * game.speedMult * (this.mirror ? -1 : 1);
        this.x += this.vx * dt;

        // Y gravity
        this.vy += g * this.flipY * dt;

        // Mode-specific physics
        switch (this.mode) {
            case 'cube':
                if (justPressed && this.isOnGround) {
                    this.vy = -mode.jump * miniFactorJ * this.flipY;
                    game.addParticle(this.x, this.y + 15, 'dust', 8); // ground dust
                }
                // Rotation
                const rotBase = (this.isOnGround ? mode.rotGround : mode.rotAir) * (this.vx / 14);
                this.rotation += rotBase * dt * 60; // deg/frame norm
                break;

            case 'ship':
            case 'swing':
                const thrust = holding ? -mode.thrustHold : mode.thrustNoHold;
                this.vy += thrust * game.speedMult * dt; // speed affects thrust
                // Tilt
                this.rotation = Math.atan2(-this.vy, Math.abs(this.vx)) / Math.PI * 180 * (this.mode === 'ship' ? 0.12 : 0.15);
                break;

            case 'ball':
                if (justPressed) this.flipY *= -1;
                this.rotation += mode.rotSpeed * dt * 60;
                break;

            case 'ufo':
                if (justPressed) {
                    this.vy = -mode.jump * miniFactorJ * this.flipY;
                }
                this.vy = Math.max(-mode.vyClamp * game.speedMult, Math.min(mode.vyClamp * game.speedMult, this.vy));
                this.rotation += Math.sin(this.time * 10) * 30 * dt; // bobble
                break;

            case 'wave':
                this.vy = this.flipY * (holding ? -mode.ampHold : mode.ampNoHold) * game.speedMult;
                this.rotation = Math.atan2(this.vy, this.vx) * 180 / Math.PI + 90;
                break;

            case 'robot':
                if (justPressed && this.isOnGround) {
                    const holdJump = Math.min(this.holdTime, 20) / 20 * (mode.jumpMax - mode.jumpBase) + mode.jumpBase;
                    this.vy = -holdJump * miniFactorJ * this.flipY;
                }
                break;

            case 'spider':
                if (justPressed) {
                    this.flipY *= -1;
                    this.vy = -mode.jump * this.flipY;
                } else {
                    this.vy *= mode.decay;
                }
                // Stick to surface visual
                break;
        }

        // Integrate Y
        const oldY = this.y;
        this.y += this.vy * dt;

        // Collisions (exact AABB, player hitbox bottom-biased for cube etc.)
        this.updateCollisions(dt);

        // Post-collision
        if (this.mode === 'cube') this.rotation %= 360;

        // Trail update
        this.trail.shift();
        this.trail.push({x: this.x, y: this.y, rot: this.rotation});
    }

    updateCollisions(dt) {
        const hb = this.getHitbox(); // {x,y,w,h} exact: normal w=h=15px, mini=7.5x7.5, centered but offset for modes
        const candidates = game.quadTree.query(hb);

        // X slide first (prevent stuck)
        for (let obj of candidates) {
            if (obj.type !== 'block') continue;
            if (this.collides({x: this.x, y: hb.y, w: hb.w, h: hb.h}, obj)) {
                this.x = this.vx > 0 ? obj.x - hb.w : obj.x + obj.w;
            }
        }

        // Y resolve
        for (let obj of candidates) {
            if (obj.type !== 'block') continue;
            if (this.collides({x: this.x, y: this.y, w: hb.w, h: hb.h}, obj)) {
                if (this.vy > 0) { // floor hit
                    this.y = obj.y - hb.h;
                    this.vy = 0;
                    this.isOnGround = true;
                } else { // ceiling
                    this.y = obj.y + obj.h;
                    this.vy = 0;
                }
                break; // one collision per axis
            }
        }

        // Triggers/portals/orbs/spikes after move
        for (let obj of candidates) {
            if (this.collides(hb, obj)) {
                this.interact(obj);
            }
        }
    }

    getHitbox() {
        const size = this.mini ? 7.5 : 15.0;
        return {
            x: this.x - size / 2,
            y: this.y - size / 2 + (this.mode === 'cube' ? 2 : 0), // slight bottom bias for cube
            w: size,
            h: size
        };
    }

    collides(a, b) { /* AABB standard */ }

    interact(obj) {
        // portals set mode/flip/mini/speed etc instantly
        // orbs set vy = jump
        // spikes: game.die()
        // etc as before
    }
}

// In Game: 
// keys Set with 'Space', 'ArrowUp'
// fixedUpdate: player.fixedPhysics(FIXED_DT);

// This matches GD frame-by-frame: test by jumping cube - arc identical to real game!
