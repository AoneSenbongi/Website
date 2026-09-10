(() => {
  const params = new URLSearchParams(window.location.search);
  const isEnglish = params.get("lang") === "en";
  const path = window.location.pathname;

  const switcher = document.createElement("nav");
  switcher.className = "demo-language-switch";
  switcher.setAttribute("aria-label", isEnglish ? "Select language" : "言語を選択");
  switcher.innerHTML = `
    <a href="${path}" lang="ja" hreflang="ja"${isEnglish ? "" : ' class="current" aria-current="page"'}>JP</a>
    <a href="${path}?lang=en" lang="en" hreflang="en"${isEnglish ? ' class="current" aria-current="page"' : ""}>EN</a>
  `;
  document.body.append(switcher);

  const destination = switcher.querySelector("a:not(.current)");
  switcher.setAttribute(
    "aria-label",
    isEnglish ? "Switch to Japanese" : "英語に切り替える",
  );
  switcher.addEventListener("click", (event) => {
    if (
      !destination ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    window.location.assign(destination.href);
  });

  const style = document.createElement("style");
  style.textContent = `
    .demo-language-switch { position: fixed; z-index: 9999; right: 1rem; bottom: 1rem; display: inline-flex; padding: .2rem; border: 1px solid #d3d9e3; border-radius: 999px; background: rgba(244,246,249,.95); box-shadow: 0 4px 18px rgba(15,23,42,.14); cursor: pointer; font: 750 .78rem/1 system-ui,sans-serif; letter-spacing: .05em; }
    .demo-language-switch a { min-width: 2.25rem; padding: .48rem .58rem; border-radius: 999px; color: #667085; text-align: center; text-decoration: none; }
    .demo-language-switch a.current { background: #fff; box-shadow: 0 1px 4px rgba(24,39,75,.14); color: #111827; }
  `;
  document.head.append(style);

  if (!isEnglish) return;
  document.documentElement.lang = "en";

  const setText = (selector, text) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
  };
  const setLabel = (selector, text) => {
    document.querySelector(selector)?.setAttribute("aria-label", text);
  };
  const setMeta = (description) => {
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  };

  if (path.includes("3d-2d-projection")) {
    document.title = "3D Cube → 2D Projection | Seiya Yamachika";
    setMeta("An interactive demo for projecting a 3D cube onto a 2D canvas, rotating the viewpoint, and manipulating the cube.");
    setText(".header p", "A one-degree-of-freedom viewpoint rotating around the body diagonal");
    setText("#resetView", "Reset view");
    setLabel("#cubeCanvas", "3D Rubik’s Cube projected into 2D");
    setText(".drag-hint", "Drag left or right to rotate the viewpoint");
    const headings = document.querySelectorAll(".panel-block h2");
    if (headings[0]) headings[0].textContent = "Viewpoint";
    if (headings[1]) headings[1].textContent = "Cube controls";
    if (headings[2]) headings[2].textContent = "Display";
    setText(".readout span", "Rotation angle");
    setLabel("#angleSlider", "Viewpoint rotation angle");
    const notes = document.querySelectorAll(".panel-block .note");
    if (notes[0]) notes[0].textContent = "The camera moves only along a one-dimensional orbit around the cube’s body diagonal. Vertical dragging is ignored.";
    if (notes[1]) notes[1].textContent = "Each button rotates clockwise; Shift-click rotates counterclockwise. S / D / F control the L / F / R faces, while J / K / L control the B / D / U faces.";
    const toggles = document.querySelectorAll(".toggle");
    if (toggles[0]) toggles[0].lastChild.textContent = " Perspective projection";
    if (toggles[1]) toggles[1].lastChild.textContent = " Show body-diagonal axis";
    setText(".footer > span:first-child", "The cube state is stored in 3D; only its display is projected onto a 2D canvas.");
  }

  if (path.includes("3d-2d-slice")) {
    document.title = "3D → 2D Plane | Seiya Yamachika";
    setMeta("An interactive demo for viewing a 3D cube as a 2D plane and switching the omitted axis.");
    setText(".header p", "Switch between 2D worlds by omitting one axis");
    setText(".center-badge span", "Center");
    setLabel("#world", "Rubik’s Cube displayed as a two-dimensional plane");
    ["Top face", "Left face", "Center face", "Right face", "Bottom face"].forEach((label, index) => document.querySelectorAll(".face")[index]?.setAttribute("aria-label", label));
    setText("#eButton span", "Keep vertical");
    setText(".gacon-description strong", "SWITCH");
    setText(".gacon-description small", "Change the central 2D world");
    setText("#iButton span", "Keep horizontal");
    const help = document.querySelectorAll(".control-panel .help span");
    if (help[0]) help[0].lastChild.textContent = " Three faces on the left";
    if (help[1]) help[1].lastChild.textContent = " Three faces on the right";
    if (help[2]) help[2].textContent = "Click a face: rotate 90° / Shift-click: reverse";
  }

  if (path.includes("3d-2d-net")) {
    document.title = "Cube Net Viewer | Seiya Yamachika";
    setMeta("A prototype for manipulating and inspecting a Rubik’s Cube as a two-dimensional net.");
    setText(".header-note", "Map a three-dimensional state onto a separated cube net. Dragging can rotate both faces and middle layers.");
    setLabel(".stage", "Rubik’s Cube net");
    setLabel("aside .card", "Control panel");
    setText("#message", "Ready");
    setText(".section-label", "Selected face");
    setLabel("#selectedFace", "Selected face");
    setText(".selected-move .help", "Click a face to select it");
    setLabel("#ccw", "Rotate counterclockwise");
    setLabel("#cw", "Rotate clockwise");
    setLabel("#half", "Rotate 180 degrees");
    setText("#copy", "Copy moves");
    const toggleText = document.querySelector(".toggle-row > span:first-child");
    if (toggleText) toggleText.innerHTML = "Hide center cells<small>Compare display density</small>";
    const help = document.querySelector("aside .card:last-child .help");
    if (help) help.innerHTML = "Left-click a center cell to rotate counterclockwise; right-click to rotate clockwise. Swipe a sticker vertically or horizontally to rotate its row or column.<br /><br /><kbd>U</kbd> <kbd>D</kbd> <kbd>L</kbd> <kbd>R</kbd> <kbd>F</kbd> <kbd>B</kbd> rotate clockwise; hold <kbd>Shift</kbd> to reverse.";

    const translateCubeLabels = () => {
      document.querySelectorAll("[aria-label]").forEach((element) => {
        const label = element.getAttribute("aria-label");
        if (/^[UDFBLR]面/.test(label)) element.setAttribute("aria-label", label.replace("面の中心。左クリックで反時計回り、右クリックで時計回り", " face center. Left-click counterclockwise; right-click clockwise").replace("面", " face").replace("行", " row ").replace("列", " column "));
      });
      document.querySelectorAll('[title="左クリック：反時計回り ／ 右クリック：時計回り"]').forEach((element) => element.title = "Left-click: counterclockwise / Right-click: clockwise");
    };
    translateCubeLabels();
    const net = document.querySelector("#net");
    if (net) new MutationObserver(translateCubeLabels).observe(net, { childList: true, subtree: true });

    const translateStatus = (text) => {
      if (text === "準備完了") return "Ready";
      if (text === "ドラッグまたはキーで操作") return "Drag or use the keyboard to move";
      if (text === "初期状態に戻しました") return "Reset to the solved state";
      if (text === "24手でスクランブルしました") return "Scrambled with 24 moves";
      if (text === "コピーする手順がありません") return "There are no moves to copy";
      if (text === "手順をコピーしました") return "Moves copied";
      if (text === "コピーできませんでした") return "Could not copy the moves";
      if (text === "SOLVED — 完成！") return "SOLVED!";
      return text.replace(/ を取り消しました$/, " undone");
    };
    const message = document.querySelector("#message");
    if (message) new MutationObserver(() => {
      const translated = translateStatus(message.textContent);
      if (translated !== message.textContent) message.textContent = translated;
    }).observe(message, { childList: true, subtree: true });
  }
})();
