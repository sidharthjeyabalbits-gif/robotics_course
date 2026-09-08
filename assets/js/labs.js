// Dex Robotics — Interactive Labs
// Eight simulators teach core robotics concepts. Where a third dimension
// adds real understanding (kinematics, planning, mapping) we render with
// Three.js; where the concept is inherently 2D (a PID step-response chart,
// image-space bounding boxes) we keep a 2D canvas. Every widget guards on
// its DOM elements existing, so this file is safe on any page.

const COLORS = {
  bg: 0xf5f5f7,
  floor: 0xffffff,
  wall: 0x1d1d1f,
  accent: 0x0071e3,
  explored: 0xcfe7ff,
  fog: 0xc7c7cc,
  start: 0x34c759,
  goal: 0xff9f0a,
  danger: 0xff3b30,
  robotBody: 0x0071e3,
  ray: 0xaeaeb2,
};

document.addEventListener("DOMContentLoaded", () => {
  [
    initDiffDriveLab,
    initPidLab,
    initAStarLab,
    initLocalPlannerLab,
    initMappingLab,
    initNavigationLab,
    initIouLab,
    initRosPipelineLab,
    initQuiz,
  ].forEach((init) => {
    try {
      init();
    } catch (err) {
      console.error(`${init.name} failed to initialize:`, err);
    }
  });
});

/* =========================================================
   Shared Three.js helpers
   ========================================================= */
function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(COLORS.bg, 1);
  renderer.shadowMap.enabled = false;
  return renderer;
}

function attachOrbitControls(camera, target, domElement, opts = {}) {
  let radius = opts.radius ?? camera.position.distanceTo(target);
  let theta = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
  let phi = Math.acos(THREE.MathUtils.clamp((camera.position.y - target.y) / radius, -1, 1));
  const minPhi = opts.minPhi ?? 0.25;
  const maxPhi = opts.maxPhi ?? 1.3;
  const minRadius = opts.minRadius ?? radius * 0.55;
  const maxRadius = opts.maxRadius ?? radius * 1.9;
  let dragging = false, lastX = 0, lastY = 0;

  function update() {
    camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    camera.position.y = target.y + radius * Math.cos(phi);
    camera.lookAt(target);
  }

  domElement.addEventListener("pointerdown", (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    try { domElement.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  });
  domElement.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    theta -= dx * 0.008;
    phi = THREE.MathUtils.clamp(phi - dy * 0.008, minPhi, maxPhi);
    update();
  });
  window.addEventListener("pointerup", () => (dragging = false));
  domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    radius = THREE.MathUtils.clamp(radius + e.deltaY * 0.012, minRadius, maxRadius);
    update();
  }, { passive: false });

  update();
  return { update, isDragging: () => dragging };
}

function addTapHandler(domElement, onTap) {
  let downX = 0, downY = 0, downT = 0, moved = false, isDown = false;
  domElement.addEventListener("pointerdown", (e) => {
    downX = e.clientX; downY = e.clientY; downT = performance.now(); moved = false; isDown = true;
  });
  domElement.addEventListener("pointermove", (e) => {
    if (!isDown) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) moved = true;
  });
  domElement.addEventListener("pointerup", (e) => {
    if (isDown && !moved && performance.now() - downT < 600) onTap(e);
    isDown = false;
  });
}

function raycastGround(e, canvas, camera) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera({ x: nx, y: ny }, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, point)) return null;
  return point;
}

function createRobotMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.2, 0.46),
    new THREE.MeshStandardMaterial({ color: COLORS.robotBody, roughness: 0.35, metalness: 0.1 })
  );
  body.position.y = 0.16;
  group.add(body);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })
  );
  dome.position.set(-0.05, 0.26, 0);
  group.add(dome);

  const wheelGeom = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1d1d1f });
  [[0.2, -0.22], [0.2, 0.22], [-0.2, -0.22], [-0.2, 0.22]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeom, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.13, z);
    group.add(wheel);
  });

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.2, 12),
    new THREE.MeshStandardMaterial({ color: COLORS.goal })
  );
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(0.34, 0.16, 0);
  group.add(nose);

  return group;
}

function createMarker(color, shape) {
  const geom = shape === "cone"
    ? new THREE.ConeGeometry(0.16, 0.36, 16)
    : new THREE.OctahedronGeometry(0.16, 0);
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
  mesh.position.y = shape === "cone" ? 0.18 : 0.2;
  return mesh;
}

/* Grid scene factory shared by A*, Mapping & Navigation labs */
const CELL_STYLE = {
  free: { color: COLORS.floor, height: 0.05 },
  wall: { color: COLORS.wall, height: 0.55 },
  explored: { color: COLORS.explored, height: 0.05 },
  path: { color: COLORS.accent, height: 0.15 },
  fog: { color: 0x9a9aa0, height: 0.16, opacity: 0.85 },
};

function cellCenter(r, c, cols, rows, cellSize) {
  const gw = cols * cellSize, gh = rows * cellSize;
  return { x: c * cellSize - gw / 2 + cellSize / 2, z: r * cellSize - gh / 2 + cellSize / 2 };
}

