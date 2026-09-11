const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

// UI 요소
const stageValUI = document.getElementById('stage-val');
const scoreValUI = document.getElementById('score-val');
const weaponLvlUI = document.getElementById('weapon-lvl');
const weaponTypeUI = document.getElementById('weapon-type-ui');
const playerHpUI = document.getElementById('player-hp');
const bossHpContainer = document.getElementById('boss-hp-container');
const bossHpFill = document.getElementById('boss-hp-fill');
const stageClearMsg = document.getElementById('stage-clear-msg');

const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const victoryScreen = document.getElementById('victory-screen');

const finalScore = document.getElementById('final-score');
const victoryScore = document.getElementById('victory-score');

const startBtn = document.getElementById('start-btn');
const weaponCards = document.querySelectorAll('.weapon-card');

// 게임 진행 제어
const maxStage = 5;
let selectedWeapon = null;
let stage = 1; let score = 0; let stageScoreOffset = 0;
let isGameOver = false; let isGameStarted = false;
let animationId, spawnInterval;
let bossSpawned = false;

// 보스 기믹용 변수
let obstacles = [];
let obstacleInterval = null;
let shieldZone = null;
let waveWarningTimer = 0;

// 마우스 상태
let isMouseDown = false;

const keys = { w: false, a: false, s: false, d: false, space: false, e: false };
const mouse = { x: canvas.width / 2, y: canvas.height / 2 };

const getDist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

// 무기 선택
weaponCards.forEach(card => {
  card.addEventListener('click', () => {
    weaponCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedWeapon = card.dataset.weapon;
    startBtn.disabled = false;
  });
});

class Player {
  constructor(x, y, weaponType) {
    this.x = x; this.y = y;
    this.radius = 12;
    this.color = '#00ffcc';
    this.speed = 4.2;
    this.angle = 0;
    this.weaponType = weaponType;
    this.weaponLevel = 1;
    
    // 체력
    this.hp = 5; 
    this.maxHp = 8;
    
    this.invincibleTimer = 0;
    
    this.isSwinging = false;
    this.swingProgress = 0;
    this.lastShotTime = 0;

    // 근접검 전용 카운터 (스택)
    this.swordSwingCount = 0;
    this.maxSwordSwingCount = 10;

    // 대시 시스템
    this.isDashing = false;
    this.dashTimer = 0;
    this.lastDashTime = 0;
    this.dashCooldown = 2000;
    this.dashDir = { x: 0, y: 0 };

    // 일반 무기용 궁극기 게이지
    this.ultGauge = 0;
    this.maxUltGauge = 100;

    // 스나이퍼 차징 및 장전 시스템
    this.sniperChargeTime = 0;
    this.maxSniperCharge = 45; 
    this.lastReloadTime = 0;
    this.reloadCooldown = 700;  
    this.isReloading = false;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    
    if (this.isDashing) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#00ffcc';
      ctx.beginPath();
      ctx.arc(-this.dashDir.x * 10, -this.dashDir.y * 10, this.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.invincibleTimer > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }

    // 검 강화 휘두르기 시각 효과 (레벨에 따라 대폭 확대)
    if (this.weaponType === 'sword' && this.isSwinging) {
      ctx.save();
      ctx.rotate(this.angle + this.swingProgress);
      const swordRange = 100 + this.weaponLevel * 25; // 레벨업 시 공격범위 대폭 확대
      
      let swordGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, swordRange);
      swordGrad.addColorStop(0, 'rgba(0, 255, 204, 0.1)');
      swordGrad.addColorStop(0.8, 'rgba(0, 255, 204, 0.6)');
      swordGrad.addColorStop(1, '#ffffff');

      ctx.fillStyle = swordGrad;
      ctx.beginPath();
      ctx.arc(0, 0, swordRange, -1.2, 1.2);
      ctx.lineTo(0, 0);
      ctx.fill();
      ctx.restore();
    }

    ctx.rotate(this.angle);
    ctx.fillStyle = '#333'; ctx.fillRect(5, -6, 15, 12);

    let grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
    grad.addColorStop(0, '#fff'); grad.addColorStop(1, this.color);
    
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = this.color; ctx.shadowBlur = 15;
    ctx.fill();
    ctx.restore();

