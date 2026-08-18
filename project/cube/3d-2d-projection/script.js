"use strict";

const canvas = document.getElementById("cubeCanvas");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const angleSlider = document.getElementById("angleSlider");
const angleReadout = document.getElementById("angleReadout");
const resetView = document.getElementById("resetView");
const perspectiveToggle = document.getElementById("perspectiveToggle");
const axisToggle = document.getElementById("axisToggle");

const COLORS = {
  U: "#f7d91e",
  D: "#f5f5f5",
  F: "#23c54b",
  B: "#2563eb",
  R: "#ef3b2d",
  L: "#ff8a20",
};

const FACE_DEFS = {
  U: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  D: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  F: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  B: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  R: { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  L: { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
};

const cube = {
  U: Array(9).fill("U"),
  D: Array(9).fill("D"),
  F: Array(9).fill("F"),
  B: Array(9).fill("B"),
  R: Array(9).fill("R"),
  L: Array(9).fill("L"),
};

let angleDeg = 0;
let perspective = true;
let showAxis = true;
let dragging = false;
let lastX = 0;
let dragStartAngle = 0;

const axis = norm([1, 1, 1]);
const initialCamera = norm([1, -1, 0]); // perpendicular to the body diagonal
const distance = 6.4;
const cameraDistance = scale(initialCamera, distance);
const initialBasis = makeCameraBasis(cameraDistance);

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function norm(a) {
  const m = Math.hypot(a[0], a[1], a[2]) || 1;
  return scale(a, 1 / m);
}
function rotateAroundAxis(v, k, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const kv = cross(k, v);
  const kd = dot(k, v);
  return add(add(scale(v, c), scale(kv, s)), scale(k, kd * (1 - c)));
}

function makeCameraBasis(pos) {
  const view = norm(scale(pos, -1));
  let up = sub([0, 1, 0], scale(view, dot([0, 1, 0], view)));
  up = norm(up);
  const right = norm(cross(view, up));
  up = norm(cross(right, view));
  return { pos, view, right, up };
}

function cameraForAngle(theta) {
  const pos = rotateAroundAxis(cameraDistance, axis, theta);
  const right = rotateAroundAxis(initialBasis.right, axis, theta);
  const up = rotateAroundAxis(initialBasis.up, axis, theta);
  const view = norm(scale(pos, -1));
  return { pos, view, right: norm(right), up: norm(up) };
}

function projectPoint(p, cam, width, height) {
  const rel = sub(p, cam.pos);
  const xCam = dot(rel, cam.right);
  const yCam = dot(rel, cam.up);
  const zCam = dot(rel, cam.view);
  if (zCam <= 0.02) return null;

  const base = Math.min(width, height) * 0.31;
  let x, y;
  if (perspective) {
    const f = base * 3.7;
    x = width / 2 + (xCam / zCam) * f;
    y = height / 2 - (yCam / zCam) * f;
  } else {
    const s = base;
    x = width / 2 + xCam * s;
    y = height / 2 - yCam * s;
  }
  return { x, y, z: zCam };
}

function faceStickerQuad(faceName, row, col, inset = 0.055) {
  const f = FACE_DEFS[faceName];
  const center = add(
    scale(f.u, -1 + (col + 0.5) * (2 / 3)),
    scale(f.v, -1 + (row + 0.5) * (2 / 3)),
  );
  const surface = add(center, scale(f.n, 1));
  const half = 1 / 3 - inset;
  const du = scale(f.u, half);
  const dv = scale(f.v, half);
  const lift = scale(f.n, 0.008);
  return [
    add(add(surface, scale(f.n, 0.004)), add(scale(du, -1), scale(dv, -1))),
    add(add(surface, lift), add(scale(du, 1), scale(dv, -1))),
    add(add(surface, lift), add(scale(du, 1), scale(dv, 1))),
    add(add(surface, lift), add(scale(du, -1), scale(dv, 1))),
  ];
}

function faceNormalTowardCamera(faceName, cam) {
  return dot(FACE_DEFS[faceName].n, sub(cam.pos, [0, 0, 0])) > 0;
}

function drawAxis(cam, width, height) {
  if (!showAxis) return;
  const a = scale(axis, 2.15);
  const b = scale(axis, -2.15);
  const pa = projectPoint(a, cam, width, height);
  const pb = projectPoint(b, cam, width, height);
  if (!pa || !pb) return;
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,.22)";
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
  ctx.restore();
}

function roundedPolygon(points, radius) {
  // Draw a polygon with tiny corner rounding by using standard line joins.
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x,
      yi = points[i].y;
    const xj = points[j].x,
      yj = points[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function projectBasisVector(origin, basis, cam, width, height) {
  const a = projectPoint(origin, cam, width, height);
  const b = projectPoint(add(origin, basis), cam, width, height);
  if (!a || !b) return null;
  return { x: b.x - a.x, y: b.y - a.y };
}

let lastRenderPieces = [];

function drawCube() {
  resizeCanvas();
  const width = canvas.width / devicePixelRatio;
  const height = canvas.height / devicePixelRatio;
  const theta = (angleDeg * Math.PI) / 180;
  const cam = cameraForAngle(theta);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawAxis(cam, width, height);

  const pieces = [];
  const faces = ["U", "D", "F", "B", "R", "L"];
  for (const face of faces) {
    if (!faceNormalTowardCamera(face, cam)) continue;
    const f = FACE_DEFS[face];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const verts3 = faceStickerQuad(face, r, c);
        const verts2 = verts3.map((v) => projectPoint(v, cam, width, height));
        if (verts2.some((v) => !v)) continue;
        const depth = verts2.reduce((sum, v) => sum + v.z, 0) / verts2.length;
        const color = COLORS[cube[face][r * 3 + c]];
        const center3 = add(add(scale(f.u, c - 1), scale(f.v, r - 1)), f.n);
        const center2 = projectPoint(center3, cam, width, height);
        const basisU = projectBasisVector(center3, f.u, cam, width, height);
        const basisV = projectBasisVector(center3, f.v, cam, width, height);
        pieces.push({
          face,
          row: r,
          col: c,
          verts2,
          depth,
          color,
          center3,
          center2,
          basisU,
          basisV,
        });
      }
    }
  }

  pieces.sort((a, b) => b.depth - a.depth);
  lastRenderPieces = pieces;

  for (const piece of pieces) {
    roundedPolygon(piece.verts2);
    ctx.fillStyle = piece.color;
    ctx.fill();
    ctx.lineWidth = Math.max(1.8, Math.min(width, height) * 0.0032);
    ctx.strokeStyle = "#111";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  const center = projectPoint([0, 0, 0], cam, width, height);
  if (center) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.fill();
  }
}

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.max(320, Math.floor(rect.height));
  const targetW = Math.floor(w * ratio);
  const targetH = Math.floor(h * ratio);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function setAngle(deg) {
  angleDeg = ((deg % 360) + 360) % 360;
  angleSlider.value = angleDeg.toFixed(1);
  angleReadout.textContent = `${angleDeg.toFixed(1)}°`;
  drawCube();
}

function resetViewState() {
  setAngle(0);
}

// --- Rubik's Cube state and move engine ---------------------------------
// Each visible sticker is represented by its 3D position, face normal, and color.
// A face turn is then a genuine 90° rotation of the affected layer. This avoids
// hand-written row/column mappings becoming inconsistent for F/B, etc.

function vecKey(v) {
  return v.map((n) => Math.round(n * 1e6) / 1e6).join(",");
}

const MOVE_AXES = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

const stickers = [];

function makeStickerState() {
  stickers.length = 0;

  // Integer lattice: each sticker center uses {-1,0,1} on the two face axes,
  // and +/-1 on the face normal. This makes 90° rotations exact and stable.
  for (const face of Object.keys(FACE_DEFS)) {
    const f = FACE_DEFS[face];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const coordU = c - 1;
        const coordV = r - 1;
        const pos = add(add(scale(f.u, coordU), scale(f.v, coordV)), f.n);

        stickers.push({
          color: face,
          pos: [...pos],
          normal: [...f.n],
        });
      }
    }
  }
}