function pointToCell(point, cols, rows, cellSize) {
  const gw = cols * cellSize, gh = rows * cellSize;
  const c = Math.floor((point.x + gw / 2) / cellSize);
  const r = Math.floor((point.z + gh / 2) / cellSize);
  if (c < 0 || c >= cols || r < 0 || r >= rows) return null;
  return { r, c };
}

function createGridScene(canvas, cols, rows, cellSize) {
  const width = canvas.width, height = canvas.height;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);

  const gw = cols * cellSize, gh = rows * cellSize;
  const camDist = Math.max(gw, gh) * 1.05;
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  const target = new THREE.Vector3(0, 0, 0);
  camera.position.set(0, camDist * 0.82, camDist * 0.68);
  camera.lookAt(target);

  const renderer = createRenderer(canvas);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8dc, 0.95));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
  dirLight.position.set(gw * 0.3, 10, gh * 0.4);
  scene.add(dirLight);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(gw + 0.3, 0.03, gh + 0.3),
    new THREE.MeshStandardMaterial({ color: 0xe4e4e9, roughness: 1 })
  );
  plate.position.y = -0.03;
  scene.add(plate);

  const floorGroup = new THREE.Group();
  scene.add(floorGroup);
  const tileGeom = new THREE.BoxGeometry(cellSize * 0.92, 0.05, cellSize * 0.92);
  const cellMeshes = [];
  for (let r = 0; r < rows; r++) {
    cellMeshes[r] = [];
    for (let c = 0; c < cols; c++) {
      const mesh = new THREE.Mesh(tileGeom, new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.9 }));
      const { x, z } = cellCenter(r, c, cols, rows, cellSize);
      mesh.position.set(x, 0, z);
      floorGroup.add(mesh);
      cellMeshes[r][c] = mesh;
    }
  }

  const orbit = attachOrbitControls(camera, target, canvas, {
    radius: camDist * 1.15,
    minRadius: camDist * 0.55,
    maxRadius: camDist * 2,
    minPhi: 0.25, maxPhi: 1.25,
  });

  function setCellState(r, c, state) {
    const mesh = cellMeshes[r][c];
    const style = CELL_STYLE[state];
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BoxGeometry(cellSize * 0.92, style.height, cellSize * 0.92);
    mesh.position.y = style.height / 2 - 0.025;
    mesh.material.color.set(style.color);
    mesh.material.transparent = !!style.opacity;
    mesh.material.opacity = style.opacity ?? 1;
  }

  function render() { renderer.render(scene, camera); }

  return { scene, camera, renderer, cellMeshes, gw, gh, orbit, target, setCellState, render, cellSize, cols, rows };
}

/* Pure A* solver: returns { order, path } of {r,c} cells */
function runAStarSync(grid, start, goal, cols, rows) {
  function neighbors(node) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const out = [];
    for (const [dr, dc] of dirs) {
      const r = node.r + dr, c = node.c + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols && !grid[r][c]) out.push({ r, c });
    }
    return out;
  }
  const heuristic = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  const key = (n) => n.r + "," + n.c;

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
  let path = [];
  if (cameFrom[goalKey] || (start.r === goal.r && start.c === goal.c)) {
    let cur = goal;
    while (cur && !(cur.r === start.r && cur.c === start.c)) {
      path.unshift(cur);
      cur = cameFrom[key(cur)];
    }
  }
  return { order, path };
}

/* =========================================================
   LAB 1 — Differential Drive Kinematics (3D)
   ========================================================= */
