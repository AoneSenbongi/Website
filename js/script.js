const header = document.querySelector(".header");
let isEnglishPage = document.documentElement.lang === "en";
const themeStorageKey = "yamachika-theme";
const systemDarkTheme = window.matchMedia("(prefers-color-scheme: dark)");

function readSavedTheme() {
  try {
    const savedTheme = window.localStorage.getItem(themeStorageKey);
    return savedTheme === "light" || savedTheme === "dark" ? savedTheme : null;
  } catch {
    return null;
  }
}

function resolvedTheme() {
  return readSavedTheme() || (systemDarkTheme.matches ? "dark" : "light");
}

const savedTheme = readSavedTheme();
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

function themeIcon(theme) {
  return theme === "dark"
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"></path></svg>';
}

function updateThemeToggle(button) {
  const theme = resolvedTheme();
  const label = isEnglishPage
    ? `Switch to ${theme === "dark" ? "light" : "dark"} mode`
    : `${theme === "dark" ? "ライト" : "ダーク"}モードに切り替える`;

  button.innerHTML = themeIcon(theme);
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.setAttribute("aria-pressed", String(theme === "dark"));
}

function createThemeToggle() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-toggle";
  updateThemeToggle(button);
  button.addEventListener("click", () => {
    const nextTheme = resolvedTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // The selected theme still applies for this page when storage is unavailable.
    }
    updateThemeToggle(button);
  });
  return button;
}

systemDarkTheme.addEventListener?.("change", () => {
  if (!readSavedTheme()) {
    document.querySelectorAll(".theme-toggle").forEach(updateThemeToggle);
  }
});

function normalizePath(pathname) {
  return pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
}

let normalizedPath = normalizePath(window.location.pathname);
let pagePath = isEnglishPage
  ? normalizedPath.replace(/^\/en(?=\/|$)/, "") || "/"
  : normalizedPath;
const translatedPaths = new Set([
  "/",
  "/research/",
  "/research/i2",
  "/research/vrsj2026",
  "/project/",
  "/project/cube/",
  "/project/cube/3d-2d/",
  "/contact/",
]);
const languageDocumentCache = new Map();
let languageNavigationInProgress = false;

function fetchLanguageDocument(url) {
  const targetUrl = new URL(url, window.location.href);
  const cacheKey = targetUrl.href;
  if (languageDocumentCache.has(cacheKey)) {
    return languageDocumentCache.get(cacheKey);
  }

  const request = (async () => {
    const requestOptions = { headers: { "X-Requested-With": "language-switch" } };
    let response = await fetch(targetUrl.href, requestOptions);
    const finalSegment = targetUrl.pathname.split("/").filter(Boolean).at(-1) || "";

    if (!response.ok && !targetUrl.pathname.endsWith("/") && !finalSegment.includes(".")) {
      const htmlFallbackUrl = new URL(targetUrl.href);
      htmlFallbackUrl.pathname = `${htmlFallbackUrl.pathname}.html`;
      response = await fetch(htmlFallbackUrl.href, requestOptions);
    }

    if (!response.ok) throw new Error(`Language page returned ${response.status}`);
    const html = await response.text();
    const targetDocument = new DOMParser().parseFromString(html, "text/html");
    if (!targetDocument.querySelector("main") || !targetDocument.querySelector(".header")) {
      throw new Error("Language page is missing the shared layout");
    }
    return targetDocument;
  })().catch((error) => {
    languageDocumentCache.delete(cacheKey);
    throw error;
  });

  languageDocumentCache.set(cacheKey, request);
  return request;
}

function syncHeadFromDocument(targetDocument) {
  const selector = [
    'meta[name="description"]',
    'meta[property^="og:"]',
    'meta[name^="twitter:"]',
    'link[rel="canonical"]',
    'link[rel="alternate"][hreflang]',
  ].join(",");

  document.head.querySelectorAll(selector).forEach((element) => element.remove());
  targetDocument.head.querySelectorAll(selector).forEach((element) => {
    document.head.append(document.importNode(element, true));
  });
  document.title = targetDocument.title;
}

function syncAnchor(currentAnchor, targetAnchor) {
  if (!currentAnchor || !targetAnchor) return;
  currentAnchor.textContent = targetAnchor.textContent;
  currentAnchor.setAttribute("href", targetAnchor.getAttribute("href") || "#");
  for (const attribute of ["lang", "hreflang", "aria-label"]) {
    const value = targetAnchor.getAttribute(attribute);
    if (value === null) currentAnchor.removeAttribute(attribute);
    else currentAnchor.setAttribute(attribute, value);
  }
}

