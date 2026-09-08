# Dex Robotics

A static, multi-page website for a hands-on Robotics & AI course covering
ROS2, differential-drive kinematics, object detection, and the full Nav2
navigation stack (global planner, local planner, controllers) — paired with
a DIY guide for building a real autonomous robot for under ₹50,000.

No build step or dependencies beyond a single CDN script (Three.js, for the
3D labs) — everything else is plain HTML, CSS, and vanilla JavaScript.

## Pages

- `index.html` — landing page, course overview, capstone/budget snapshot
- `curriculum.html` — 12-module curriculum as an expandable accordion
- `labs.html` — eight interactive simulators plus an 8-question quiz. Most
  are rendered in real, orbit-able 3D with Three.js:
  1. Differential drive kinematics simulator (3D)
  2. PID controller tuning playground (2D chart — inherently 2D)
  3. Global planner (A*) grid visualizer (3D)
  4. Local planner reactive obstacle-avoidance demo (3D)
  5. Mapping: SLAM-style occupancy grid / fog-of-war explorer (3D)
  6. Full navigation: global + local planner combined, with dynamic-obstacle
     replanning (3D)
  7. Object detection IoU (Intersection over Union) playground (2D — image
     bounding boxes are inherently 2D)
  8. ROS2 sensor → planner → controller data-flow visualizer (DOM)
- `diy-robot.html` — bill of materials, budget breakdown, assembly steps,
  and ROS2/Nav2 software setup for the capstone robot build
- `resources.html` — tooling links, a ROS2 CLI cheat sheet, and FAQ

## Design

Palette modeled on apple.com: white / `#f5f5f7` surfaces, near-black text,
a single blue (`#0071e3`) accent, soft shadows over heavy borders. Dark mode
follows automatically via `prefers-color-scheme`.

## Structure

```
assets/
  css/style.css   shared design system (light/dark tokens, cards, tables, labs UI)
  js/main.js      nav toggle, curriculum accordion, FAQ, BOM tier filter
  js/labs.js      all eight interactive lab simulators + quiz logic
index.html
curriculum.html
labs.html
diy-robot.html
resources.html
```

## Running locally

Any static file server works, e.g.:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html`. The 3D labs load Three.js
r128 from cdnjs at runtime, so an internet connection is needed for those
specifically.