    // 스나이퍼 차징 UI (아이템으로 레벨업 시 해금/강화)
    if (this.weaponType === 'sniper') {
      if (this.isReloading) {
        ctx.save();
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('RELOADING...', this.x, this.y - 22);
        ctx.restore();
      } else if (this.weaponLevel > 1 && isMouseDown) {
        // 아이템 먹고 Lv.2 이상일 때 차징 효과 발동
        const chargeRatio = Math.min(1, this.sniperChargeTime / this.maxSniperCharge);
        ctx.save();
        ctx.strokeStyle = chargeRatio >= 1 ? '#ff0000' : '#ff9900';
        ctx.lineWidth = 4 + this.weaponLevel;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 8, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * chargeRatio));
        ctx.stroke();

        if (chargeRatio >= 1) {
          ctx.fillStyle = '#ff0000';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('MAX CHARGE!', this.x, this.y - 25);
        }
        ctx.restore();
      }
    }
  }

  update() {
    const now = Date.now();
    
    if (this.weaponType === 'sniper' && this.isReloading) {
      if (now - this.lastReloadTime >= Math.max(300, this.reloadCooldown - (this.weaponLevel * 80))) {
        this.isReloading = false;
      }
    }

    if (this.isDashing) {
      this.x += this.dashDir.x * 9;
      this.y += this.dashDir.y * 9;
      this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
      
      this.dashTimer--;
      if (this.dashTimer <= 0) this.isDashing = false;
    } else {
      let moveX = 0; let moveY = 0;
      if (keys.w) moveY -= 1;
      if (keys.s) moveY += 1;
      if (keys.a) moveX -= 1;
      if (keys.d) moveX += 1;

      if (moveX !== 0 || moveY !== 0) {
        const len = Math.hypot(moveX, moveY);
        let nextX = this.x + (moveX / len) * this.speed;
        let nextY = this.y + (moveY / len) * this.speed;

        let canMove = true;
        obstacles.forEach(ob => {
          if (getDist(nextX, nextY, ob.x, ob.y) < this.radius + ob.radius) {
            canMove = false;
          }
        });

        if (canMove) {
          this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, nextX));
          this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, nextY));
        }
      }
    }

    this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
    if (this.invincibleTimer > 0) this.invincibleTimer--;

    if (this.isSwinging) {
      this.swingProgress += 0.3;
      if (this.swingProgress > 1.2) {
        this.isSwinging = false;
        this.swingProgress = 0;
      }
    }

    // 스나이퍼 차징 (아이템 강화 후 가능)
    if (this.weaponType === 'sniper' && isMouseDown && !this.isReloading && this.weaponLevel > 1) {
      this.sniperChargeTime++;
    }

    this.draw();
  }

  dash() {
    const now = Date.now();
    if (now - this.lastDashTime < this.dashCooldown || this.isDashing) return;

    let dx = 0; let dy = 0;
    if (keys.w) dy -= 1;
    if (keys.s) dy += 1;
    if (keys.a) dx -= 1;
    if (keys.d) dx += 1;

    if (dx === 0 && dy === 0) {
      dx = Math.cos(this.angle);
      dy = Math.sin(this.angle);
    } else {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
    }

    this.isDashing = true;
    this.dashTimer = 12;
    this.invincibleTimer = 18;
    this.lastDashTime = now;
    this.dashDir = { x: dx, y: dy };
    createExplosion(this.x, this.y, '#00ffcc', 12);
  }

  useSkillOrUltimate() {
    // 검 강화 스킬 (E 키)
    if (this.weaponType === 'sword') {
      if (this.swordSwingCount >= 10) {
        // 궁극기 (스택 10): 360도 전 방향 차원의 검기 폭발 (Omni Slashes)
        this.swordSwingCount = 0;
        createExplosion(this.x, this.y, '#ff3366', 50);

        const sliceCount = 12 + this.weaponLevel * 2;
        for (let i = 0; i < sliceCount; i++) {
          const a = (Math.PI * 2 / sliceCount) * i;
          projectiles.push(new Projectile(
            this.x, this.y, 24, '#ff3366',
            { x: Math.cos(a) * 14, y: Math.sin(a) * 14 },
            700, 20 + this.weaponLevel * 6, true, true
          ));
        }
      } else if (this.swordSwingCount >= 3) {
        // 기본 스킬 (스택 3 이상): 강력한 전방 대형 검기 (Mega Wave)
        this.swordSwingCount -= 3;
        createExplosion(this.x, this.y, '#00ffcc', 25);
        
        projectiles.push(new Projectile(
          this.x, this.y, 32, '#00ffcc',
          { x: Math.cos(this.angle) * 16, y: Math.sin(this.angle) * 16 },
          600, 10 + this.weaponLevel * 5, true, true
        ));
      }
      return;
    }

    if (this.ultGauge < this.maxUltGauge) return;
    this.ultGauge = 0;

    createExplosion(canvas.width / 2, canvas.height / 2, '#00ffcc', 150);
    enemyProjectiles = [];

    enemies.forEach(e => {
      e.hp -= 20 + this.weaponLevel * 5;
      createExplosion(e.x, e.y, e.color, 15);
    });
    enemies = enemies.filter(e => e.hp > 0);

    if (boss) {
      boss.takeDamage(40 + this.weaponLevel * 10);
    }
  }

  hit(damage = 1) {
    if (this.invincibleTimer > 0 || this.isDashing) return;
    this.hp -= damage;
    this.invincibleTimer = 60;
    updateHpUI();
    if (this.hp <= 0) endGame();
  }

  releaseSniperShot() {
    if (this.weaponType !== 'sniper' || this.isReloading) return;

    // 아이템으로 레벨업(Lv2 이상)을 해야 차징 탄환 사격
    if (this.weaponLevel > 1) {
      const chargeRatio = Math.min(1, this.sniperChargeTime / this.maxSniperCharge);
      this.sniperChargeTime = 0;

      this.isReloading = true;
      this.lastReloadTime = Date.now();

      if (chargeRatio >= 0.8) {
        // 풀 차징 사격 (강력한 주황/레드 관통탄)
        const pSpeed = 40;
        createExplosion(this.x, this.y, '#ff0000', 30);
        projectiles.push(new Projectile(
          this.x + Math.cos(this.angle) * 20,
          this.y + Math.sin(this.angle) * 20,
          16 + this.weaponLevel * 2, '#ff0000',
          { x: Math.cos(this.angle) * pSpeed, y: Math.sin(this.angle) * pSpeed },
          1500, 35 + this.weaponLevel * 10, true, true
        ));
      } else {
        // 부분 차징
        const pSpeed = 26;
        projectiles.push(new Projectile(
          this.x + Math.cos(this.angle) * 20,
          this.y + Math.sin(this.angle) * 20,
          9 + this.weaponLevel, '#ff9900',
          { x: Math.cos(this.angle) * pSpeed, y: Math.sin(this.angle) * pSpeed },
          1000, 12 + this.weaponLevel * 4, true, false
        ));
      }
    } else {
      // 레벨 1 기본 스나이퍼 사격
      this.isReloading = true;
      this.lastReloadTime = Date.now();
      const pSpeed = 22;
      projectiles.push(new Projectile(
        this.x + Math.cos(this.angle) * 20,
        this.y + Math.sin(this.angle) * 20,
        7, '#ffcc00',
        { x: Math.cos(this.angle) * pSpeed, y: Math.sin(this.angle) * pSpeed },
        900, 15, true, false
      ));
    }
  }

  shoot() {
    const now = Date.now();
    if (this.weaponType === 'sniper') return;

    let cooldown = 250;
    if (this.weaponType === 'shotgun' || this.weaponType === 'double') cooldown = Math.max(200, 420 - this.weaponLevel * 40);
    if (this.weaponType === 'sword') cooldown = 200; 

    if (now - this.lastShotTime < cooldown) return;
    this.lastShotTime = now;

    // 샷건 개편 (레벨업 시 펠릿 대폭 증가 + 강력한 광역 넉백)
    if (this.weaponType === 'shotgun' || this.weaponType === 'double') {
      const pelletCount = 6 + this.weaponLevel * 3; // 레벨당 펠릿 급증
      const spreadAngle = 0.65; 
      const pSpeed = 18 + this.weaponLevel;
      const maxDist = 300 + this.weaponLevel * 40; 

      createExplosion(this.x + Math.cos(this.angle) * 15, this.y + Math.sin(this.angle) * 15, '#ff9900', 15);
      this.x -= Math.cos(this.angle) * 6;
      this.y -= Math.sin(this.angle) * 6;

      for (let i = 0; i < pelletCount; i++) {
        const angleOffset = (i - (pelletCount - 1) / 2) * (spreadAngle / pelletCount) + (Math.random() - 0.5) * 0.1;
        const currentAngle = this.angle + angleOffset;
        
        projectiles.push(new Projectile(
          this.x + Math.cos(currentAngle) * 15,
          this.y + Math.sin(currentAngle) * 15,
          6 + Math.floor(this.weaponLevel * 0.5), '#ff9900',
          { x: Math.cos(currentAngle) * pSpeed, y: Math.sin(currentAngle) * pSpeed },
          maxDist, 3 + Math.floor(this.weaponLevel * 1.5), true, true // 넉백 및 관통
        ));
      }
    } else if (this.weaponType === 'sword') {
      // 검 강화 및 개편
      if (!this.isSwinging) {
        this.isSwinging = true;
        this.swingProgress = -1.2;
        if (this.swordSwingCount < this.maxSwordSwingCount) this.swordSwingCount++;

        const swordRange = 100 + this.weaponLevel * 25; // 확장된 공격 범위
        
        // 관통 검기 파동 (Slash Wave) 자동 발사
        projectiles.push(new Projectile(
          this.x + Math.cos(this.angle) * 20,
          this.y + Math.sin(this.angle) * 20,
          14 + this.weaponLevel * 2, 'rgba(0, 255, 204, 0.9)',
          { x: Math.cos(this.angle) * 15, y: Math.sin(this.angle) * 15 },
          400 + this.weaponLevel * 50, 5 + this.weaponLevel * 3, true, true
        ));

        // 근접 검 직접 타격 및 강력한 넉백
        enemies.forEach((e, ei) => {
          if (getDist(this.x, this.y, e.x, e.y) < swordRange + e.radius) {
            e.hp -= 10 + this.weaponLevel * 5; // 기본 데미지 대폭 증가
            
            // 강력한 광역 넉백
            const kAngle = Math.atan2(e.y - this.y, e.x - this.x);
            e.x += Math.cos(kAngle) * (30 + this.weaponLevel * 5);
            e.y += Math.sin(kAngle) * (30 + this.weaponLevel * 5);

            createExplosion(e.x, e.y, '#00ffcc', 14);
            if (e.hp <= 0) {
              score += 100; scoreValUI.textContent = score;
              dropItemCheck(e.x, e.y);
              enemies.splice(ei, 1);
            }
          }
        });

        if (boss && getDist(this.x, this.y, boss.x, boss.y) < swordRange + boss.radius) {
          boss.takeDamage(15 + this.weaponLevel * 8); // 보스 추가 데미지 대폭 증가
          const kAngle = Math.atan2(boss.y - this.y, boss.x - this.x);
          boss.x += Math.cos(kAngle) * 10;
          boss.y += Math.sin(kAngle) * 10;
          createExplosion(boss.x, boss.y, '#00ffcc', 20);
        }
      }
    }
  }
}

