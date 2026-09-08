// RoboMind Academy — Interactive Labs
// Six vanilla-JS/Canvas simulators used to teach core robotics concepts.
// Every widget guards on its DOM elements existing, so this file is safe
// to include on any page.

document.addEventListener("DOMContentLoaded", () => {
  initDiffDriveLab();
  initPidLab();
  initAStarLab();
  initLocalPlannerLab();
  initIouLab();
  initRosPipelineLab();
  initQuiz();
});

/* =========================================================
   LAB 1 — Differential Drive Kinematics Simulator
   ========================================================= */
function initDiffDriveLab() {
  const canvas = document.getElementById("dd-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const PPM = 90; // pixels per meter
  const WHEEL_BASE = 0.18; // meters
  const WHEEL_R = 0.032; // meters
  const MAX_WHEEL_SPEED = 6; // rad/s at slider extremes

  const leftSlider = document.getElementById("dd-left");
  const rightSlider = document.getElementById("dd-right");
  const leftVal = document.getElementById("dd-leftVal");
  const rightVal = document.getElementById("dd-rightVal");
  const vReadout = document.getElementById("dd-v");
  const wReadout = document.getElementById("dd-w");
  const poseReadout = document.getElementById("dd-pose");
  const startBtn = document.getElementById("dd-start");
  const resetBtn = document.getElementById("dd-reset");
  const statusEl = document.getElementById("dd-status");

  let state = { x: (W / 2) / PPM, y: (H / 2) / PPM, theta: 0 };
  let trail = [];
  let running = false;
  let lastT = null;

  function setSliders(l, r) {
    leftSlider.value = l;
    rightSlider.value = r;
    leftSlider.dispatchEvent(new Event("input"));
    rightSlider.dispatchEvent(new Event("input"));
  }

  document.querySelectorAll("[data-dd-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-dd-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const preset = btn.dataset.ddPreset;
      if (preset === "straight") setSliders(60, 60);
      if (preset === "rotate") setSliders(-45, 45);
      if (preset === "arc") setSliders(25, 70);
      if (preset === "stop") setSliders(0, 0);
      if (!running) toggleRun(true);
    });
  });

  leftSlider.addEventListener("input", () => (leftVal.textContent = leftSlider.value));
  rightSlider.addEventListener("input", () => (rightVal.textContent = rightSlider.value));

  function drawGrid() {
    ctx.fillStyle = "#060a14";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    const step = PPM * 0.5;
    for (let x = 0; x < W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  function drawRobot(px, py, theta) {
    // trail
    ctx.strokeStyle = "rgba(94,234,212,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    trail.forEach((p, i) => {
      const tx = p.x * PPM, ty = p.y * PPM;
      i === 0 ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
    });
    ctx.stroke();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(theta);
    const bodyW = 0.16 * PPM, bodyL = 0.20 * PPM;

    // wheels
    ctx.fillStyle = "#1b2340";
    ctx.strokeStyle = "#5eead4";
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.rect(-bodyL / 2 + 4, side * (bodyW / 2) - 4, bodyL - 8, 8);
      ctx.fill();
    });

    // body
    const grad = ctx.createLinearGradient(-bodyL / 2, 0, bodyL / 2, 0);
    grad.addColorStop(0, "#5eead4");
    grad.addColorStop(1, "#a78bfa");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-bodyL / 2, -bodyW / 2, bodyL, bodyW, 6);
    ctx.fill();

    // heading arrow
    ctx.strokeStyle = "#04231f";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(bodyL / 2 + 10, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bodyL / 2 + 10, 0);
    ctx.lineTo(bodyL / 2 + 2, -5);
    ctx.lineTo(bodyL / 2 + 2, 5);
    ctx.closePath();
    ctx.fillStyle = "#04231f";
    ctx.fill();

    ctx.restore();
  }

  function step(dt) {
    const lSlider = parseFloat(leftSlider.value) / 100;
    const rSlider = parseFloat(rightSlider.value) / 100;
    const wl = lSlider * MAX_WHEEL_SPEED;
    const wr = rSlider * MAX_WHEEL_SPEED;
    const vl = wl * WHEEL_R;
    const vr = wr * WHEEL_R;
    const v = (vl + vr) / 2;
    const w = (vr - vl) / WHEEL_BASE;

    state.x += v * Math.cos(state.theta) * dt;
    state.y += v * Math.sin(state.theta) * dt;
    state.theta += w * dt;

    const worldW = W / PPM, worldH = H / PPM;
    if (state.x < 0) state.x += worldW;
    if (state.x > worldW) state.x -= worldW;
    if (state.y < 0) state.y += worldH;
    if (state.y > worldH) state.y -= worldH;

    trail.push({ x: state.x, y: state.y });
    if (trail.length > 400) trail.shift();

    vReadout.textContent = v.toFixed(2) + " m/s";
    wReadout.textContent = w.toFixed(2) + " rad/s";
    poseReadout.textContent =
      `(${state.x.toFixed(2)}, ${state.y.toFixed(2)}, ${(state.theta * 180 / Math.PI).toFixed(0)}°)`;
  }

  function frame(t) {
    if (!lastT) lastT = t;
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    if (running) step(dt);
    drawGrid();
    drawRobot(state.x * PPM, state.y * PPM, state.theta);
    requestAnimationFrame(frame);
  }

  function toggleRun(forceOn) {
    running = forceOn !== undefined ? forceOn : !running;
    startBtn.textContent = running ? "⏸ Pause" : "▶ Start";
    statusEl.textContent = running ? "Simulating…" : "Paused";
  }

  startBtn.addEventListener("click", () => toggleRun());
  resetBtn.addEventListener("click", () => {
    state = { x: (W / 2) / PPM, y: (H / 2) / PPM, theta: 0 };
    trail = [];
    setSliders(0, 0);
    document.querySelectorAll("[data-dd-preset]").forEach((b) => b.classList.remove("active"));
    toggleRun(false);
  });

  drawGrid();
  drawRobot(state.x * PPM, state.y * PPM, state.theta);
  requestAnimationFrame(frame);
}