function initDiffDriveLab() {
  const canvas = document.getElementById("dd-canvas");
  if (!canvas || typeof THREE === "undefined") return;

  const WORLD_W = 6, WORLD_D = 3.8;
  const WHEEL_BASE = 0.32, WHEEL_R = 0.06, MAX_WHEEL_SPEED = 6;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
  const target = new THREE.Vector3(0, 0, 0);
  const renderer = createRenderer(canvas);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8dc, 1));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(3, 6, 2);
  scene.add(dirLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_D),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(new THREE.GridHelper(Math.max(WORLD_W, WORLD_D), 12, 0xd2d2d7, 0xe8e8ed));

  const robot = createRobotMesh();
  scene.add(robot);

  let trail = [];
  let trailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.5 }));
  scene.add(trailLine);

  camera.position.set(0, 4.6, 5.8);
  camera.lookAt(target);
  const orbit = attachOrbitControls(camera, target, canvas, { radius: 7.4, minRadius: 3.6, maxRadius: 11, minPhi: 0.3, maxPhi: 1.3 });

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

  let state = { x: 0, y: 0, theta: 0 };
  let running = false;
  let lastT = null;

  function setSliders(l, r) {
    leftSlider.value = l; rightSlider.value = r;
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

  function step(dt) {
    const wl = (parseFloat(leftSlider.value) / 100) * MAX_WHEEL_SPEED;
    const wr = (parseFloat(rightSlider.value) / 100) * MAX_WHEEL_SPEED;
    const vl = wl * WHEEL_R, vr = wr * WHEEL_R;
    const v = (vl + vr) / 2;
    const w = (vr - vl) / WHEEL_BASE;

    state.x += v * Math.cos(state.theta) * dt;
    state.y += v * Math.sin(state.theta) * dt;
    state.theta += w * dt;

    if (state.x < -WORLD_W / 2) state.x += WORLD_W;
    if (state.x > WORLD_W / 2) state.x -= WORLD_W;
    if (state.y < -WORLD_D / 2) state.y += WORLD_D;
    if (state.y > WORLD_D / 2) state.y -= WORLD_D;

    trail.push(new THREE.Vector3(state.x, 0.02, state.y));
    if (trail.length > 320) trail.shift();

    vReadout.textContent = v.toFixed(2) + " m/s";
    wReadout.textContent = w.toFixed(2) + " rad/s";
    poseReadout.textContent = `(${state.x.toFixed(2)}, ${state.y.toFixed(2)}, ${(state.theta * 180 / Math.PI).toFixed(0)}°)`;
  }

  function render() {
    robot.position.set(state.x, 0, state.y);
    robot.rotation.y = -state.theta;
    trailLine.geometry.dispose();
    trailLine.geometry = new THREE.BufferGeometry().setFromPoints(trail);
    renderer.render(scene, camera);
  }

  function frame(t) {
    if (!lastT) lastT = t;
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    if (running) step(dt);
    render();
    requestAnimationFrame(frame);
  }

  function toggleRun(forceOn) {
    running = forceOn !== undefined ? forceOn : !running;
    startBtn.textContent = running ? "⏸ Pause" : "▶ Start";
    statusEl.textContent = running ? "Simulating…" : "Paused";
  }

  startBtn.addEventListener("click", () => toggleRun());
  resetBtn.addEventListener("click", () => {
    state = { x: 0, y: 0, theta: 0 };
    trail = [];
    setSliders(0, 0);
    document.querySelectorAll("[data-dd-preset]").forEach((b) => b.classList.remove("active"));
    toggleRun(false);
  });

  render();
  requestAnimationFrame(frame);
}

/* =========================================================
   LAB 2 — PID Controller Playground (2D chart)
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
    const tau = 0.35;
    const dt = 0.02;
    const steps = 300;

    let v = 0, integral = 0, prevErr = 0;
    const data = [];
    for (let i = 0; i < steps; i++) {
      const err = setpoint - v;
      integral += err * dt;
      integral = Math.max(-3, Math.min(3, integral));
      const deriv = (err - prevErr) / dt;
      let u = Kp * err + Ki * integral + Kd * deriv;
      u = Math.max(-2.5, Math.min(2.5, u));
      v += ((u - v) / tau) * dt;
      prevErr = err;
      data.push(v);
    }
    return { data, setpoint };
  }

  function drawFrame(data, setpoint, upTo) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#e8e8ed";
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const yMax = 1.6;
    const toY = (val) => H - (val / yMax) * H;
    const toX = (i) => (i / data.length) * W;

    ctx.strokeStyle = "#ff9f0a";
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, toY(setpoint));
    ctx.lineTo(W, toY(setpoint));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#0071e3";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < upTo; i++) {
      const x = toX(i), y = toY(data[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (upTo > 0) {
      ctx.fillStyle = "#0071e3";
      ctx.beginPath();
      ctx.arc(toX(upTo - 1), toY(data[upTo - 1]), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let animId = null;
  function simulateAndDraw() {
    if (animId) cancelAnimationFrame(animId);
    const { data, setpoint } = simulate();
    let i = 0;
    function tick() {
      i += 4;
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
   LAB 3 — Global Planner: A* (3D)
   ========================================================= */
