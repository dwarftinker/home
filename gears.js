// Planetary gears. The SVG is built once here; all motion comes from CSS
// animations (see .gear-spin in style.css), so no JavaScript runs per frame.
//
// Every tooth set uses the same tooth size (pitch radius / teeth = 1.5), so
// any two gears can mesh. Speeds are chosen so touching gears move at the same
// rate where they meet, and each gear gets a starting angle that drops its
// teeth into its neighbours' gaps.

const SVG_NS = "http://www.w3.org/2000/svg";
const TOOTH_HEIGHT = 3; // tooth tip / root distance from the pitch circle
const AXLE_RADIUS = 10;

// Small ring: 80 teeth inside (radius 120), 91 teeth outside (radius 136.5).
// Centre sun (32) + outer teeth (91) is divisible by 3, which is what lets
// three rings spaced 120° apart all mesh with the centre sun and big ring.
const SUN_R = 48;
const RING_OUTER_R = 136.5;
const CARRIER_DIST = SUN_R + RING_OUTER_R; // 184.5
const BIG_RING_R = CARRIER_DIST + RING_OUTER_R; // 321

// Edge speed where gears meet, relative to the small gears inside the rings
const OUTER_SPEED = RING_OUTER_R / 120;

const teeth = (n, r, inward) => ({ n, r, inward });

const gears = [];
const meshes = [];

function addGear(kind, centre, msPerDegree, sets) {
  const gear = { kind, centre, msPerDegree, sets, phase: null };
  gears.push(gear);
  return gear;
}

// msPerDegree: time for one degree of rotation; negative spins the other way
const bigRing = addGear("ring", [0, 0], -BIG_RING_R / OUTER_SPEED, {
  in: teeth(214, BIG_RING_R, true),
  out: teeth(226, BIG_RING_R + 18, false), // decorative rim
});
const centreSun = addGear("sun", [0, 0], SUN_R / OUTER_SPEED, {
  out: teeth(32, SUN_R, false),
});

for (let i = 0; i < 3; i++) {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
  const c = [CARRIER_DIST * Math.cos(angle), CARRIER_DIST * Math.sin(angle)];

  const ring = addGear("ring", c, -120, {
    in: teeth(80, 120, true),
    out: teeth(91, RING_OUTER_R, false),
  });
  const sun = addGear("sun", c, 24, { out: teeth(16, 24, false) });

  meshes.push([centreSun, "out", ring, "out"], [ring, "out", bigRing, "in"]);

  for (let j = 0; j < 3; j++) {
    const a = angle + (j * 2 * Math.PI) / 3;
    const planet = addGear("planet", [c[0] + 72 * Math.cos(a), c[1] + 72 * Math.sin(a)], -48, {
      out: teeth(32, 48, false),
    });
    meshes.push([ring, "in", planet, "out"], [planet, "out", sun, "out"]);
  }
}

// Path for one set of teeth around a circle. Teeth point outward, or inward
// for the inside of a ring.
function teethPath({ n, r, inward }) {
  const root = inward ? r + TOOTH_HEIGHT : r - TOOTH_HEIGHT;
  const tip = inward ? r - TOOTH_HEIGHT : r + TOOTH_HEIGHT;
  const da = Math.PI / n;
  const pt = (radius, a) => `${radius * Math.cos(a)},${radius * Math.sin(a)}`;
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

// Fix the centre sun, then spread starting angles out through the meshes
centreSun.phase = 0;
let changed = true;
while (changed) {
  changed = false;
  for (const [a, setA, b, setB] of meshes) {
    if (a.phase !== null && b.phase === null) {
      b.phase = meshPhase(a, setA, b, setB);
      changed = true;
    } else if (b.phase !== null && a.phase === null) {
      a.phase = meshPhase(b, setB, a, setA);
      changed = true;
    }
  }
}

function spin(el, msPerDegree) {
  el.classList.add("gear-spin");
  el.style.animationDuration = `${Math.abs(msPerDegree) * 360}ms`;
  if (msPerDegree < 0) el.style.animationDirection = "reverse";
}

const svg = document.getElementById("gears");
const frame = document.createElementNS(SVG_NS, "g");
spin(frame, 200); // whole assembly drifts slowly
svg.appendChild(frame);

for (const gear of gears) {
  const g = document.createElementNS(SVG_NS, "g");
  const deg = (gear.phase * 180) / Math.PI;
  g.setAttribute("transform", `translate(${gear.centre}) rotate(${deg})`);

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", gearPath(gear));
  path.setAttribute("class", `gear gear-${gear.kind}`);
  spin(path, gear.msPerDegree);

  g.appendChild(path);
  frame.appendChild(g);
}
