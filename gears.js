// Recursive planetary gears. Each level is a ring holding a centre sun and
// three copies of the level below, carried round the sun on a turning
// carrier, so the motion speeds up level by level going in. The largest
// ring's centre sun is the pivot and that ring is sized to cover the screen.
// The SVG is built once (and again on resize); all motion
// comes from CSS animations (see .gear-spin in style.css), so no JavaScript
// runs per frame.
//
// Every tooth set uses the same tooth size (pitch radius = teeth * MODULE), so
// any two gears can mesh. Speeds are chosen so touching gears move at the same
// rate where they meet, and each gear gets a starting angle that drops its
// teeth into its neighbours' gaps.

const SVG_NS = "http://www.w3.org/2000/svg";
const MODULE = 1.5; // pitch radius per tooth
const TOOTH_HEIGHT = 3; // tooth tip / root distance from the pitch circle
const AXLE_RADIUS = 10;
const RIM_TEETH = 11; // a ring's outer teeth = inner teeth + RIM_TEETH
const MAX_LEVEL = 6;
const DRIFT_MS_PER_DEGREE = 200; // whole assembly turns once every 72s
const PIVOT = [2 / 3, 1 / 2]; // centre sun: 1/3 of the width from the right
const SPEED_GAIN = 2; // each level in turns this much faster than the one around it

const radius = (n) => n * MODULE;
const teeth = (n, inward) => ({ n, r: radius(n), inward });

// Tooth counts per level. Level 0 is a plain 32-tooth gear; level k is a ring
// around a sun and three level k-1 parts. sun + part teeth must be divisible
// by 3 so three parts spaced 120° apart all mesh with both sun and ring.
function buildLevels(max) {
  const levels = [{ part: 32 }];
  for (let k = 1; k <= max; k++) {
    const part = levels[k - 1].part;
    let sun = k === 1 ? 16 : k === 2 ? 32 : Math.round(0.35 * part);
    while ((sun + part) % 3) sun++;
    const ringIn = sun + 2 * part;
    levels.push({ sun, ringIn, part: ringIn + RIM_TEETH, dist: radius(sun + part) });
  }
  return levels;
}
const LEVELS = buildLevels(MAX_LEVEL);
const SLOT_ANGLES = [0, 1, 2].map((i) => -Math.PI / 2 + (i * 2 * Math.PI) / 3);
const slot = (k, i) => [LEVELS[k].dist * Math.cos(SLOT_ANGLES[i]), LEVELS[k].dist * Math.sin(SLOT_ANGLES[i])];

// The largest ring's centre sun is pinned at PIVOT (a fraction of the view's
// width and height), and the whole picture is scaled so that ring's rim
// reaches the farthest screen corner. Pick the
// number of levels whose resulting tooth size is closest to the original
// page's (where the two-level assembly filled ~92% of the shorter side).
function chooseLayout(width, height) {
  const target = (0.92 * Math.min(width, height)) / 2 / (radius(LEVELS[2].part) + TOOTH_HEIGHT);
  const reach = pivotReach(width, height);
  let best = null;
  for (let top = 2; top <= MAX_LEVEL; top++) {
    const rim = radius(LEVELS[top].ringIn + LEVELS[top].part) / 2;
    const scale = reach / rim;
    const off = Math.abs(Math.log(scale / target));
    if (!best || off < best.off) best = { top, scale, off };
  }
  return best;
}

// Distance from the pivot to the farthest corner of a width x height view
const pivotReach = (width, height) =>
  Math.hypot(Math.max(PIVOT[0], 1 - PIVOT[0]) * width, Math.max(PIVOT[1], 1 - PIVOT[1]) * height);