class Projectile {
  constructor(x, y, radius, color, velocity, maxRange, damage = 1, pierce = false, knockback = false) {
    this.startX = x; this.startY = y;
    this.x = x; this.y = y; this.radius = radius;
    this.color = color; this.velocity = velocity;
    this.maxRange = maxRange;
    this.damage = damage;
    this.pierce = pierce;
    this.knockback = knockback;
    this.hitEntities = new Set();
  }
  draw() {
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.fill();
  }
  update() {
    this.x += this.velocity.x; this.y += this.velocity.y;
    this.draw();
  }
  isOutRange() {
    return getDist(this.startX, this.startY, this.x, this.y) > this.maxRange;
  }
}

class Obstacle {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 35;
    this.color = '#34495e';
  }
  draw() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
  }
}

class Boss {
  constructor(x, y, stageType) {
    this.x = x; this.y = y; this.radius = 45; this.stageType = stageType;
    const colors = ['#ff3366', '#ff9900', '#9b59b6', '#2ecc71', '#e74c3c'];
    this.color = colors[stageType - 1];
    this.maxHp = 60 + stageType * 40; 
    this.hp = this.maxHp;
    this.speed = 0.8 + stageType * 0.12; 
    this.shootTimer = 0;
    this.isDashing = false;
    this.dashVector = { x: 0, y: 0 };
    this.isPhase2 = false;
  }

