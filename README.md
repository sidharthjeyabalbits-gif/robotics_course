# RoboMind Academy

A static, multi-page website for a hands-on Robotics & AI course covering
ROS2, differential-drive kinematics, object detection, and the full Nav2
navigation stack (global planner, local planner, controllers) — paired with
a DIY guide for building a real autonomous robot for under ₹50,000.

No build step or dependencies — pure HTML, CSS, and vanilla JavaScript.

## Pages

- `index.html` — landing page, course overview, capstone/budget snapshot
- `curriculum.html` — 12-module curriculum as an expandable accordion
- `labs.html` — six interactive, canvas-based simulators plus a quiz:
  1. Differential drive kinematics simulator
  2. PID controller tuning playground
  3. Global planner (A*) grid visualizer
  4. Local planner reactive obstacle-avoidance demo
  5. Object detection IoU (Intersection over Union) playground
  6. ROS2 sensor → planner → controller data-flow visualizer
- `diy-robot.html` — bill of materials, budget breakdown, assembly steps,
  and ROS2/Nav2 software setup for the capstone robot build
- `resources.html` — tooling links, a ROS2 CLI cheat sheet, and FAQ

## Structure

```
assets/
  css/style.css   shared design system (dark theme, cards, tables, labs UI)
  js/main.js      nav toggle, curriculum accordion, FAQ, BOM tier filter
  js/labs.js      all six interactive lab simulators + quiz logic
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

Then open `http://localhost:8080/index.html`.