// Build the gear model as a tree of assemblies. Each assembly's parts ride on
// a carrier that turns about the assembly's centre, so a gear's distance from
// the pivot is only known as a range [lo, hi]. Parts that can never reach the
// view circle are left out.
function buildModel(top, viewR) {
  const gear = (kind, level, centre, sets, lo, hi) => {
    const outer = Math.max(...Object.values(sets).map((s) => s.r)) + TOOTH_HEIGHT;
    const inner = sets.in ? sets.in.r - TOOTH_HEIGHT : 0;
    // Some tooth is inside the view: not wholly outside it, nor around it
    const show = lo - outer < viewR && hi + viewR > inner;
    return { kind, level, centre, sets, show, phase: 0, speed: 0 };
  };

  function assembly(k, c, lo, hi) {
    if (k === 0) return { k, centre: c, outer: gear("planet", 0, c, { out: teeth(LEVELS[0].part, false) }, lo, hi) };
    const L = LEVELS[k];
    const node = {
      k,
      centre: c,
      outer: gear("ring", k, c, { in: teeth(L.ringIn, true), out: teeth(L.part, false) }, lo, hi),
      sun: gear("sun", k, c, { out: teeth(L.sun, false) }, lo, hi),
      parts: [],
    };
    // A part orbits the centre, which itself sits somewhere in [lo, hi]
    const plo = Math.max(0, lo - L.dist, L.dist - hi);
    const phi = hi + L.dist;
    if (plo - radius(LEVELS[k - 1].part) - TOOTH_HEIGHT >= viewR) return node;
    for (let i = 0; i < 3; i++) {
      const [sx, sy] = slot(k, i);
      node.parts.push(assembly(k - 1, [c[0] + sx, c[1] + sy], plo, phi));
    }
    return node;
  }

  return assembly(top, [0, 0], 0, 0);
}

// Path for one set of teeth around a circle. Teeth point outward, or inward
// for the inside of a ring.
function teethPath({ n, r, inward }) {
  const root = inward ? r + TOOTH_HEIGHT : r - TOOTH_HEIGHT;
  const tip = inward ? r - TOOTH_HEIGHT : r + TOOTH_HEIGHT;
  const da = Math.PI / n;
  const pt = (rr, a) => `${(rr * Math.cos(a)).toFixed(2)},${(rr * Math.sin(a)).toFixed(2)}`;
  let a = -Math.PI / 2;
  const p = [`M${pt(root, a)}`];
  for (let i = 0; i < n; i++) {
    p.push(
      `A${root},${root} 0 0,1 ${pt(root, (a += da))}`,
      `L${pt(r, a)}`,
      `L${pt(tip, (a += da / 3))}`,
      `A${tip},${tip} 0 0,1 ${pt(tip, (a += da / 3))}`,
      `L${pt(r, (a += da / 3))}`,
      `L${pt(root, a)}`
    );
  }
  return p.join("") + "Z";
}

function gearPath(gear) {
  const parts = Object.values(gear.sets).map(teethPath);
  if (!gear.sets.in) {
    const h = AXLE_RADIUS;
    parts.push(`M0,${-h}A${h},${h} 0 0,0 0,${h}A${h},${h} 0 0,0 0,${-h}Z`);
  }
  return parts.join("");
}

// Angle of the centre of tooth 0 for a tooth set drawn by teethPath
const toothOffset = (set) => -Math.PI / 2 + (1.5 * Math.PI) / set.n;

// Where gears A and B touch, as an angle from each one's centre
function contactAngles(a, setA, b, setB) {
  const internal = a.sets[setA].inward || b.sets[setB].inward;
  if (internal) {
    // Contact is on the line from the ring's centre out through the gear's
    const [ring, gear] = a.sets[setA].inward ? [a, b] : [b, a];
    const t = Math.atan2(gear.centre[1] - ring.centre[1], gear.centre[0] - ring.centre[0]);
    return { internal, ta: t, tb: t };
  }
  const t = Math.atan2(b.centre[1] - a.centre[1], b.centre[0] - a.centre[0]);
  return { internal, ta: t, tb: t + Math.PI };
}