function nearestFaceFromNormal(n) {
  let bestFace = "F";
  let bestDot = -Infinity;
  for (const [face, def] of Object.entries(FACE_DEFS)) {
    const d = dot(n, def.n);
    if (d > bestDot) {
      bestDot = d;
      bestFace = face;
    }
  }
  return bestFace;
}

function positionToStickerIndex(face, pos) {
  const f = FACE_DEFS[face];
  const coordU = Math.round(dot(pos, f.u));
  const coordV = Math.round(dot(pos, f.v));

  const col = Math.max(0, Math.min(2, coordU + 1));
  const row = Math.max(0, Math.min(2, coordV + 1));
  return row * 3 + col;
}

function syncCubeArraysFromStickers() {
  for (const face of Object.keys(cube)) cube[face].fill(null);

  for (const sticker of stickers) {
    const face = nearestFaceFromNormal(sticker.normal);
    const index = positionToStickerIndex(face, sticker.pos);

    if (cube[face][index] !== null) {
      throw new Error(`Duplicate sticker slot: ${face}[${index}]`);
    }
    cube[face][index] = sticker.color;
  }

  for (const face of Object.keys(cube)) {
    if (cube[face].some((v) => v === null)) {
      throw new Error(`Sticker mapping failed on face ${face}`);
    }
  }
}

