'use strict';

const canvas = document.getElementById('cubeCanvas');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const angleSlider = document.getElementById('angleSlider');
const angleReadout = document.getElementById('angleReadout');
const resetView = document.getElementById('resetView');
const perspectiveToggle = document.getElementById('perspectiveToggle');
const axisToggle = document.getElementById('axisToggle');

const COLORS = {
  U: '#f7d91e',
  D: '#f5f5f5',
  F: '#23c54b',
  B: '#2563eb',
  R: '#ef3b2d',
  L: '#ff8a20',
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
  U: Array(9).fill('U'),
  D: Array(9).fill('D'),
  F: Array(9).fill('F'),
  B: Array(9).fill('B'),
  R: Array(9).fill('R'),
  L: Array(9).fill('L'),
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

function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function cross(a, b) {
  return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
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
    scale(f.u, -1 + (col + 0.5) * (2/3)),
    scale(f.v, -1 + (row + 0.5) * (2/3))
  );
  const surface = add(center, scale(f.n, 1));
  const half = 1/3 - inset;
  const du = scale(f.u, half);
  const dv = scale(f.v, half);
  const lift = scale(f.n, 0.008);
  return [
    add(add(surface, scale(f.n, 0.004)), add(scale(du, -1), scale(dv, -1))),
    add(add(surface, lift), add(scale(du,  1), scale(dv, -1))),
    add(add(surface, lift), add(scale(du,  1), scale(dv,  1))),
    add(add(surface, lift), add(scale(du, -1), scale(dv,  1))),
  ];
}

function faceNormalTowardCamera(faceName, cam) {
  return dot(FACE_DEFS[faceName].n, sub(cam.pos, [0,0,0])) > 0;
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
  ctx.strokeStyle = 'rgba(0,0,0,.22)';
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

function drawCube() {
  const size = resizeCanvas();
  const width = size.width;
  const height = size.height;
  const theta = angleDeg * Math.PI / 180;
  const cam = cameraForAngle(theta);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  drawAxis(cam, width, height);

  const pieces = [];
  const faces = ['U', 'D', 'F', 'B', 'R', 'L'];
  for (const face of faces) {
    if (!faceNormalTowardCamera(face, cam)) continue;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const verts3 = faceStickerQuad(face, r, c);
        const verts2 = verts3.map(v => projectPoint(v, cam, width, height));
        if (verts2.some(v => !v)) continue;
        const depth = verts2.reduce((sum, v) => sum + v.z, 0) / verts2.length;
        const color = COLORS[cube[face][r*3 + c]];
        pieces.push({ face, verts2, depth, color });
      }
    }
  }

  // Painter's algorithm: far stickers first.
  pieces.sort((a, b) => b.depth - a.depth);

  for (const piece of pieces) {
    roundedPolygon(piece.verts2);
    ctx.fillStyle = piece.color;
    ctx.fill();
    ctx.lineWidth = Math.max(1.8, Math.min(width, height) * 0.0032);
    ctx.strokeStyle = '#111';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Add a little central glint so the perspective reads as a physical object.
  const center = projectPoint([0,0,0], cam, width, height);
  if (center) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.fill();
  }
}

function resizeCanvas() {
  // The stage has a fixed CSS height. Keep the canvas absolutely positioned
  // inside it so repeated redraws can never change the page height.
  const w = Math.max(320, Math.floor(stage.clientWidth));
  const h = Math.max(320, Math.floor(stage.clientHeight));
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.floor(w * ratio);
  const targetH = Math.floor(h * ratio);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: w, height: h };
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

function rotateFaceMatrix(face) {
  const old = cube[face].slice();
  const next = Array(9);
  const m = [6,3,0,7,4,1,8,5,2];
  for (let i = 0; i < 9; i++) next[i] = old[m[i]];
  cube[face] = next;
}

function reverseFaceMatrix(face) {
  rotateFaceMatrix(face);
  rotateFaceMatrix(face);
  rotateFaceMatrix(face);
}

function cycleStrip(arr, a, b, c, source) {
  const vals = [cube[source[0]][a], cube[source[0]][b], cube[source[0]][c]];
  for (let i = 0; i < 3; i++) cube[source[1]][[a,b,c][i]] = vals[i];
}