  takeDamage(amount) {
    this.hp -= amount;
    bossHpFill.style.width = `${Math.max(0, (this.hp / this.maxHp) * 100)}%`;

    if (this.stageType === 5 && !this.isPhase2 && this.hp <= this.maxHp / 2) {
      this.triggerPhase2();
    }

    if (this.hp <= 0) destroyBoss();
  }

  triggerPhase2() {
    this.isPhase2 = true;
    this.color = '#ff0000';
    this.speed = 1.6;

    shieldZone = {
      x: canvas.width / 2,
      y: canvas.height / 2 + 50,
      radius: 70
    };

    waveWarningTimer = 180;
  }

  draw() {
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 25; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    
    ctx.rotate(Date.now() * 0.003);
    ctx.fillStyle = '#111';
    ctx.fillRect(-8, -this.radius - 8, 16, 16);
    ctx.restore();
  }

  update(player) {
    this.shootTimer++;

    if (this.stageType === 4 && this.isDashing) {
      this.x += this.dashVector.x;
      this.y += this.dashVector.y;
      if (this.x < 50 || this.x > canvas.width - 50 || this.y < 50 || this.y > canvas.height - 50) {
        this.isDashing = false;
      }
      this.draw();
      return;
    }

    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    this.x += Math.cos(angle) * this.speed; 
    this.y += Math.sin(angle) * this.speed;

    if (this.stageType === 1) {
      if (this.shootTimer % 90 === 0) {
        for (let i = 0; i < 12; i++) {
          const a = (Math.PI * 2 / 12) * i;
          enemyProjectiles.push(new Projectile(this.x, this.y, 6, this.color, { x: Math.cos(a) * 3.5, y: Math.sin(a) * 3.5 }, 1000));
        }
      }
    } else if (this.stageType === 2) {
      if (this.shootTimer % 45 === 0) {
        for(let i = -1; i <= 1; i++) {
          enemyProjectiles.push(new Projectile(this.x, this.y, 7, this.color, {
            x: Math.cos(angle + i * 0.2) * 4.8,
            y: Math.sin(angle + i * 0.2) * 4.8
          }, 1000));
        }
      }
    } else if (this.stageType === 3) {
      if (this.shootTimer % 8 === 0) {
        const spiralAngle = this.shootTimer * 0.2;
        enemyProjectiles.push(new Projectile(this.x, this.y, 6, this.color, {
          x: Math.cos(spiralAngle) * 4.2,
          y: Math.sin(spiralAngle) * 4.2
        }, 1000));
      }
    } else if (this.stageType === 4) {
      if (this.shootTimer % 120 === 0) {
        this.isDashing = true;
        this.dashVector = { x: Math.cos(angle) * 9, y: Math.sin(angle) * 9 };
        setTimeout(() => { this.isDashing = false; }, 600);
      }
      if (this.shootTimer % 50 === 0) {
        enemyProjectiles.push(new Projectile(this.x, this.y, 8, '#2ecc71', { x: Math.cos(angle) * 6, y: Math.sin(angle) * 6 }, 1000));
      }
    } else if (this.stageType === 5) {
      const interval = this.isPhase2 ? 40 : 60;
      
      if (this.shootTimer % interval === 0) {
        const count = this.isPhase2 ? 18 : 14;
        for (let i = 0; i < count; i++) {
          const a = (Math.PI * 2 / count) * i + (this.shootTimer * 0.05);
          enemyProjectiles.push(new Projectile(this.x, this.y, 6, this.color, { x: Math.cos(a) * 4.5, y: Math.sin(a) * 4.5 }, 1000));
        }
      }

      if (this.isPhase2) {
        if (this.shootTimer % 35 === 0) {
          for(let i = -1; i <= 1; i++) {
            enemyProjectiles.push(new Projectile(this.x, this.y, 7, '#ff3300', {
              x: Math.cos(angle + i * 0.2) * 5.5,
              y: Math.sin(angle + i * 0.2) * 5.5
            }, 1000));
          }
        }
        
        if (this.shootTimer % 90 === 0) {
          const crossAngles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
          crossAngles.forEach(ca => {
            enemyProjectiles.push(new Projectile(this.x, this.y, 10, '#ff0055', {
              x: Math.cos(ca) * 6,
              y: Math.sin(ca) * 6
            }, 1000));
          });
        }
      }
    }

    this.draw();
  }
}