function applyMove(face, inverse = false) {
  const axisVec = MOVE_AXES[face];
  if (!axisVec) return;

  // Clockwise when looking directly at the named face from outside.
  // Inverse reverses that direction.
  const theta = ((inverse ? 1 : -1) * Math.PI) / 2;

  for (const sticker of stickers) {
    // The moved layer is the outer layer whose coordinate is +1
    // along the outward face normal. The axis vector already points outward.
    if (dot(sticker.pos, axisVec) !== 1) continue;

    const p = rotateAroundAxis(sticker.pos, axisVec, theta);
    const n = rotateAroundAxis(sticker.normal, axisVec, theta);

    // Snap to exact integer coordinates after the 90° turn.
    sticker.pos = p.map((v) => Math.round(v));
    sticker.normal = n.map((v) => Math.round(v));
  }

  syncCubeArraysFromStickers();
  drawCube();
}

function resetCube() {
  for (const f of Object.keys(cube)) cube[f].fill(f);
  makeStickerState();
  syncCubeArraysFromStickers();
  drawCube();
}

function canvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function pickSticker(x, y) {
  // lastRenderPieces is already painter-sorted: the later hit is visually on top.
  for (let i = lastRenderPieces.length - 1; i >= 0; i--) {
    const piece = lastRenderPieces[i];
    if (pointInPolygon(x, y, piece.verts2)) return piece;
  }
  return null;
}

let pointerMode = null; // 'view' or 'cube'
let activePiece = null;
let pointerStart = null;
let lastPointer = null;
let movedEnough = false;

function pointerDown(e) {
  const pt = canvasPointFromEvent(e);
  const hit = pickSticker(pt.x, pt.y);

  pointerMode = hit ? "cube" : "view";
  activePiece = hit;
  pointerStart = pt;
  lastPointer = pt;
  movedEnough = false;
  dragging = true;

  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function pointerMove(e) {
  if (!dragging) return;

  const pt = canvasPointFromEvent(e);
  const dx = pt.x - lastPointer.x;
  const dy = pt.y - lastPointer.y;
  const totalDx = pt.x - pointerStart.x;
  const totalDy = pt.y - pointerStart.y;
  lastPointer = pt;

  if (!movedEnough && Math.hypot(totalDx, totalDy) >= 8) movedEnough = true;
  if (!movedEnough) return;

  if (pointerMode === "view") {
    // View control intentionally remains 1D: only horizontal movement changes theta.
    if (Math.abs(dx) >= 0.01) setAngle(angleDeg + dx * 0.45);
    return;
  }

  // Cube control: determine rotation direction from the touched face's local 2D axes.
  // The dominant local direction of the swipe selects clockwise/counter-clockwise.
  if (!activePiece || Math.hypot(dx, dy) < 1.5) return;

  const bu = activePiece.basisU;
  const bv = activePiece.basisV;
  if (!bu || !bv) return;

  const uLen2 = bu.x * bu.x + bu.y * bu.y;
  const vLen2 = bv.x * bv.x + bv.y * bv.y;
  if (uLen2 < 1e-6 || vLen2 < 1e-6) return;

  // Normalize projected basis vectors, then measure the swipe in face-local coordinates.
  const u = { x: bu.x / Math.sqrt(uLen2), y: bu.y / Math.sqrt(uLen2) };
  const v = { x: bv.x / Math.sqrt(vLen2), y: bv.y / Math.sqrt(vLen2) };
  const localU = dx * u.x + dy * u.y;
  const localV = dx * v.x + dy * v.y;

  // Wait until one face-local axis clearly dominates. A single gesture produces one 90° turn.
  if (Math.max(Math.abs(localU), Math.abs(localV)) < 5) return;
  const clockwise =
    Math.abs(localU) >= Math.abs(localV) ? localU > 0 : localV < 0;

  dragging = false;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch (_) {}
  applyMove(activePiece.face, !clockwise);
  pointerMode = null;
  activePiece = null;
}

function pointerUp(e) {
  dragging = false;
  pointerMode = null;
  activePiece = null;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch (_) {}
}

canvas.addEventListener("pointerdown", pointerDown);
canvas.addEventListener("pointermove", pointerMove);
canvas.addEventListener("pointerup", pointerUp);
canvas.addEventListener("pointercancel", pointerUp);

angleSlider.addEventListener("input", () =>
  setAngle(Number(angleSlider.value)),
);
resetView.addEventListener("click", resetViewState);

perspectiveToggle.addEventListener("change", () => {
  perspective = perspectiveToggle.checked;
  drawCube();
});

axisToggle.addEventListener("change", () => {
  showAxis = axisToggle.checked;
  drawCube();
});

document.querySelectorAll(".move").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const move = btn.dataset.move;
    applyMove(move, e.shiftKey);
  });
});

const keyMap = Object.freeze({
  s: "L",
  d: "F",
  f: "R",
  j: "B",
  k: "D",
  l: "U",
});

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.target && e.target.matches("input, textarea, select, button")) return;

  const key = e.key.toLowerCase();
  const move = keyMap[key];

  if (move) {
    e.preventDefault();
    applyMove(move, e.shiftKey);
    return;
  }

  if (e.key === "0") {
    e.preventDefault();
    resetViewState();
  }
});

window.addEventListener("resize", drawCube);

resetCube();