function initAStarLab() {
  const canvas = document.getElementById("astar-canvas");
  if (!canvas || typeof THREE === "undefined") return;
  const cols = 18, rows = 11, cellSize = 1;
  const gs = createGridScene(canvas, cols, rows, cellSize);

  let grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let start = { r: 2, c: 2 };
  let goal = { r: rows - 3, c: cols - 3 };
  let mode = "wall";
  let timer = null, pathTimer = null;

  const statusEl = document.getElementById("astar-status");
  const speedSlider = document.getElementById("astar-speed");

  const startMarker = createMarker(COLORS.start, "cone");
  const goalMarker = createMarker(COLORS.goal, "octa");
  gs.scene.add(startMarker, goalMarker);

  function positionMarkers() {
    const s = cellCenter(start.r, start.c, cols, rows, cellSize);
    const g = cellCenter(goal.r, goal.c, cols, rows, cellSize);
    startMarker.position.x = s.x; startMarker.position.z = s.z;
    goalMarker.position.x = g.x; goalMarker.position.z = g.z;
  }

  function paintAll() {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        gs.setCellState(r, c, grid[r][c] ? "wall" : "free");
    positionMarkers();
    gs.render();
  }

  document.querySelectorAll("[data-astar-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-astar-mode]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.astarMode;
    });
  });

  addTapHandler(canvas, (e) => {
    const point = raycastGround(e, canvas, gs.camera);
    if (!point) return;
    const cell = pointToCell(point, cols, rows, cellSize);
    if (!cell) return;
    const { r, c } = cell;
    if (mode === "wall") {
      if ((r === start.r && c === start.c) || (r === goal.r && c === goal.c)) return;
      grid[r][c] = grid[r][c] ? 0 : 1;
      gs.setCellState(r, c, grid[r][c] ? "wall" : "free");
    } else if (mode === "start") {
      if (!grid[r][c]) { start = { r, c }; positionMarkers(); }
    } else if (mode === "goal") {
      if (!grid[r][c]) { goal = { r, c }; positionMarkers(); }
    }
    gs.render();
  });

  function runAStarAnimated() {
    if (timer) clearInterval(timer);
    if (pathTimer) clearInterval(pathTimer);
    paintAll();
    const { order, path } = runAStarSync(grid, start, goal, cols, rows);
    const speed = 301 - parseInt(speedSlider.value, 10);
    let i = 0;
    statusEl.textContent = "Expanding nodes…";
    timer = setInterval(() => {
      if (i < order.length) {
        const n = order[i];
        if (!(n.r === start.r && n.c === start.c) && !(n.r === goal.r && n.c === goal.c)) {
          gs.setCellState(n.r, n.c, "explored");
        }
        gs.render();
        i++;
      } else {
        clearInterval(timer);
        if (path.length) {
          statusEl.textContent = `Path found — ${path.length} steps.`;
          let j = 0;
          pathTimer = setInterval(() => {
            if (j < path.length) {
              const n = path[j];
              if (!(n.r === goal.r && n.c === goal.c)) gs.setCellState(n.r, n.c, "path");
              gs.render();
              j++;
            } else clearInterval(pathTimer);
          }, 22);
        } else {
          statusEl.textContent = "No path found — goal is walled off.";
        }
      }
    }, Math.max(4, speed / 6));
  }

  document.getElementById("astar-run").addEventListener("click", runAStarAnimated);
  document.getElementById("astar-clear").addEventListener("click", () => {
    if (timer) clearInterval(timer);
    if (pathTimer) clearInterval(pathTimer);
    grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
    statusEl.textContent = "Grid cleared. Drag to orbit, tap a cell to edit.";
    paintAll();
  });

  paintAll();
  gs.render();

  function idleLoop() { gs.render(); requestAnimationFrame(idleLoop); }
  requestAnimationFrame(idleLoop);
}

/* =========================================================
   LAB 4 — Local Planner: Reactive Obstacle Avoidance (3D)
   ========================================================= */