class Enemy {
  constructor(x, y, radius, color, hp, speed) {
    this.x = x; this.y = y; this.radius = radius; this.color = color;
    this.speed = speed; this.hp = hp; this.maxHp = hp;
  }
  draw() {
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.beginPath();
    for(let i = 0; i < 6; i++) {
      const theta = (Math.PI * 2 / 6) * i;
      ctx.lineTo(this.radius * Math.cos(theta), this.radius * Math.sin(theta));
    }
    ctx.closePath();
    ctx.fillStyle = this.color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

    if (this.maxHp > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-this.radius, -this.radius - 8, this.radius * 2, 4);
      ctx.fillStyle = '#00ffcc'; ctx.fillRect(-this.radius, -this.radius - 8, (this.radius * 2) * (this.hp / this.maxHp), 4);
    }
    ctx.restore();
  }
  update(player) {
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    this.x += Math.cos(angle) * this.speed; this.y += Math.sin(angle) * this.speed;
    this.draw();
  }
}

class Item {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type; this.radius = 12;
    this.color = type === 'weapon' ? '#00ffcc' : '#ff4757';
  }
  draw() {
    ctx.save();
    const pulse = Math.sin(Date.now() * 0.01) * 3;
    ctx.shadowColor = this.color; ctx.shadowBlur = 15;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; ctx.fill();
    ctx.fillStyle = this.color; ctx.fillRect(this.x - 6, this.y - 6, 12, 12);
    ctx.fillStyle = '#0d0e15'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
    ctx.fillText(this.type === 'weapon' ? 'UP' : 'HP', this.x, this.y + 3);
    ctx.restore();
  }
  update(player) {
    if (getDist(this.x, this.y, player.x, player.y) < 120) {
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(angle) * 6; this.y += Math.sin(angle) * 6;
    }
    this.draw();
  }
}

