(() => {
  "use strict";

  /*
   * 今回の表示は Projection ではない。
   * 画面には常に「5つの面」を平面的な十字配置で表示し、
   * 反対側の1面は表示しない。
   *
   * View basis:
   *   right  = 画面右方向
   *   up     = 画面上方向
   *   center = 現在の中心面の法線
   *
   * E: up を固定して center/right を -90°回転
   *    → 画面上・下の面を保つガコン
   *
   * I: right を固定して center/up を -90°回転
   *    → 画面左・右の面を保つガコン
   */

  const NORMAL = {
    U: [0, 1, 0],
    D: [0, -1, 0],
    R: [1, 0, 0],
    L: [-1, 0, 0],
    F: [0, 0, 1],
    B: [0, 0, -1],
  };

  const COLOR = {
    U: "#ffffff",
    D: "#ffd500",
    R: "#e53935",
    L: "#ff8a00",
    F: "#21b453",
    B: "#2b63e8",
  };

  const KEY_FACE = {
    S: "L",
    D: "F",
    F: "R",
    J: "B",
    K: "D",
    L: "U",
  };

  const faceEls = {
    top: document.querySelector(".face-top"),
    left: document.querySelector(".face-left"),
    center: document.querySelector(".face-center"),
    right: document.querySelector(".face-right"),
    bottom: document.querySelector(".face-bottom"),
  };

  const centerLabel = document.getElementById("centerLabel");

  if (Object.values(faceEls).some((el) => !el) || !centerLabel) {
    throw new Error("Required UI elements are missing.");
  }

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function mul(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function unit(axis, value) {
    const v = [0, 0, 0];
    v[axis] = value;
    return v;
  }

  function rotate90(v, axis, quarterTurns) {
    let out = [...v];
    const turns = ((quarterTurns % 4) + 4) % 4;

    for (let i = 0; i < turns; i += 1) {
      out = add(cross(axis, out), mul(axis, dot(axis, out)));
    }

    return out;
  }

  function axisIndex(v) {
    return v.findIndex((x) => x !== 0);
  }

  function faceFromNormal(v) {
    for (const [face, n] of Object.entries(NORMAL)) {
      if (n[0] === v[0] && n[1] === v[1] && n[2] === v[2]) {
        return face;
      }
    }
    throw new Error(`Unknown face normal: ${v.join(",")}`);
  }

  function keyFor(pos, normal) {
    return `${pos.join(",")}|${normal.join(",")}`;
  }

  function createSolvedCube() {
    const stickers = [];

    for (const [face, normal] of Object.entries(NORMAL)) {
      const fixedAxis = axisIndex(normal);
      const tangentAxes = [0, 1, 2].filter((i) => i !== fixedAxis);

      for (const a of [-1, 0, 1]) {
        for (const b of [-1, 0, 1]) {
          const pos = add(
            [...normal],
            add(unit(tangentAxes[0], a), unit(tangentAxes[1], b)),
          );

          stickers.push({
            pos,
            normal: [...normal],
            color: face,
          });
        }
      }
    }

    return stickers;
  }

  let stickers = createSolvedCube();

  // 初期視点：
  //        B
  //     L  D  R
  //        F
  //
  // 「右方向」は +X = R、
  // 「上方向」は -Z = B、
  // 「中心」は -Y = D。
  let view = {
    right: [1, 0, 0],
    up: [0, 0, -1],
    center: [0, -1, 0],
  };

  function stateMap() {
    const map = new Map();

    for (const sticker of stickers) {
      map.set(keyFor(sticker.pos, sticker.normal), sticker.color);
    }

    return map;
  }

  function viewFaces() {
    const rightFace = faceFromNormal(view.right);
    const leftFace = faceFromNormal(mul(view.right, -1));
    const topFace = faceFromNormal(view.up);
    const bottomFace = faceFromNormal(mul(view.up, -1));
    const centerFace = faceFromNormal(view.center);

    return {
      topFace,
      leftFace,
      centerFace,
      rightFace,
      bottomFace,
    };
  }

  function faceBasis(face) {
    const { right, up, center } = view;
    const n = NORMAL[face];

    if (face === faceFromNormal(center)) {
      return { right, up };
    }

    // 各「周囲の面」は、中心面との共有辺が画面上の内側を向くようにする。
    if (face === faceFromNormal(up)) {
      return {
        right,
        up: mul(center, -1),
      };
    }

    if (face === faceFromNormal(mul(up, -1))) {
      return {
        right,
        up: center,
      };
    }

    if (face === faceFromNormal(right)) {
      return { right: mul(center, -1), up };
    }

    if (face === faceFromNormal(mul(right, -1))) {
      return { right: center, up };
    }

    return {
      right: [1, 0, 0],
      up: [0, 1, 0],
    };
  }

  function buildFaceColors(face, map) {
    const normal = NORMAL[face];
    const tangentAxes = [0, 1, 2].filter((i) => i !== axisIndex(normal));

    const basis = faceBasis(face);

    const cells = [];

    // 3×3 の各ステッカー中心を、画面上の left→right / top→bottom に対応。
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const localRight = col - 1;
        const localUp = 1 - row;

        const pos = add(
          normal,
          add(mul(basis.right, localRight), mul(basis.up, localUp)),
        );

        cells.push(map.get(keyFor(pos, normal)) || face);
      }
    }

    return cells;
  }

  function renderFace(element, face, map) {
    element.dataset.face = face;
    element.setAttribute("aria-label", `${face}面。クリックで回転`);

    element.replaceChildren();

    for (const colorFace of buildFaceColors(face, map)) {
      const sticker = document.createElement("span");
      sticker.className = "sticker";
      sticker.style.backgroundColor = COLOR[colorFace];
      element.appendChild(sticker);
    }
  }

  function render() {
    const faces = viewFaces();
    const map = stateMap();

    renderFace(faceEls.top, faces.topFace, map);
    renderFace(faceEls.left, faces.leftFace, map);
    renderFace(faceEls.center, faces.centerFace, map);
    renderFace(faceEls.right, faces.rightFace, map);
    renderFace(faceEls.bottom, faces.bottomFace, map);

    centerLabel.textContent = faces.centerFace;
    document.title = `3D → 2D Plane / ${faces.centerFace}`;
  }

  function rotateViewAround(axis, direction) {
    view.right = rotate90(view.right, axis, direction);
    view.up = rotate90(view.up, axis, direction);
    view.center = rotate90(view.center, axis, direction);
  }

  function gaconE() {
    // up を固定 → 画面の上・下の面を保つ。
    // D → R となる向き。
    rotateViewAround(view.up, -1);
    render();
  }

  function gaconI() {
    // right を固定 → 画面の左・右の面を保つ。
    // D → F となる向き。
    rotateViewAround(view.right, -1);
    render();
  }

  function rotateFace(face, inverse) {
    const axis = NORMAL[face];
    const fixedAxis = axisIndex(axis);
    const fixedValue = axis[fixedAxis];

    // 外側から見て clockwise / counter-clockwise。
    const quarterTurns = inverse ? 1 : 3;

    for (const sticker of stickers) {
      if (sticker.pos[fixedAxis] !== fixedValue) {
        continue;
      }

      sticker.pos = rotate90(sticker.pos, axis, quarterTurns);
      sticker.normal = rotate90(sticker.normal, axis, quarterTurns);
    }

    render();
  }

  document.addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }

    const key = event.key.toUpperCase();

    if (key === "E") {
      event.preventDefault();
      gaconE();
      return;
    }

    if (key === "I") {
      event.preventDefault();
      gaconI();
      return;
    }

    const face = KEY_FACE[key];

    if (!face) {
      return;
    }

    event.preventDefault();
    rotateFace(face, event.shiftKey);
  });

  for (const element of Object.values(faceEls)) {
    element.addEventListener("click", (event) => {
      const face = element.dataset.face;
      if (!face) {
        return;
      }

      rotateFace(face, event.shiftKey);
    });

    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();

      const face = element.dataset.face;
      if (!face) {
        return;
      }

      rotateFace(face, true);
    });
  }

  document.getElementById("eButton").addEventListener("click", gaconE);
  document.getElementById("iButton").addEventListener("click", gaconI);

  render();
})();