// Starting angle for B that puts its teeth in A's gaps where they touch
function meshPhase(a, setA, b, setB) {
  const sa = a.sets[setA];
  const sb = b.sets[setB];
  const { internal, ta, tb } = contactAngles(a, setA, b, setB);
  const pitch = (2 * Math.PI * sa.r) / sa.n;
  const shift = sa.r * (toothOffset(sa) + a.phase - ta) + pitch / 2;
  return tb - toothOffset(sb) + (internal ? shift : -shift) / sb.r;
}

// Speed of the teeth where gears meet inside a level-k assembly, measured on
// its carrier. Each level down runs SPEED_GAIN times faster than the one
// above.
const toothSpeed = (k) => -1.5 / SPEED_GAIN ** (k - 1);

// Given the ring's speed and starting angle (relative to the frame the
// assembly sits in), set the carrier, sun and parts so every mesh keeps pace.
// Speeds are in degrees per ms.
function solve(node, ringSpeed, ringPhase) {
  node.outer.speed = ringSpeed;
  node.outer.phase = ringPhase;
  if (node.k === 0) return;

  const L = LEVELS[node.k];
  const v = toothSpeed(node.k);
  // On the carrier the ring's inner teeth must move at v
  node.carrier = ringSpeed - v / radius(L.ringIn);
  node.sun.speed = node.carrier - v / radius(L.sun);

  for (const part of node.parts) {
    const phase = meshPhase(node.outer, "in", part.outer, "out");
    solve(part, v / part.outer.sets.out.r, phase);
  }
  // Three parts at 120° all fit the sun (see buildLevels), so one is enough
  if (node.parts.length) node.sun.phase = meshPhase(node.parts[0].outer, "out", node.sun, "out");
}

function spin(el, msPerDegree) {
  el.classList.add("gear-spin");
  el.style.animationDuration = `${Math.abs(msPerDegree) * 360}ms`;
  if (msPerDegree < 0) el.style.animationDirection = "reverse";
}

function group(parent, transform) {
  const g = document.createElementNS(SVG_NS, "g");
  if (transform) g.setAttribute("transform", transform);
  parent.appendChild(g);
  return g;
}

function drawGear(parent, gear) {
  if (!gear.show) return;
  const g = group(parent, `translate(${gear.centre}) rotate(${(gear.phase * 180) / Math.PI})`);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", gearPath(gear));
  path.setAttribute("class", `gear gear-${gear.kind} gear-l${gear.level}`);
  spin(path, 1 / gear.speed);
  g.appendChild(path);
}

// Ring and sun turn in the parent's frame; the parts ride on a carrier that
// turns about the assembly's centre
function drawAssembly(parent, node) {
  drawGear(parent, node.outer);
  if (node.k === 0) return;
  drawGear(parent, node.sun);
  if (!node.parts.length) return;
  const pivot = group(parent, `translate(${node.centre})`);
  const carrier = group(pivot);
  if (node.carrier) spin(carrier, 1 / node.carrier);
  const frame = group(carrier, `translate(${node.centre.map((x) => -x)})`);
  for (const part of node.parts) drawAssembly(frame, part);
}

function render(svg) {
  const { width, height } = svg.getBoundingClientRect();
  if (!width || !height) return;

  const { top, scale } = chooseLayout(width, height);
  const w = width / scale;
  const h = height / scale;
  svg.setAttribute("viewBox", `${-w * PIVOT[0]} ${-h * PIVOT[1]} ${w} ${h}`);

  // The drift rotates everything about the centre sun, so cover a circle
  const viewR = pivotReach(w, h);
  const model = buildModel(top, viewR);
  // The top ring turns so its carrier stands still: the drift moves it instead
  solve(model, toothSpeed(top) / radius(LEVELS[top].ringIn), 0);

  const frame = document.createElementNS(SVG_NS, "g");
  spin(frame, DRIFT_MS_PER_DEGREE);
  drawAssembly(frame, model);
  svg.replaceChildren(frame);
}

const svg = document.getElementById("gears");
render(svg);

let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(svg), 150);
}).observe(svg);