class Particle {
  constructor(x, y, color, velocity) {
    this.x = x; this.y = y; this.radius = Math.random() * 3 + 1;
    this.color = color; this.velocity = velocity; this.alpha = 1;
  }
  draw() {
    ctx.save(); ctx.globalAlpha = this.alpha;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color; ctx.fill(); ctx.restore();
  }
  update() {
    this.x += this.velocity.x; this.y += this.velocity.y;
    this.alpha -= 0.02; this.draw();
  }
}

let player, projectiles = [], enemyProjectiles = [], enemies = [], particles = [], items = [], boss = null;

function updateHpUI() {
  let hearts = '';
  for (let i = 0; i < player.hp; i++) hearts += '❤';
  playerHpUI.textContent = hearts;
}

function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(20, canvas.height - 30, 150, 12);

  if (player.weaponType === 'sword') {
    const fillWidth = (player.swordSwingCount / player.maxSwordSwingCount) * 150;
    let barColor = '#3498db';
    let statusText = `[E] SWORD (${player.swordSwingCount}/10)`;

    if (player.swordSwingCount >= 10) {
      barColor = '#ff3366';
      statusText = `[E] OMNI SLASH!`;
    } else if (player.swordSwingCount >= 3) {
      barColor = '#00ffcc';
      statusText = `[E] MEGA WAVE (${player.swordSwingCount})`;
    }

    ctx.fillStyle = barColor;
    ctx.fillRect(20, canvas.height - 30, fillWidth, 12);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(20, canvas.height - 30, 150, 12);

    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(statusText, 20, canvas.height - 36);
  } else {
    const fillWidth = (player.ultGauge / player.maxUltGauge) * 150;
    ctx.fillStyle = player.ultGauge >= player.maxUltGauge ? '#00ffcc' : '#ff9900';
    ctx.fillRect(20, canvas.height - 30, fillWidth, 12);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(20, canvas.height - 30, 150, 12);

    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(`[E] ULT: ${player.ultGauge >= player.maxUltGauge ? 'READY!' : Math.floor(player.ultGauge) + '%'}`, 20, canvas.height - 36);
  }

  ctx.fillText(`[Space] DASH`, 190, canvas.height - 36);
  ctx.restore();
}

function spawnObstacles() {
  obstacles = [];
  const minDistanceFromPlayer = 120;

  for (let i = 0; i < 2; i++) {
    let obX, obY, dist;
    let attempts = 0;

    do {
      obX = Math.random() * (canvas.width - 200) + 100;
      obY = Math.random() * (canvas.height - 200) + 100;
      dist = getDist(player.x, player.y, obX, obY);
      attempts++;
    } while (dist < minDistanceFromPlayer && attempts < 100);

    obstacles.push(new Obstacle(obX, obY));
  }
}

function dropItemCheck(x, y) {
  const rand = Math.random();
  if (rand < 0.12) items.push(new Item(x, y, 'weapon')); // 무기 강화 아이템 드랍률 상향
  else if (rand < 0.22) items.push(new Item(x, y, 'hp'));
}

function destroyBoss() {
  createExplosion(boss.x, boss.y, boss.color, 60);
  score += 2000; scoreValUI.textContent = score;
  boss = null;
  obstacles = [];
  shieldZone = null;
  if (obstacleInterval) clearInterval(obstacleInterval);

  bossHpContainer.classList.add('hidden');
  clearInterval(spawnInterval);

  if (stage >= maxStage) {
    showVictoryEnding();
  } else {
    advanceStage();
  }
}

function showVictoryEnding() {
  isGameOver = true;
  cancelAnimationFrame(animationId);
  victoryScore.textContent = score;
  victoryScreen.classList.remove('hidden');
}