function syncHeaderFromDocument(targetDocument) {
  const targetHeader = targetDocument.querySelector(".header");
  if (!header || !targetHeader) return;

  syncAnchor(header.querySelector(".logo a"), targetHeader.querySelector(".logo a"));

  const currentDesktopNav = header.querySelector(".pc-nav");
  const targetDesktopNav = targetHeader.querySelector(".pc-nav");
  if (currentDesktopNav && targetDesktopNav) {
    const navLabel = targetDesktopNav.getAttribute("aria-label");
    if (navLabel) currentDesktopNav.setAttribute("aria-label", navLabel);
    else currentDesktopNav.removeAttribute("aria-label");
    const currentLinks = [...currentDesktopNav.querySelectorAll(":scope > a")];
    const targetLinks = [...targetDesktopNav.querySelectorAll(":scope > a")];
    currentLinks.forEach((link, index) => syncAnchor(link, targetLinks[index]));
  }

  const currentMobileNav = header.querySelector(".hamburger-menu");
  const targetMobileNav = targetHeader.querySelector(".hamburger-menu");
  if (currentMobileNav && targetMobileNav) {
    const currentLinks = [...currentMobileNav.querySelectorAll(":scope > a")];
    const targetLinks = [...targetMobileNav.querySelectorAll(":scope > a")];
    currentLinks.forEach((link, index) => syncAnchor(link, targetLinks[index]));
  }
}