function initLocalPlannerLab() {
  const canvas = document.getElementById("local-canvas");
  if (!canvas || typeof THREE === "undefined") return;

  const WORLD_W = 7.4, WORLD_D = 4.4;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
  const target = new THREE.Vector3(0, 0, 0);
  const renderer = createRenderer(canvas);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8dc, 1));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(3, 6, 2);
  scene.add(dirLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_D),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(new THREE.GridHelper(Math.max(WORLD_W, WORLD_D), 14, 0xd2d2d7, 0xe8e8ed));

  camera.position.set(0, 5.4, 6.8);
  camera.lookAt(target);
  const orbit = attachOrbitControls(camera, target, canvas, { radius: 8.6, minRadius: 4, maxRadius: 13, minPhi: 0.3, maxPhi: 1.3 });

  let robot = { x: -WORLD_W / 2 + 0.6, y: 0, theta: 0 };
  let goal = { x: WORLD_W / 2 - 0.6, y: 0 };
  let obstacles = [
    { x: -0.6, y: 0.9, r: 0.32 },
    { x: 0.6, y: -0.9, r: 0.38 },
    { x: 1.7, y: 0.6, r: 0.26 },
  ];
  let mode = "obstacle";
  let running = false;
  let trail = [];

  const robotMesh = createRobotMesh();
  scene.add(robotMesh);
  const goalMesh = createMarker(COLORS.goal, "octa");
  scene.add(goalMesh);
  const trailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.5 }));
  scene.add(trailLine);

  const obstacleGroup = new THREE.Group();
  scene.add(obstacleGroup);
  function rebuildObstacleMeshes() {
    obstacleGroup.clear();
    obstacles.forEach((o) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(o.r, o.r, 0.42, 20),
        new THREE.MeshStandardMaterial({ color: COLORS.danger, roughness: 0.5 })
      );
      mesh.position.set(o.x, 0.21, o.y);
      obstacleGroup.add(mesh);
    });
  }
  rebuildObstacleMeshes();

  const RAY_COUNT = 10, RAY_LEN = 1.3;
  const rayGeom = new THREE.BufferGeometry();
  rayGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAY_COUNT * 2 * 3), 3));
  const rayLines = new THREE.LineSegments(rayGeom, new THREE.LineBasicMaterial({ color: COLORS.ray, transparent: true, opacity: 0.6 }));
  scene.add(rayLines);

  const statusEl = document.getElementById("local-status");

  document.querySelectorAll("[data-local-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-local-mode]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.localMode;
    });
  });

  addTapHandler(canvas, (e) => {
    const point = raycastGround(e, canvas, camera);
    if (!point) return;
    const x = THREE.MathUtils.clamp(point.x, -WORLD_W / 2 + 0.2, WORLD_W / 2 - 0.2);
    const y = THREE.MathUtils.clamp(point.z, -WORLD_D / 2 + 0.2, WORLD_D / 2 - 0.2);
    if (mode === "goal") {
      goal = { x, y };
      goalMesh.position.set(x, 0.2, y);
    } else {
      const hitIdx = obstacles.findIndex((o) => Math.hypot(o.x - x, o.y - y) < o.r + 0.1);
      if (hitIdx >= 0) obstacles.splice(hitIdx, 1);
      else if (obstacles.length < 8) obstacles.push({ x, y, r: 0.26 + Math.random() * 0.16 });
      rebuildObstacleMeshes();
    }
    render();
  });

  function castRays() {
    const positions = rayGeom.attributes.position.array;
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
      const idx = i * 6;
      positions[idx] = robot.x; positions[idx + 1] = 0.1; positions[idx + 2] = robot.y;
      positions[idx + 3] = robot.x + Math.cos(angle) * dist;
      positions[idx + 4] = 0.1;
      positions[idx + 5] = robot.y + Math.sin(angle) * dist;
    }
    rayGeom.attributes.position.needsUpdate = true;
  }

  function step() {
    const toGoal = Math.atan2(goal.y - robot.y, goal.x - robot.x);
    let fx = Math.cos(toGoal), fy = Math.sin(toGoal);

    obstacles.forEach((o) => {
      const dx = robot.x - o.x, dy = robot.y - o.y;
      const dist = Math.hypot(dx, dy);
      const influence = o.r + 0.75;
      if (dist < influence && dist > 0.001) {
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

    robot.x += Math.cos(robot.theta) * 0.028;
    robot.y += Math.sin(robot.theta) * 0.028;
    trail.push(new THREE.Vector3(robot.x, 0.02, robot.y));
    if (trail.length > 260) trail.shift();

    if (Math.hypot(goal.x - robot.x, goal.y - robot.y) < 0.18) {
      running = false;
      statusEl.textContent = "🎯 Goal reached!";
    }
  }

  function render() {
    robotMesh.position.set(robot.x, 0, robot.y);
    robotMesh.rotation.y = -robot.theta;
    trailLine.geometry.dispose();
    trailLine.geometry = new THREE.BufferGeometry().setFromPoints(trail);
    if (running) castRays();
    rayLines.visible = running;
    renderer.render(scene, camera);
  }

  function loop() {
    if (running) step();
    render();
    requestAnimationFrame(loop);
  }

  document.getElementById("local-run").addEventListener("click", () => {
    running = true;
    statusEl.textContent = "Navigating around obstacles…";
  });
  document.getElementById("local-reset").addEventListener("click", () => {
    robot = { x: -WORLD_W / 2 + 0.6, y: 0, theta: 0 };
    trail = [];
    running = false;
    statusEl.textContent = "Tap the floor to add/remove obstacles, then Run.";
    render();
  });

  render();
  requestAnimationFrame(loop);
}

/* =========================================================
   LAB 5 — Mapping: SLAM-style Occupancy Grid (3D, NEW)
   ========================================================= */
function initMappingLab() {
  const canvas = document.getElementById("mapping-canvas");
  if (!canvas || typeof THREE === "undefined") return;
  const cols = 16, rows = 10, cellSize = 1;
  const gs = createGridScene(canvas, cols, rows, cellSize);

  const robotStart = { r: rows - 2, c: 1 };
  let groundTruth, revealed, robotCell, robotPos, exploring, moveAnim;
  const statusEl = document.getElementById("mapping-status");
  const progressEl = document.getElementById("mapping-progress");
  const runBtn = document.getElementById("mapping-run");

  const robotMesh = createRobotMesh();
  gs.scene.add(robotMesh);
  let exploreTimer = null;

  function generateMaze() {
    const gt = Array.from({ length: rows }, () => new Array(cols).fill(0));
    const wallCount = Math.floor(cols * rows * 0.22);
    for (let i = 0; i < wallCount; i++) {
      const r = 1 + Math.floor(Math.random() * (rows - 2));
      const c = 1 + Math.floor(Math.random() * (cols - 2));
      gt[r][c] = 1;
    }
    gt[robotStart.r][robotStart.c] = 0;
    return gt;
  }

  function hasLineOfSight(r0, c0, r1, c1) {
    const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0)) * 3 || 1;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const rr = Math.round(r0 + (r1 - r0) * t);
      const cc = Math.round(c0 + (c1 - c0) * t);
      if (groundTruth[rr][cc] === 1 && !(rr === r1 && cc === c1)) return false;
    }
    return true;
  }

  function reveal(r0, c0, R) {
    const rMin = Math.max(0, Math.floor(r0 - R)), rMax = Math.min(rows - 1, Math.ceil(r0 + R));
    const cMin = Math.max(0, Math.floor(c0 - R)), cMax = Math.min(cols - 1, Math.ceil(c0 + R));
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        if (revealed[r][c]) continue;
        if (Math.hypot(r - r0, c - c0) > R) continue;
        if (hasLineOfSight(r0, c0, r, c)) {
          revealed[r][c] = true;
          gs.setCellState(r, c, groundTruth[r][c] ? "wall" : "free");
        }
      }
    }
  }

  function explored() {
    let n = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (revealed[r][c]) n++;
    return n / (cols * rows);
  }

  function reset() {
    if (exploreTimer) clearInterval(exploreTimer);
    exploring = false;
    runBtn.textContent = "▶ Start exploring";
    groundTruth = generateMaze();
    revealed = Array.from({ length: rows }, () => new Array(cols).fill(false));
    robotCell = { r: robotStart.r, c: robotStart.c };
    const p = cellCenter(robotCell.r, robotCell.c, cols, rows, cellSize);
    robotPos = { x: p.x, z: p.z, theta: 0 };
    moveAnim = null;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) gs.setCellState(r, c, "fog");
    reveal(robotCell.r, robotCell.c, 2.4);
    robotMesh.position.set(robotPos.x, 0, robotPos.z);
    statusEl.textContent = "Tap fogged cells to sketch hidden walls, then start exploring.";
    progressEl.textContent = Math.round(explored() * 100) + "%";
    gs.render();
  }

  addTapHandler(canvas, (e) => {
    if (exploring) return;
    const point = raycastGround(e, canvas, gs.camera);
    if (!point) return;
    const cell = pointToCell(point, cols, rows, cellSize);
    if (!cell) return;
    const { r, c } = cell;
    if (r === robotCell.r && c === robotCell.c) return;
    groundTruth[r][c] = groundTruth[r][c] ? 0 : 1;
    if (revealed[r][c]) gs.setCellState(r, c, groundTruth[r][c] ? "wall" : "free");
    gs.render();
  });

  function pickNextCell() {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const options = [];
    dirs.forEach(([dr, dc]) => {
      const r = robotCell.r + dr, c = robotCell.c + dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) return;
      if (groundTruth[r][c]) return;
      const weight = revealed[r][c] ? 1 : 6;
      for (let i = 0; i < weight; i++) options.push({ r, c });
    });
    if (!options.length) return null;
    return options[Math.floor(Math.random() * options.length)];
  }

  function exploreTick() {
    if (moveAnim) return; // still animating previous move
    if (explored() > 0.94) {
      statusEl.textContent = "🗺️ Map complete!";
      stopExploring();
      return;
    }
    const next = pickNextCell();
    if (!next) { statusEl.textContent = "Stuck — no free neighbor to explore."; return; }
    const from = cellCenter(robotCell.r, robotCell.c, cols, rows, cellSize);
    const to = cellCenter(next.r, next.c, cols, rows, cellSize);
    const theta = Math.atan2(to.z - from.z, to.x - from.x);
    moveAnim = { from, to, theta, t: 0 };
    robotCell = next;
  }

  function stopExploring() {
    exploring = false;
    runBtn.textContent = "▶ Start exploring";
    if (exploreTimer) clearInterval(exploreTimer);
  }

  runBtn.addEventListener("click", () => {
    exploring = !exploring;
    if (exploring) {
      runBtn.textContent = "⏸ Stop";
      statusEl.textContent = "Exploring — casting simulated LiDAR as it moves…";
      exploreTimer = setInterval(exploreTick, 260);
    } else {
      stopExploring();
      statusEl.textContent = "Paused. Edit walls or resume exploring.";
    }
  });

  document.getElementById("mapping-reset").addEventListener("click", reset);

  function animFrame() {
    if (moveAnim) {
      moveAnim.t += 0.06;
      const t = Math.min(1, moveAnim.t);
      robotPos.x = moveAnim.from.x + (moveAnim.to.x - moveAnim.from.x) * t;
      robotPos.z = moveAnim.from.z + (moveAnim.to.z - moveAnim.from.z) * t;
      robotPos.theta = moveAnim.theta;
      if (t >= 1) {
        reveal(robotCell.r, robotCell.c, 2.4);
        progressEl.textContent = Math.round(explored() * 100) + "%";
        moveAnim = null;
      }
    }
    robotMesh.position.set(robotPos.x, 0, robotPos.z);
    robotMesh.rotation.y = -robotPos.theta;
    gs.render();
    requestAnimationFrame(animFrame);
  }

  reset();
  requestAnimationFrame(animFrame);
}