function init() {
  stage = 1; score = 0; stageScoreOffset = 0;
  player = new Player(canvas.width / 2, canvas.height / 2, selectedWeapon);
  
  const names = { double: '샷건', shotgun: '샷건', sword: '근접검', sniper: '스나이퍼' };
  weaponTypeUI.textContent = names[selectedWeapon] || selectedWeapon;
  
  resetStageState();
}

function resetStageState() {
  projectiles = []; enemyProjectiles = []; enemies = []; particles = []; items = []; boss = null;
  obstacles = []; shieldZone = null; waveWarningTimer = 0; isMouseDown = false;
  if (obstacleInterval) clearInterval(obstacleInterval);

  isGameOver = false; bossSpawned = false;
  stageValUI.textContent = stage; scoreValUI.textContent = score;
  weaponLvlUI.textContent = player.weaponLevel;
  updateHpUI();
  
  bossHpContainer.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  victoryScreen.classList.add('hidden');
  stageClearMsg.classList.add('hidden');
}

function spawnEntities() {
  spawnInterval = setInterval(() => {
    if (isGameOver || !isGameStarted || boss) return;
    let x = Math.random() < 0.5 ? -30 : canvas.width + 30;
    let y = Math.random() * canvas.height;
    if(Math.random() < 0.5) { x = Math.random() * canvas.width; y = Math.random() < 0.5 ? -30 : canvas.height + 30; }

    const enemyHp = 1 + Math.floor((stage - 1) * 1.2);
    const enemySpeed = (1.2 + Math.random()) + (stage - 1) * 0.2;
    const colors = ['#8e44ad', '#27ae60', '#e74c3c', '#f39c12', '#16a085'];
    enemies.push(new Enemy(x, y, 12 + Math.random() * 12, colors[(stage - 1) % colors.length], enemyHp, enemySpeed));
  }, 1000 - (stage * 50));
}

function createExplosion(x, y, color, count) {
  for(let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, color, {
      x: (Math.random() - 0.5) * (Math.random() * 7),
      y: (Math.random() - 0.5) * (Math.random() * 7)
    }));
  }
}

function advanceStage() {
  stageClearMsg.classList.remove('hidden');
  setTimeout(() => {
    stage++; stageScoreOffset = score;
    resetStageState(); spawnEntities();
  }, 2000);
}