function applyMove(face, inverse = false) {
  // Face turns are standard 3x3 sticker permutations in face notation.
  // One clockwise turn is defined while looking directly at that face.
  if (inverse) {
    applyMove(face, false);
    applyMove(face, false);
    applyMove(face, false);
    return;
  }

  rotateFaceMatrix(face);

  const x = (f, i) => cube[f][i];
  const s = (f, i, v) => { cube[f][i] = v; };

  switch (face) {
    case 'U': {
      const F = [0,1,2], R=[0,1,2], B=[0,1,2], L=[0,1,2];
      const tmp = F.map(i => x('F',i));
      F.forEach((i,j)=>s('F',i,x('L',L[j])));
      L.forEach((i,j)=>s('L',i,x('B',B[j])));
      B.forEach((i,j)=>s('B',i,x('R',R[j])));
      R.forEach((i,j)=>s('R',i,tmp[j]));
      break;
    }
    case 'D': {
      const F = [6,7,8], R=[6,7,8], B=[6,7,8], L=[6,7,8];
      const tmp = F.map(i => x('F',i));
      F.forEach((i,j)=>s('F',i,x('R',R[j])));
      R.forEach((i,j)=>s('R',i,x('B',B[j])));
      B.forEach((i,j)=>s('B',i,x('L',L[j])));
      L.forEach((i,j)=>s('L',i,tmp[j]));
      break;
    }
    case 'F': {
      const u=[6,7,8], r=[0,3,6], d=[2,1,0], l=[8,5,2];
      const tmp = u.map(i=>x('U',i));
      u.forEach((i,j)=>s('U',i,x('L',l[j])));
      l.forEach((i,j)=>s('L',i,x('D',d[j])));
      d.forEach((i,j)=>s('D',i,x('R',r[j])));
      r.forEach((i,j)=>s('R',i,tmp[j]));
      break;
    }
    case 'B': {
      const u=[0,1,2], r=[2,5,8], d=[8,7,6], l=[6,3,0];
      const tmp = u.map(i=>x('U',i));
      u.forEach((i,j)=>s('U',i,x('R',r[j])));
      r.forEach((i,j)=>s('R',i,x('D',d[j])));
      d.forEach((i,j)=>s('D',i,x('L',l[j])));
      l.forEach((i,j)=>s('L',i,tmp[j]));
      break;
    }
    case 'R': {
      const u=[2,5,8], f=[2,5,8], d=[2,5,8], b=[6,3,0];
      const tmp = u.map(i=>x('U',i));
      u.forEach((i,j)=>s('U',i,x('F',f[j])));
      f.forEach((i,j)=>s('F',i,x('D',d[j])));
      d.forEach((i,j)=>s('D',i,x('B',b[j])));
      b.forEach((i,j)=>s('B',i,tmp[j]));
      break;
    }
    case 'L': {
      const u=[0,3,6], f=[0,3,6], d=[0,3,6], b=[8,5,2];
      const tmp = u.map(i=>x('U',i));
      u.forEach((i,j)=>s('U',i,x('B',b[j])));
      b.forEach((i,j)=>s('B',i,x('D',d[j])));
      d.forEach((i,j)=>s('D',i,x('F',f[j])));
      f.forEach((i,j)=>s('F',i,tmp[j]));
      break;
    }
  }
  drawCube();
}

function resetCube() {
  for (const f of Object.keys(cube)) cube[f].fill(f);
  drawCube();
}

function pointerDown(e) {
  dragging = true;
  lastX = e.clientX;
  dragStartAngle = angleDeg;
  canvas.setPointerCapture(e.pointerId);
}

function pointerMove(e) {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  // Exactly one input dimension: only horizontal movement changes theta.
  setAngle(angleDeg + dx * 0.45);
}

function pointerUp(e) {
  dragging = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
}

canvas.addEventListener('pointerdown', pointerDown);
canvas.addEventListener('pointermove', pointerMove);
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);
canvas.addEventListener('pointerleave', () => { /* keep capture-based drag alive */ });

angleSlider.addEventListener('input', () => setAngle(Number(angleSlider.value)));
resetView.addEventListener('click', resetViewState);

perspectiveToggle.addEventListener('change', () => {
  perspective = perspectiveToggle.checked;
  drawCube();
});

axisToggle.addEventListener('change', () => {
  showAxis = axisToggle.checked;
  drawCube();
});

document.querySelectorAll('.move').forEach(btn => {
  btn.addEventListener('click', e => {
    const move = btn.dataset.move;
    applyMove(move, e.shiftKey);
  });
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  const key = e.key.toUpperCase();
  if ('UDLRFB'.includes(key)) {
    e.preventDefault();
    applyMove(key, e.shiftKey);
  }
  if (e.key === '0') resetViewState();
});

window.addEventListener('resize', drawCube);

resetCube();
