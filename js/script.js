const header = document.querySelector(".header");
const isEnglishPage = document.documentElement.lang === "en";
const normalizedPath = window.location.pathname
  .replace(/\/index\.html$/, "/")
  .replace(/\.html$/, "");
const pagePath = isEnglishPage
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

const hamburger = document.querySelector(".hamburger");
const menu = document.querySelector(".hamburger-menu");
const closeMenu = document.querySelector(".close-menu");
const menuLabels = isEnglishPage
  ? { menu: "Mobile navigation", open: "Open navigation", close: "Close navigation" }
  : { menu: "モバイルナビゲーション", open: "ナビゲーションを開く", close: "ナビゲーションを閉じる" };
let menuReturnFocus;

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

document.querySelectorAll(".pc-nav > a, .hamburger-menu > a").forEach((link) => {
  const rawLinkPath = new URL(link.href, window.location.href).pathname
    .replace(/\/index\.html$/, "/")
    .replace(/\.html$/, "");
  const linkPath = rawLinkPath.replace(/^\/en(?=\/|$)/, "") || "/";
  const isHome = linkPath === "/" && pagePath === "/";
  const section = linkPath.split("/").filter(Boolean)[0];
  const isSection = Boolean(
    section && pagePath.startsWith(`/${section}/`),
  );
  const isCurrent = isHome || isSection;

  link.classList.toggle("current", isCurrent);
  if (isCurrent) {
    link.setAttribute("aria-current", "page");
  } else {
    link.removeAttribute("aria-current");
  }
});

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

const mobileEmailLink = document.querySelector("[data-mobile-mailto]");

if (mobileEmailLink) {
  const mobileWidth = window.matchMedia("(max-width: 768px)");
  const mobileUserAgent = /Android|iPhone|iPod/i.test(navigator.userAgent);
  const label = mobileEmailLink.querySelector(".email-compose-label");
  const useMobileEmailApp = () =>
    mobileWidth.matches || window.screen.width <= 768 || mobileUserAgent;

  const updateEmailLinkLabel = () => {
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
  };

  updateEmailLinkLabel();
  if (mobileWidth.addEventListener) {
    mobileWidth.addEventListener("change", updateEmailLinkLabel);
  }

  mobileEmailLink.addEventListener("click", (event) => {
    if (useMobileEmailApp()) {
      event.preventDefault();
      window.location.href = mobileEmailLink.dataset.mobileMailto;
    }
  });
}

document.querySelectorAll("[data-copy-email]").forEach((emailCopyButton) => {
  let resetCopyLabel;
  const label = emailCopyButton.querySelector(".email-copy-label");
  const defaultLabel = label.textContent.trim();

  emailCopyButton.addEventListener("click", async () => {
    const email = emailCopyButton.dataset.copyEmail;

    try {
      await navigator.clipboard.writeText(email);
      label.textContent = isEnglishPage ? "Copied" : "コピーしました";
      emailCopyButton.classList.add("is-copied");

      window.clearTimeout(resetCopyLabel);
      resetCopyLabel = window.setTimeout(() => {
        label.textContent = defaultLabel;
        emailCopyButton.classList.remove("is-copied");
      }, 700);
    } catch {
      window.prompt(
        isEnglishPage ? "Copy this email address" : "メールアドレスをコピーしてください",
        email,
      );
    }
  });
});