/* =========================================================
   LAB 2 — PID Controller Playground
   ========================================================= */
function initPidLab() {
  const canvas = document.getElementById("pid-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const kpSlider = document.getElementById("pid-kp");
  const kiSlider = document.getElementById("pid-ki");
  const kdSlider = document.getElementById("pid-kd");
  const kpVal = document.getElementById("pid-kpVal");
  const kiVal = document.getElementById("pid-kiVal");
  const kdVal = document.getElementById("pid-kdVal");
  const runBtn = document.getElementById("pid-run");
  const overshootEl = document.getElementById("pid-overshoot");
  const settleEl = document.getElementById("pid-settle");
  const presetBtns = document.querySelectorAll("[data-pid-preset]");

  [[kpSlider, kpVal], [kiSlider, kiVal], [kdSlider, kdVal]].forEach(([slider, out]) => {
    slider.addEventListener("input", () => (out.textContent = parseFloat(slider.value).toFixed(2)));
    out.textContent = parseFloat(slider.value).toFixed(2);
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const [kp, ki, kd] = btn.dataset.pidPreset.split(",").map(Number);
      kpSlider.value = kp; kiSlider.value = ki; kdSlider.value = kd;
      [kpSlider, kiSlider, kdSlider].forEach((s) => s.dispatchEvent(new Event("input")));
      simulateAndDraw();
    });
  });

  function simulate() {
    const Kp = parseFloat(kpSlider.value);
    const Ki = parseFloat(kiSlider.value);
    const Kd = parseFloat(kdSlider.value);
    const setpoint = 1.0;
    const tau = 0.35; // plant time constant
    const dt = 0.02;
    const steps = 300; // 6 seconds

    let v = 0, integral = 0, prevErr = 0;
    const data = [];
    for (let i = 0; i < steps; i++) {
      const err = setpoint - v;
      integral += err * dt;
      integral = Math.max(-3, Math.min(3, integral));
      const deriv = (err - prevErr) / dt;
      let u = Kp * err + Ki * integral + Kd * deriv;
      u = Math.max(-2.5, Math.min(2.5, u)); // actuator saturation
      v += ((u - v) / tau) * dt;
      prevErr = err;
      data.push(v);
    }
    return { data, setpoint, dt };
  }

  function drawFrame(data, setpoint, upTo) {
    ctx.fillStyle = "#060a14";
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const yMax = 1.6;
    const toY = (val) => H - (val / yMax) * H;
    const toX = (i) => (i / data.length) * W;

    // setpoint line
    ctx.strokeStyle = "rgba(167,139,250,0.8)";
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, toY(setpoint));
    ctx.lineTo(W, toY(setpoint));
    ctx.stroke();
    ctx.setLineDash([]);

    // response curve
    ctx.strokeStyle = "#5eead4";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < upTo; i++) {
      const x = toX(i), y = toY(data[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (upTo > 0) {
      const lastX = toX(upTo - 1), lastY = toY(data[upTo - 1]);
      ctx.fillStyle = "#5eead4";
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let animId = null;
  function simulateAndDraw() {
    if (animId) cancelAnimationFrame(animId);
    const { data, setpoint } = simulate();
    let i = 0;
    const pointsPerFrame = 4;
    function tick() {
      i += pointsPerFrame;
      drawFrame(data, setpoint, Math.min(i, data.length));
      if (i < data.length) {
        animId = requestAnimationFrame(tick);
      } else {
        const max = Math.max(...data);
        const overshoot = Math.max(0, ((max - setpoint) / setpoint) * 100);
        overshootEl.textContent = overshoot.toFixed(1) + "%";
        let settleIdx = data.length - 1;
        for (let k = data.length - 1; k >= 0; k--) {
          if (Math.abs(data[k] - setpoint) > 0.02 * setpoint) { settleIdx = k; break; }
        }
        settleEl.textContent = (settleIdx * 0.02).toFixed(2) + " s";
      }
    }
    tick();
  }

  runBtn.addEventListener("click", simulateAndDraw);
  drawFrame(new Array(300).fill(0), 1.0, 300);
}

/* =========================================================
   LAB 3 — Global Planner (A*) Grid Visualizer
   ========================================================= */
function initAStarLab() {
  const canvas = document.getElementById("astar-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const cols = 26, rows = 14;
  const cell = canvas.width / cols;
  let grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let start = { r: 2, c: 2 };
  let goal = { r: rows - 3, c: cols - 3 };
  let mode = "wall";
  let exploring = [];
  let path = [];
  let timer = null;

  const statusEl = document.getElementById("astar-status");
  const speedSlider = document.getElementById("astar-speed");

  document.querySelectorAll("[data-astar-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-astar-mode]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.astarMode;
    });
  });

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    return { c: Math.floor(x / cell), r: Math.floor(y / cell) };
  }

  function handlePointer(e) {
    const { r, c } = cellFromEvent(e);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    if (mode === "wall") {
      if ((r === start.r && c === start.c) || (r === goal.r && c === goal.c)) return;
      grid[r][c] = grid[r][c] ? 0 : 1;
    } else if (mode === "start") {
      if (!grid[r][c]) start = { r, c };
    } else if (mode === "goal") {
      if (!grid[r][c]) goal = { r, c };
    }
    exploring = []; path = [];
    draw();
  }

  let painting = false;
  canvas.addEventListener("pointerdown", (e) => { painting = true; handlePointer(e); });
  canvas.addEventListener("pointermove", (e) => { if (painting && mode === "wall") handlePointer(e); });
  window.addEventListener("pointerup", () => (painting = false));

  function draw() {
    ctx.fillStyle = "#060a14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let fill = "#0e1526";
        if (grid[r][c]) fill = "#39415f";
        ctx.fillStyle = fill;
        ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
      }
    }
    exploring.forEach(({ r, c }) => {
      ctx.fillStyle = "rgba(167,139,250,0.35)";
      ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
    });
    path.forEach(({ r, c }) => {
      ctx.fillStyle = "rgba(94,234,212,0.85)";
      ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
    });

    drawMarker(start, "#4ade80", "S");
    drawMarker(goal, "#fb923c", "G");
  }

  function drawMarker(pos, color, label) {
    const x = pos.c * cell + cell / 2, y = pos.r * cell + cell / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#04231f";
    ctx.font = `bold ${Math.floor(cell * 0.4)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y + 1);
  }

  function neighbors(node) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const out = [];
    for (const [dr, dc] of dirs) {
      const r = node.r + dr, c = node.c + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols && !grid[r][c]) out.push({ r, c });
    }
    return out;
  }

  function heuristic(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c); }
  function key(n) { return n.r + "," + n.c; }

  function runAStar() {
    if (timer) clearInterval(timer);
    exploring = []; path = [];
    const openSet = [{ ...start, g: 0, f: heuristic(start, goal) }];
    const cameFrom = {};
    const gScore = { [key(start)]: 0 };
    const closed = new Set();
    const order = [];

    while (openSet.length) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();
      const k = key(current);
      if (closed.has(k)) continue;
      closed.add(k);
      order.push(current);

      if (current.r === goal.r && current.c === goal.c) break;

      for (const n of neighbors(current)) {
        const nk = key(n);
        const tentativeG = gScore[k] + 1;
        if (tentativeG < (gScore[nk] ?? Infinity)) {
          gScore[nk] = tentativeG;
          cameFrom[nk] = current;
          openSet.push({ ...n, g: tentativeG, f: tentativeG + heuristic(n, goal) });
        }
      }
    }

    const goalKey = key(goal);
    let finalPath = [];
    if (cameFrom[goalKey] || (start.r === goal.r && start.c === goal.c)) {
      let cur = goal;
      while (cur && !(cur.r === start.r && cur.c === start.c)) {
        finalPath.unshift(cur);
        cur = cameFrom[key(cur)];
      }
    }

    const speed = 301 - parseInt(speedSlider.value, 10);
    let i = 0;
    statusEl.textContent = "Expanding nodes…";
    timer = setInterval(() => {
      if (i < order.length) {
        exploring.push(order[i]);
        i++;
        draw();
      } else {
        clearInterval(timer);
        if (finalPath.length) {
          statusEl.textContent = `Path found — ${finalPath.length} steps.`;
          let j = 0;
          const pathTimer = setInterval(() => {
            if (j < finalPath.length) {
              path.push(finalPath[j]);
              j++;
              draw();
            } else clearInterval(pathTimer);
          }, 25);
        } else {
          statusEl.textContent = "No path found — goal is walled off.";
        }
      }
    }, Math.max(4, speed / 6));
  }

  document.getElementById("astar-run").addEventListener("click", runAStar);
  document.getElementById("astar-clear").addEventListener("click", () => {
    grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
    exploring = []; path = [];
    statusEl.textContent = "Grid cleared. Click cells to add walls.";
    draw();
  });

  draw();
}

/* =========================================================
   LAB 4 — Local Planner: Reactive Obstacle Avoidance
   ========================================================= */
function initLocalPlannerLab() {
  const canvas = document.getElementById("local-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  let robot = { x: 50, y: H / 2, theta: 0 };
  let goal = { x: W - 50, y: H / 2 };
  let obstacles = [
    { x: W * 0.4, y: H * 0.35, r: 22 },
    { x: W * 0.55, y: H * 0.65, r: 26 },
    { x: W * 0.7, y: H * 0.3, r: 18 },
  ];
  let mode = "obstacle";
  let running = false;
  let trail = [];
  const statusEl = document.getElementById("local-status");
  const RAY_COUNT = 10;
  const RAY_LEN = 90;

  document.querySelectorAll("[data-local-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-local-mode]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.localMode;
    });
  });

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX, y = (e.clientY - rect.top) * scaleY;
    if (mode === "goal") {
      goal = { x, y };
    } else {
      const hitIdx = obstacles.findIndex((o) => Math.hypot(o.x - x, o.y - y) < o.r);
      if (hitIdx >= 0) obstacles.splice(hitIdx, 1);
      else if (obstacles.length < 8) obstacles.push({ x, y, r: 18 + Math.random() * 12 });
    }
    draw();
  });

  function castRays() {
    const hits = [];
    for (let i = 0; i < RAY_COUNT; i++) {
      const angle = robot.theta - Math.PI / 2 + (i / (RAY_COUNT - 1)) * Math.PI;
      let dist = RAY_LEN;
      for (const o of obstacles) {
        const dx = o.x - robot.x, dy = o.y - robot.y;
        const proj = dx * Math.cos(angle) + dy * Math.sin(angle);
        if (proj > 0 && proj < RAY_LEN) {
          const perp = Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle));
          if (perp < o.r) dist = Math.min(dist, Math.max(0, proj - o.r));
        }
      }
      hits.push({ angle, dist });
    }
    return hits;
  }

  function step() {
    const toGoal = Math.atan2(goal.y - robot.y, goal.x - robot.x);
    let fx = Math.cos(toGoal), fy = Math.sin(toGoal);

    obstacles.forEach((o) => {
      const dx = robot.x - o.x, dy = robot.y - o.y;
      const dist = Math.hypot(dx, dy);
      const influence = o.r + 55;
      if (dist < influence) {
        const strength = (influence - dist) / influence;
        fx += (dx / dist) * strength * 2.2;
        fy += (dy / dist) * strength * 2.2;
      }
    });

    const targetTheta = Math.atan2(fy, fx);
    let diff = targetTheta - robot.theta;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    robot.theta += diff * 0.12;

    robot.x += Math.cos(robot.theta) * 1.8;
    robot.y += Math.sin(robot.theta) * 1.8;
    trail.push({ x: robot.x, y: robot.y });
    if (trail.length > 250) trail.shift();

    if (Math.hypot(goal.x - robot.x, goal.y - robot.y) < 14) {
      running = false;
      statusEl.textContent = "🎯 Goal reached!";
    }
  }

  function draw() {
    ctx.fillStyle = "#060a14";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(94,234,212,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    obstacles.forEach((o) => {
      ctx.fillStyle = "rgba(248,113,113,0.75)";
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#fb923c";
    ctx.beginPath();
    ctx.moveTo(goal.x, goal.y - 12);
    ctx.lineTo(goal.x + 10, goal.y);
    ctx.lineTo(goal.x, goal.y + 12);
    ctx.lineTo(goal.x - 10, goal.y);
    ctx.closePath();
    ctx.fill();

    if (running) {
      const rays = castRays();
      ctx.strokeStyle = "rgba(167,139,250,0.35)";
      ctx.lineWidth = 1;
      rays.forEach((ray) => {
        ctx.beginPath();
        ctx.moveTo(robot.x, robot.y);
        ctx.lineTo(robot.x + Math.cos(ray.angle) * ray.dist, robot.y + Math.sin(ray.angle) * ray.dist);
        ctx.stroke();
      });
    }

    ctx.save();
    ctx.translate(robot.x, robot.y);
    ctx.rotate(robot.theta);
    ctx.fillStyle = "#5eead4";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#04231f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();
    ctx.restore();
  }

  function loop() {
    if (running) {
      step();
      draw();
    }
    requestAnimationFrame(loop);
  }

  document.getElementById("local-run").addEventListener("click", () => {
    running = true;
    statusEl.textContent = "Navigating around obstacles…";
  });
  document.getElementById("local-reset").addEventListener("click", () => {
    robot = { x: 50, y: H / 2, theta: 0 };
    trail = [];
    running = false;
    statusEl.textContent = "Click the canvas to add/remove obstacles, then Run.";
    draw();
  });

  draw();
  requestAnimationFrame(loop);
}

/* =========================================================
   LAB 5 — Object Detection: IoU Playground
   ========================================================= */
function initIouLab() {
  const canvas = document.getElementById("iou-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const gt = { x: 160, y: 90, w: 220, h: 170 };
  let pred = { x: 220, y: 130, w: 200, h: 150 };
  const defaultPred = { ...pred };

  const thresholdSlider = document.getElementById("iou-threshold");
  const thresholdVal = document.getElementById("iou-thresholdVal");
  const iouVal = document.getElementById("iou-value");
  const verdictEl = document.getElementById("iou-verdict");
  const HANDLE = 12;

  let dragMode = null; // "move" | "resize"
  let dragStart = null;

  function iou(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const interW = Math.max(0, x2 - x1), interH = Math.max(0, y2 - y1);
    const inter = interW * interH;
    const union = a.w * a.h + b.w * b.h - inter;
    return union > 0 ? inter / union : 0;
  }

  function draw() {
    ctx.fillStyle = "#060a14";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // ground truth
    ctx.strokeStyle = "#4ade80";
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 2.5;
    ctx.strokeRect(gt.x, gt.y, gt.w, gt.h);
    ctx.setLineDash([]);
    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("Ground Truth", gt.x, gt.y - 8);

    // intersection
    const x1 = Math.max(gt.x, pred.x), y1 = Math.max(gt.y, pred.y);
    const x2 = Math.min(gt.x + gt.w, pred.x + pred.w), y2 = Math.min(gt.y + gt.h, pred.y + pred.h);
    if (x2 > x1 && y2 > y1) {
      ctx.fillStyle = "rgba(94,234,212,0.22)";
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }

    // prediction
    const score = iou(gt, pred);
    const threshold = parseFloat(thresholdSlider.value);
    const match = score >= threshold;
    ctx.strokeStyle = match ? "#5eead4" : "#f87171";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(pred.x, pred.y, pred.w, pred.h);
    ctx.fillStyle = match ? "#5eead4" : "#f87171";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("Prediction", pred.x, pred.y + pred.h + 16);

    // resize handle
    ctx.fillStyle = "#fff";
    ctx.fillRect(pred.x + pred.w - HANDLE / 2, pred.y + pred.h - HANDLE / 2, HANDLE, HANDLE);

    iouVal.textContent = score.toFixed(2);
    verdictEl.textContent = match ? "✅ True Positive — boxes match" : "❌ False Positive — below threshold";
    verdictEl.style.color = match ? "#4ade80" : "#f87171";
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  canvas.addEventListener("pointerdown", (e) => {
    const p = pointerPos(e);
    const handleX = pred.x + pred.w, handleY = pred.y + pred.h;
    if (Math.hypot(p.x - handleX, p.y - handleY) < HANDLE * 1.5) {
      dragMode = "resize";
    } else if (p.x > pred.x && p.x < pred.x + pred.w && p.y > pred.y && p.y < pred.y + pred.h) {
      dragMode = "move";
      dragStart = { x: p.x - pred.x, y: p.y - pred.y };
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragMode) return;
    const p = pointerPos(e);
    if (dragMode === "move") {
      pred.x = Math.max(0, Math.min(W - pred.w, p.x - dragStart.x));
      pred.y = Math.max(0, Math.min(H - pred.h, p.y - dragStart.y));
    } else if (dragMode === "resize") {
      pred.w = Math.max(30, Math.min(W - pred.x, p.x - pred.x));
      pred.h = Math.max(30, Math.min(H - pred.y, p.y - pred.y));
    }
    draw();
  });
  window.addEventListener("pointerup", () => (dragMode = null));

  thresholdSlider.addEventListener("input", () => {
    thresholdVal.textContent = parseFloat(thresholdSlider.value).toFixed(2);
    draw();
  });

  document.getElementById("iou-reset").addEventListener("click", () => {
    pred = { ...defaultPred };
    draw();
  });

  thresholdVal.textContent = parseFloat(thresholdSlider.value).toFixed(2);
  draw();
}

/* =========================================================
   LAB 6 — ROS2 Data Flow / Nav Stack Pipeline
   ========================================================= */
function initRosPipelineLab() {
  const pipeline = document.getElementById("ros-pipeline");
  if (!pipeline) return;
  const nodes = Array.from(pipeline.querySelectorAll(".pipe-node"));
  const arrows = Array.from(pipeline.querySelectorAll(".pipe-arrow"));
  const logPanel = document.getElementById("ros-log");
  const stepBtn = document.getElementById("ros-step");
  const autoBtn = document.getElementById("ros-auto");

  const messages = [
    "Sensors publish <b>/scan</b> (LaserScan) and <b>/odom</b> (Odometry)",
    "Localization fuses sensor data on <b>/tf</b> to estimate robot pose",
    "Global planner searches the costmap and publishes <b>/plan</b> (Path)",
    "Local planner (DWA/TEB) scores trajectories against nearby obstacles",
    "Controller publishes <b>/cmd_vel</b> (Twist) toward the next waypoint",
    "Motor driver executes wheel velocities — robot moves, loop repeats",
  ];

  let idx = -1;
  let autoTimer = null;

  function render() {
    nodes.forEach((n, i) => n.classList.toggle("active", i === idx));
    arrows.forEach((a, i) => a.classList.toggle("active", i === idx - 1 || i === idx));
    if (idx >= 0) {
      const empty = logPanel.querySelector(".empty");
      if (empty) empty.remove();
      const line = document.createElement("div");
      line.innerHTML = `<span class="tag">[step ${idx + 1}]</span>${messages[idx]}`;
      logPanel.appendChild(line);
      logPanel.scrollTop = logPanel.scrollHeight;
    }
  }

  function advance() {
    idx = (idx + 1) % nodes.length;
    render();
  }

  stepBtn.addEventListener("click", advance);
  autoBtn.addEventListener("click", () => {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
      autoBtn.textContent = "▶ Auto-play";
      autoBtn.classList.remove("active");
    } else {
      autoTimer = setInterval(advance, 1400);
      autoBtn.textContent = "⏸ Stop";
      autoBtn.classList.add("active");
      advance();
    }
  });
}

/* =========================================================
   Quick Check quiz
   ========================================================= */
function initQuiz() {
  const container = document.getElementById("quiz-container");
  if (!container) return;

  const questions = [
    {
      q: "In a differential-drive robot, what happens when both wheels spin at the same speed in the same direction?",
      options: ["The robot rotates in place", "The robot drives in a straight line", "The robot stops", "The robot moves sideways"],
      correct: 1,
    },
    {
      q: "Which ROS2 concept lets nodes exchange continuous streams of data, like sensor readings?",
      options: ["Services", "Actions", "Topics", "Parameters"],
      correct: 2,
    },
    {
      q: "What is the main job of the global planner in the Nav2 stack?",
      options: [
        "Convert camera pixels into object labels",
        "Compute a path from start to goal across the known map/costmap",
        "React instantly to obstacles a few centimeters away",
        "Drive individual wheel motors",
      ],
      correct: 1,
    },
    {
      q: "A local planner such as DWA (Dynamic Window Approach) is mainly responsible for:",
      options: [
        "Building the initial full-map path",
        "Generating short-horizon, obstacle-aware velocity commands to follow the global path",
        "Training the object detection model",
        "Publishing the map to /map",
      ],
      correct: 1,
    },
    {
      q: "In PID control, which term reacts to how fast the error is changing, helping to reduce overshoot?",
      options: ["Proportional (P)", "Integral (I)", "Derivative (D)", "None of these"],
      correct: 2,
    },
    {
      q: "In object detection, Intersection over Union (IoU) is used to:",
      options: [
        "Measure how much a predicted box overlaps the ground-truth box",
        "Measure the robot's linear velocity",
        "Count the number of ROS2 nodes running",
        "Calculate battery voltage drop",
      ],
      correct: 0,
    },
  ];

  let score = 0;
  let answered = 0;
  const scoreBar = document.getElementById("quiz-score");

  function renderQuiz() {
    container.innerHTML = "";
    score = 0; answered = 0;
    questions.forEach((item, qi) => {
      const card = document.createElement("div");
      card.className = "quiz-card";
      const qEl = document.createElement("div");
      qEl.className = "quiz-q";
      qEl.textContent = `${qi + 1}. ${item.q}`;
      card.appendChild(qEl);

      const optsEl = document.createElement("div");
      optsEl.className = "quiz-opts";
      item.options.forEach((opt, oi) => {
        const optEl = document.createElement("div");
        optEl.className = "quiz-opt";
        optEl.innerHTML = `<span class="letter">${String.fromCharCode(65 + oi)}</span><span>${opt}</span>`;
        optEl.addEventListener("click", () => {
          if (card.dataset.locked) return;
          card.dataset.locked = "true";
          answered++;
          const isCorrect = oi === item.correct;
          if (isCorrect) score++;
          optEl.classList.add(isCorrect ? "correct" : "incorrect");
          if (!isCorrect) {
            optsEl.children[item.correct].classList.add("correct");
          }
          updateScore();
        });
        optsEl.appendChild(optEl);
      });
      card.appendChild(optsEl);
      container.appendChild(card);
    });
    updateScore();
  }

  function updateScore() {
    scoreBar.innerHTML = `<span>Progress: ${answered}/${questions.length} answered</span><b>Score: ${score}/${questions.length}</b>`;
  }

  document.getElementById("quiz-retry").addEventListener("click", renderQuiz);
  renderQuiz();
}