function updateLanguageSwitches() {
  const options = [
    { href: pagePath, lang: "ja" },
    { href: pagePath === "/" ? "/en/" : `/en${pagePath}`, lang: "en" },
  ];

  document.querySelectorAll(".language-switch").forEach((switcher) => {
    switcher.setAttribute(
      "aria-label",
      isEnglishPage ? "Switch to Japanese" : "英語に切り替える",
    );
    switcher.querySelectorAll(":scope > a").forEach((link, index) => {
      const option = options[index];
      if (!option) return;
      const isCurrent = option.lang === (isEnglishPage ? "en" : "ja");
      link.href = option.href;
      link.classList.toggle("current", isCurrent);
      if (isCurrent) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  });
}

function updateLanguageContext(targetDocument, targetUrl) {
  isEnglishPage = targetDocument.documentElement.lang === "en";
  document.documentElement.lang = targetDocument.documentElement.lang;
  normalizedPath = normalizePath(targetUrl.pathname);
  pagePath = isEnglishPage
    ? normalizedPath.replace(/^\/en(?=\/|$)/, "") || "/"
    : normalizedPath;
  menuLabels = getMenuLabels();
}

async function navigateLanguage(url, { historyMode = "push" } = {}) {
  if (languageNavigationInProgress) return;
  languageNavigationInProgress = true;
  document.querySelectorAll(".language-switch").forEach((switcher) => {
    switcher.setAttribute("aria-busy", "true");
  });

  const targetUrl = new URL(url, window.location.href);
  const scrollPosition = window.scrollY;
  try {
    const targetDocument = await fetchLanguageDocument(targetUrl.href);
    const targetMain = targetDocument.querySelector("main");
    const targetFooter = targetDocument.querySelector("footer, .footer");

    const applyLanguagePage = () => {
      updateLanguageContext(targetDocument, targetUrl);
      const state = { ...(window.history.state || {}), languageSwap: true };
      if (historyMode === "push") window.history.pushState(state, "", targetUrl.href);
      else if (historyMode === "replace") window.history.replaceState(state, "", targetUrl.href);

      syncHeadFromDocument(targetDocument);
      syncHeaderFromDocument(targetDocument);

      const currentMain = document.querySelector("main");
      if (currentMain && targetMain) {
        currentMain.replaceWith(document.importNode(targetMain, true));
      }

      const currentFooter = document.querySelector("footer, .footer");
      if (currentFooter && targetFooter) {
        currentFooter.replaceWith(document.importNode(targetFooter, true));
      }

      updateLanguageSwitches();
      updateRouteState();
      updateMenuLabels();
      updateMobileEmailLink();
      document.querySelectorAll(".theme-toggle").forEach(updateThemeToggle);
      setMenu(false, false);

      window.scrollTo({ top: scrollPosition, left: 0, behavior: "auto" });
    };

    if (document.startViewTransition) {
      await document.startViewTransition(applyLanguagePage).finished;
    } else {
      applyLanguagePage();
    }
  } finally {
    languageNavigationInProgress = false;
    document.querySelectorAll(".language-switch").forEach((switcher) => {
      switcher.removeAttribute("aria-busy");
    });
  }
}

function preloadLanguageDestination(switcher) {
  const destination = switcher.querySelector("a:not(.current)");
  if (destination) fetchLanguageDocument(destination.href).catch(() => {});
}

function createLanguageSwitch(mobile = false) {
  const switcher = document.createElement(mobile ? "div" : "nav");
  switcher.className = `language-switch${mobile ? " language-switch-mobile" : ""}`;
  switcher.setAttribute("aria-label", isEnglishPage ? "Select language" : "言語を選択");
  if (mobile) switcher.setAttribute("role", "group");

  const options = [
    { code: "JP", href: pagePath, lang: "ja" },
    { code: "EN", href: pagePath === "/" ? "/en/" : `/en${pagePath}`, lang: "en" },
  ];

  options.forEach(({ code, href, lang }) => {
    const link = document.createElement("a");
    link.href = href;
    link.lang = lang;
    link.hreflang = lang;
    link.textContent = code;
    if ((isEnglishPage && lang === "en") || (!isEnglishPage && lang === "ja")) {
      link.className = "current";
      link.setAttribute("aria-current", "page");
    }
    switcher.append(link);
  });

  return switcher;
}

function enableLanguageToggle(switcher) {
  if (!switcher.querySelector("a:not(.current)") || switcher.dataset.toggleReady === "true") {
    return;
  }

  switcher.dataset.toggleReady = "true";
  switcher.style.cursor = "pointer";
  switcher.setAttribute(
    "aria-label",
    isEnglishPage ? "Switch to Japanese" : "英語に切り替える",
  );
  switcher.addEventListener("click", (event) => {
    if (
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
    const destination = switcher.querySelector("a:not(.current)");
    if (!destination) return;
    navigateLanguage(destination.href).catch(() => {
      window.location.assign(destination.href);
    });
  });
  switcher.addEventListener("pointerenter", () => preloadLanguageDestination(switcher), {
    once: true,
  });
  switcher.addEventListener("focusin", () => preloadLanguageDestination(switcher), {
    once: true,
  });
}

if (header && translatedPaths.has(pagePath)) {
  const headerInner = header.querySelector(".header-inner");
  const existingDesktopSwitch = headerInner?.querySelector(":scope > .language-switch");
  const hamburgerButton = headerInner?.querySelector(".hamburger");
  if (headerInner && hamburgerButton && !existingDesktopSwitch) {
    headerInner.insertBefore(createLanguageSwitch(), hamburgerButton);
  }

  const mobileMenu = header.querySelector(".hamburger-menu");
  if (mobileMenu && !mobileMenu.querySelector(".language-switch-mobile")) {
    mobileMenu.append(createLanguageSwitch(true));
  }
}

if (header && !header.querySelector(".theme-toggle")) {
  const headerInner = header.querySelector(".header-inner");
  const hamburgerButton = headerInner?.querySelector(".hamburger");
  if (headerInner) {
    headerInner.insertBefore(createThemeToggle(), hamburgerButton || null);
  }
}

document.querySelectorAll(".language-switch").forEach(enableLanguageToggle);

const hamburger = document.querySelector(".hamburger");
const menu = document.querySelector(".hamburger-menu");
const closeMenu = document.querySelector(".close-menu");
function getMenuLabels() {
  return isEnglishPage
    ? { menu: "Mobile navigation", open: "Open navigation", close: "Close navigation" }
    : { menu: "モバイルナビゲーション", open: "ナビゲーションを開く", close: "ナビゲーションを閉じる" };
}

let menuLabels = getMenuLabels();
let menuReturnFocus;

function updateMenuLabels() {
  menuLabels = getMenuLabels();
  if (menu) menu.setAttribute("aria-label", menuLabels.menu);
  if (hamburger) {
    const open = menu?.classList.contains("active") || false;
    hamburger.setAttribute("aria-label", open ? menuLabels.close : menuLabels.open);
  }
  closeMenu?.setAttribute("aria-label", menuLabels.close);
}

if (hamburger && menu) {
  const menuId = menu.id || "mobile-navigation";

  menu.id = menuId;
  menu.setAttribute("aria-label", menu.getAttribute("aria-label") || menuLabels.menu);
  menu.setAttribute("aria-hidden", "true");
  hamburger.setAttribute("type", "button");
  hamburger.setAttribute("aria-label", hamburger.getAttribute("aria-label") || menuLabels.open);
  hamburger.setAttribute("aria-controls", menuId);
  hamburger.setAttribute("aria-expanded", "false");
}

if (closeMenu) {
  closeMenu.setAttribute("type", "button");
  closeMenu.setAttribute("aria-label", closeMenu.getAttribute("aria-label") || menuLabels.close);
}

function updateRouteState() {
  document.querySelectorAll(".pc-nav > a, .hamburger-menu > a").forEach((link) => {
    const rawLinkPath = normalizePath(new URL(link.href, window.location.href).pathname);
    const linkPath = rawLinkPath.replace(/^\/en(?=\/|$)/, "") || "/";
    const isHome = linkPath === "/" && pagePath === "/";
    const section = linkPath.split("/").filter(Boolean)[0];
    const isSection = Boolean(section && pagePath.startsWith(`/${section}/`));
    const isCurrent = isHome || isSection;

    link.classList.toggle("current", isCurrent);
    if (isCurrent) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

updateRouteState();

function setMenu(open, restoreFocus = true) {
  if (!hamburger || !menu) return;

  const wasOpen = menu.classList.contains("active");
  menu.classList.toggle("active", open);
  hamburger.setAttribute("aria-expanded", String(open));
  hamburger.setAttribute("aria-label", open ? menuLabels.close : menuLabels.open);
  menu.setAttribute("aria-hidden", String(!open));
  document.body.classList.toggle("menu-open", open);

  if (open) {
    menuReturnFocus = document.activeElement;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => closeMenu?.focus());
    });
  } else if (wasOpen && restoreFocus) {
    (menuReturnFocus instanceof HTMLElement ? menuReturnFocus : hamburger).focus();
  }
}

if (hamburger && menu) {
  hamburger.addEventListener("click", () => {
    setMenu(!menu.classList.contains("active"));
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenu(false, false));
  });

  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !menu.classList.contains("active")) return;

    const focusable = [...menu.querySelectorAll("a, button")].filter(
      (element) => !element.hasAttribute("disabled"),
    );
    const first = focusable[0];
    const last = focusable.at(-1);

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
}

closeMenu?.addEventListener("click", () => setMenu(false));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});