/* =========================================================
   LAB 6 — Navigation: Global + Local Planner Combined (3D, NEW)
   ========================================================= */
function initNavigationLab() {
  const canvas = document.getElementById("nav-canvas");
  if (!canvas || typeof THREE === "undefined") return;
  const cols = 16, rows = 10, cellSize = 1;
  const gs = createGridScene(canvas, cols, rows, cellSize);

  let grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const wallCount = Math.floor(cols * rows * 0.14);
  for (let i = 0; i < wallCount; i++) {
    const r = 1 + Math.floor(Math.random() * (rows - 2));
    const c = 2 + Math.floor(Math.random() * (cols - 4));
    grid[r][c] = 1;
  }
  const start = { r: rows - 2, c: 1 };
  let goal = { r: 1, c: cols - 2 };
  grid[start.r][start.c] = 0;
  grid[goal.r][goal.c] = 0;

  let mode = "goal";
  let path = [];
  let pathCells = [];
  let following = false;
  let pathIdx = 0;
  let blockedSince = null;
  let lastReplanAttempt = 0;
  const statusEl = document.getElementById("nav-status");

  const startMarker = createMarker(COLORS.start, "cone");
  const goalMarker = createMarker(COLORS.goal, "octa");
  gs.scene.add(startMarker, goalMarker);
  const robotMesh = createRobotMesh();
  gs.scene.add(robotMesh);

  const obstacleMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 20),
    new THREE.MeshStandardMaterial({ color: COLORS.danger, roughness: 0.4 })
  );
  gs.scene.add(obstacleMesh);
  let obPos = cellCenter(Math.floor(rows / 2), Math.floor(cols / 2), cols, rows, cellSize);
  let obVel = { x: 0.012, z: 0.009 };

  let robotPos = cellCenter(start.r, start.c, cols, rows, cellSize);
  let robotTheta = 0;

  function paintBase() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) gs.setCellState(r, c, grid[r][c] ? "wall" : "free");
  }
  function paintPath() {
    pathCells.forEach((n) => {
      if (!grid[n.r][n.c]) gs.setCellState(n.r, n.c, "path");
    });
  }
  function positionMarkers() {
    const s = cellCenter(start.r, start.c, cols, rows, cellSize);
    const g = cellCenter(goal.r, goal.c, cols, rows, cellSize);
    startMarker.position.set(s.x, startMarker.position.y, s.z);
    goalMarker.position.set(g.x, goalMarker.position.y, g.z);
  }

  document.querySelectorAll("[data-nav-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-nav-mode]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.navMode;
    });
  });

  addTapHandler(canvas, (e) => {
    if (following) return;
    const point = raycastGround(e, canvas, gs.camera);
    if (!point) return;
    const cell = pointToCell(point, cols, rows, cellSize);
    if (!cell) return;
    const { r, c } = cell;
    if ((r === start.r && c === start.c)) return;
    if (mode === "wall") {
      grid[r][c] = grid[r][c] ? 0 : 1;
      paintBase(); paintPath(); positionMarkers();
    } else if (mode === "goal") {
      if (!grid[r][c]) { goal = { r, c }; positionMarkers(); }
    }
    gs.render();
  });

  function currentRobotCell() {
    return pointToCell(new THREE.Vector3(robotPos.x, 0, robotPos.z), cols, rows, cellSize) || { ...start };
  }

  function beginNavigate() {
    paintBase();
    const from = currentRobotCell();
    const result = runAStarSync(grid, from, goal, cols, rows);
    if (!result.path.length) {
      statusEl.textContent = "🚫 No path found — remove a few walls and try again.";
      return;
    }
    pathCells = result.path;
    path = pathCells.map((n) => cellCenter(n.r, n.c, cols, rows, cellSize));
    pathIdx = 0;
    following = true;
    blockedSince = null;
    paintPath();
    positionMarkers();
    statusEl.textContent = "🧭 Global path planned — following with live obstacle avoidance…";
  }

  function replan() {
    const obCell = pointToCell(new THREE.Vector3(obPos.x, 0, obPos.z), cols, rows, cellSize);
    const tempGrid = grid.map((row) => row.slice());
    if (obCell) tempGrid[obCell.r][obCell.c] = 1;
    const from = currentRobotCell();
    const result = runAStarSync(tempGrid, from, goal, cols, rows);
    paintBase();
    if (result.path.length) {
      pathCells = result.path;
      path = pathCells.map((n) => cellCenter(n.r, n.c, cols, rows, cellSize));
      pathIdx = 0;
      paintPath();
      statusEl.textContent = "🔄 Re-routed around the dynamic obstacle.";
    } else {
      statusEl.textContent = "⏳ Blocked — waiting for a path to clear…";
    }
    positionMarkers();
    blockedSince = null;
  }

  document.getElementById("nav-run").addEventListener("click", beginNavigate);
  document.getElementById("nav-reset").addEventListener("click", () => {
    following = false;
    grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (let i = 0; i < wallCount; i++) {
      const r = 1 + Math.floor(Math.random() * (rows - 2));
      const c = 2 + Math.floor(Math.random() * (cols - 4));
      grid[r][c] = 1;
    }
    grid[start.r][start.c] = 0;
    grid[goal.r][goal.c] = 0;
    robotPos = cellCenter(start.r, start.c, cols, rows, cellSize);
    robotTheta = 0;
    pathCells = []; path = []; pathIdx = 0;
    obPos = cellCenter(Math.floor(rows / 2), Math.floor(cols / 2), cols, rows, cellSize);
    statusEl.textContent = "Draw walls or drag-orbit to inspect, set a goal, then Navigate.";
    paintBase(); positionMarkers();
    gs.render();
  });

  const DANGER_RADIUS = 0.85;

  function moveObstacle() {
    let nx = obPos.x + obVel.x, nz = obPos.z + obVel.z;
    const cell = pointToCell(new THREE.Vector3(nx, 0, nz), cols, rows, cellSize);
    if (!cell || grid[cell.r][cell.c]) {
      obVel.x *= -1; obVel.z *= -1;
      nx = obPos.x + obVel.x; nz = obPos.z + obVel.z;
    }
    if (nx < -gs.gw / 2 + 0.3 || nx > gs.gw / 2 - 0.3) obVel.x *= -1;
    if (nz < -gs.gh / 2 + 0.3 || nz > gs.gh / 2 - 0.3) obVel.z *= -1;
    obPos.x += obVel.x; obPos.z += obVel.z;
    obstacleMesh.position.set(obPos.x, 0.28, obPos.z);
  }

  function followPath() {
    if (!following || !path.length) return;
    const targetPos = path[pathIdx];
    const dx = targetPos.x - robotPos.x, dz = targetPos.z - robotPos.z;
    const dist = Math.hypot(dx, dz);

    const obDist = Math.hypot(obPos.x - robotPos.x, obPos.z - robotPos.z);
    const blocked = obDist < DANGER_RADIUS;

    if (blocked) {
      if (blockedSince === null) blockedSince = performance.now();
      statusEl.textContent = "⚠️ Dynamic obstacle ahead — local planner yielding…";
      if (performance.now() - blockedSince > 1200 && performance.now() - lastReplanAttempt > 1200) {
        lastReplanAttempt = performance.now();
        replan();
      }
      return;
    }
    blockedSince = null;

    if (dist < 0.08) {
      pathIdx++;
      if (pathIdx >= path.length) {
        following = false;
        statusEl.textContent = "🎯 Destination reached!";
        return;
      }
      return;
    }
    const heading = Math.atan2(dz, dx);
    let diff = heading - robotTheta;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    robotTheta += diff * 0.15;
    const speed = 0.03;
    robotPos.x += (dx / dist) * speed;
    robotPos.z += (dz / dist) * speed;
  }

  function frame() {
    moveObstacle();
    followPath();
    robotMesh.position.set(robotPos.x, 0, robotPos.z);
    robotMesh.rotation.y = -robotTheta;
    gs.render();
    requestAnimationFrame(frame);
  }

  paintBase();
  positionMarkers();
  robotMesh.position.set(robotPos.x, 0, robotPos.z);
  statusEl.textContent = "Draw walls or drag-orbit to inspect, set a goal, then Navigate.";
  gs.render();
  requestAnimationFrame(frame);
}