function animate() {
  if (isGameOver) return;
  animationId = requestAnimationFrame(animate);

  ctx.fillStyle = 'rgba(16, 18, 24, 0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  player.update();
  drawHUD();

  if ((score - stageScoreOffset) >= 800 + (stage * 200) && !bossSpawned) {
    bossSpawned = true;
    boss = new Boss(canvas.width / 2, -60, stage);
    bossHpContainer.classList.remove('hidden');
    bossHpFill.style.width = '100%';

    if (stage === 5) {
      spawnObstacles();
      obstacleInterval = setInterval(spawnObstacles, 5000);
    }
  }

  obstacles.forEach(ob => ob.draw());

  if (shieldZone) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(shieldZone.x, shieldZone.y, shieldZone.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 204, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 15;
    ctx.stroke();

    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SHIELD ZONE', shieldZone.x, shieldZone.y + 5);
    ctx.restore();

    if (waveWarningTimer > 0) {
      waveWarningTimer--;

      ctx.save();
      ctx.fillStyle = '#ff0000';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ WARNING: SHOCKWAVE COMING! GET IN SHIELD! ⚠️', canvas.width / 2, 120);
      ctx.restore();

      if (waveWarningTimer === 0) {
        createExplosion(canvas.width / 2, canvas.height / 2, '#ff0000', 200);
        
        if (getDist(player.x, player.y, shieldZone.x, shieldZone.y) > shieldZone.radius) {
          player.hit(3);
        }
        shieldZone = null;
      }
    }
  }

  if (boss) {
    boss.update(player);
    if (getDist(player.x, player.y, boss.x, boss.y) < player.radius + boss.radius) player.hit();
  }

  particles.forEach((p, i) => { if (p.alpha <= 0) particles.splice(i, 1); else p.update(); });

  // 아이템 습득 판정 및 무기 레벨업
  items.forEach((item, i) => {
    item.update(player);
    if (getDist(item.x, item.y, player.x, player.y) < player.radius + item.radius) {
      if (item.type === 'weapon') {
        player.weaponLevel++;
        weaponLvlUI.textContent = player.weaponLevel;
      } else if (item.type === 'hp' && player.hp < player.maxHp) {
        player.hp++;
        updateHpUI();
      }
      createExplosion(player.x, player.y, item.color, 18);
      items.splice(i, 1);
    }
  });

  projectiles.forEach((p, pi) => {
    p.update();
    if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height || p.isOutRange()) {
      projectiles.splice(pi, 1); return;
    }

    if (boss && getDist(p.x, p.y, boss.x, boss.y) < p.radius + boss.radius) {
      if (!p.hitEntities.has(boss)) {
        if (p.pierce) p.hitEntities.add(boss);
        boss.takeDamage(p.damage);
        
        if (p.knockback) {
          const kAngle = Math.atan2(boss.y - p.startY, boss.x - p.startX);
          boss.x += Math.cos(kAngle) * 5;
          boss.y += Math.sin(kAngle) * 5;
        }

        createExplosion(p.x, p.y, boss.color, 4);
        if (!p.pierce) projectiles.splice(pi, 1);
        return;
      }
    }

    enemies.forEach((e, ei) => {
      if (getDist(p.x, p.y, e.x, e.y) < p.radius + e.radius) {
        if (!p.hitEntities.has(e)) {
          if (p.pierce) p.hitEntities.add(e);
          e.hp -= p.damage;

          if (p.knockback) {
            const kAngle = Math.atan2(e.y - player.y, e.x - player.x);
            e.x += Math.cos(kAngle) * 18;
            e.y += Math.sin(kAngle) * 18;
          }

          createExplosion(p.x, p.y, e.color, 4);
          if (!p.pierce) projectiles.splice(pi, 1);

          if (e.hp <= 0) {
            createExplosion(e.x, e.y, e.color, 12);
            score += 100; scoreValUI.textContent = score;
            if (player.weaponType !== 'sword') {
              player.ultGauge = Math.min(player.maxUltGauge, player.ultGauge + 5);
            }
            dropItemCheck(e.x, e.y);
            enemies.splice(ei, 1);
          }
        }
      }
    });
  });

  enemyProjectiles.forEach((ep, epi) => {
    ep.update();
    if (ep.x < 0 || ep.x > canvas.width || ep.y < 0 || ep.y > canvas.height) {
      enemyProjectiles.splice(epi, 1); return;
    }

    let hitObstacle = false;
    obstacles.forEach(ob => {
      if (getDist(ep.x, ep.y, ob.x, ob.y) < ep.radius + ob.radius) {
        createExplosion(ep.x, ep.y, '#00ffcc', 4);
        hitObstacle = true;
      }
    });

    if (hitObstacle) {
      enemyProjectiles.splice(epi, 1);
      return;
    }

    if (getDist(player.x, player.y, ep.x, ep.y) < player.radius + ep.radius) {
      player.hit(); enemyProjectiles.splice(epi, 1);
    }
  });

  enemies.forEach(e => {
    e.update(player);
    if (getDist(e.x, e.y, player.x, player.y) < e.radius + player.radius) player.hit();
  });
}

function endGame() {
  isGameOver = true;
  cancelAnimationFrame(animationId);
  clearInterval(spawnInterval);
  if (obstacleInterval) clearInterval(obstacleInterval);
  finalScore.textContent = score;
  gameOverScreen.classList.remove('hidden');
}

// 키보드 및 마우스 이벤트
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    if (isGameStarted && !isGameOver) player.dash();
  }
  if (k === 'e') {
    if (isGameStarted && !isGameOver) player.useSkillOrUltimate();
  }
  if (keys.hasOwnProperty(k)) keys[k] = true;
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (keys.hasOwnProperty(k)) keys[k] = false;
});

canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });

canvas.addEventListener('mousedown', () => {
  if (isGameStarted && !isGameOver) {
    isMouseDown = true;
    player.shoot();
  }
});

canvas.addEventListener('mouseup', () => {
  if (isGameStarted && !isGameOver) {
    if (player.weaponType === 'sniper' && isMouseDown) {
      player.releaseSniperShot();
    }
    isMouseDown = false;
  }
});

startBtn.addEventListener('click', () => {
  if (!selectedWeapon) return;
  isGameStarted = true;
  startScreen.classList.remove('hidden');
  init(); animate(); spawnEntities();
});

document.getElementById('restart-btn').addEventListener('click', () => {
  startScreen.classList.remove('hidden');
  gameOverScreen.classList.add('hidden');
});

document.getElementById('victory-restart-btn').addEventListener('click', () => {
  startScreen.classList.remove('hidden');
  victoryScreen.classList.add('hidden');
});