if (header) {
  const updateHeader = () => {
    header.classList.toggle("scrolled", window.scrollY > 20);
  };

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
}

const mobileWidth = window.matchMedia("(max-width: 768px)");
const mobileUserAgent = /Android|iPhone|iPod/i.test(navigator.userAgent);
const copyResetTimers = new WeakMap();
const useMobileEmailApp = () =>
  mobileWidth.matches || window.screen.width <= 768 || mobileUserAgent;

function updateMobileEmailLink() {
  const mobileEmailLink = document.querySelector("[data-mobile-mailto]");
  const label = mobileEmailLink?.querySelector(".email-compose-label");
  if (!mobileEmailLink || !label) return;

  label.textContent = isEnglishPage
    ? useMobileEmailApp()
      ? "Compose in your email app"
      : "Compose in Gmail"
    : useMobileEmailApp()
      ? "メールアプリで作成"
      : "Gmailでメールを作成";
  mobileEmailLink.setAttribute(
    "aria-label",
    isEnglishPage
      ? useMobileEmailApp()
        ? "Compose an email to seiyaro0704@gmail.com in your email app"
        : "Open Gmail in a new tab and compose an email to seiyaro0704@gmail.com"
      : useMobileEmailApp()
        ? "メールアプリで seiyaro0704@gmail.com 宛てのメールを作成"
        : "Gmailを別タブで開き、seiyaro0704@gmail.com 宛てのメールを作成",
  );
}

updateMobileEmailLink();
mobileWidth.addEventListener?.("change", updateMobileEmailLink);

document.addEventListener("click", async (event) => {
  const mobileEmailLink = event.target.closest?.("[data-mobile-mailto]");
  if (mobileEmailLink && useMobileEmailApp()) {
    event.preventDefault();
    window.location.href = mobileEmailLink.dataset.mobileMailto;
    return;
  }

  const emailCopyButton = event.target.closest?.("[data-copy-email]");
  if (!emailCopyButton) return;

  const email = emailCopyButton.dataset.copyEmail;
  const label = emailCopyButton.querySelector(".email-copy-label");
  if (!email || !label) return;
  const defaultLabel = label.textContent.trim();

  try {
    await navigator.clipboard.writeText(email);
    label.textContent = isEnglishPage ? "Copied" : "コピーしました";
    emailCopyButton.classList.add("is-copied");

    window.clearTimeout(copyResetTimers.get(emailCopyButton));
    copyResetTimers.set(
      emailCopyButton,
      window.setTimeout(() => {
        label.textContent = defaultLabel;
        emailCopyButton.classList.remove("is-copied");
      }, 700),
    );
  } catch {
    window.prompt(
      isEnglishPage ? "Copy this email address" : "メールアドレスをコピーしてください",
      email,
    );
  }
});

const initialHistoryState = { ...(window.history.state || {}), languageSwap: true };
window.history.replaceState(initialHistoryState, "", window.location.href);
window.addEventListener("popstate", (event) => {
  if (!event.state?.languageSwap) return;
  navigateLanguage(window.location.href, { historyMode: "none" }).catch(() => {
    window.location.reload();
  });
});

const scheduleLanguagePreload = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 1));
scheduleLanguagePreload(() => {
  document.querySelectorAll(".language-switch").forEach(preloadLanguageDestination);
});