/* =========================================================
   LAB 7 — Object Detection: IoU Playground (2D)
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

  let dragMode = null;
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#eaeaef";
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    ctx.strokeStyle = "#34c759";
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 2.5;
    ctx.strokeRect(gt.x, gt.y, gt.w, gt.h);
    ctx.setLineDash([]);
    ctx.fillStyle = "#248a3d";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("Ground Truth", gt.x, gt.y - 8);

    const x1 = Math.max(gt.x, pred.x), y1 = Math.max(gt.y, pred.y);
    const x2 = Math.min(gt.x + gt.w, pred.x + pred.w), y2 = Math.min(gt.y + gt.h, pred.y + pred.h);
    if (x2 > x1 && y2 > y1) {
      ctx.fillStyle = "rgba(0,113,227,0.14)";
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }

    const score = iou(gt, pred);
    const threshold = parseFloat(thresholdSlider.value);
    const match = score >= threshold;
    ctx.strokeStyle = match ? "#0071e3" : "#ff3b30";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(pred.x, pred.y, pred.w, pred.h);
    ctx.fillStyle = match ? "#0071e3" : "#ff3b30";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("Prediction", pred.x, pred.y + pred.h + 16);

    ctx.fillStyle = "#1d1d1f";
    ctx.fillRect(pred.x + pred.w - HANDLE / 2, pred.y + pred.h - HANDLE / 2, HANDLE, HANDLE);

    iouVal.textContent = score.toFixed(2);
    verdictEl.textContent = match ? "✅ True Positive — boxes match" : "❌ False Positive — below threshold";
    verdictEl.style.color = match ? "#248a3d" : "#ff3b30";
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
   LAB 8 — ROS2 Data Flow / Nav Stack Pipeline (DOM)
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
    {
      q: "What does an occupancy grid map store for each cell?",
      options: [
        "The exact RGB pixel color at that location",
        "Whether the cell is free, occupied, or still unknown",
        "The robot's battery percentage",
        "A Wi-Fi signal strength reading",
      ],
      correct: 1,
    },
    {
      q: "In the Navigation lab, what triggers the robot to replan its global path?",
      options: [
        "The user pressing pause",
        "The robot reaching the goal",
        "A dynamic obstacle blocking the planned path for too long",
        "The battery running low",
      ],
      correct: 2,
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
