const header = document.querySelector(".header");
const hamburger = document.querySelector(".hamburger");
const menu = document.querySelector(".hamburger-menu");
const closeMenu = document.querySelector(".close-menu");
const isEnglishPage = document.documentElement.lang === "en";
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

const currentPath = window.location.pathname
  .replace(/\/index\.html$/, "/")
  .replace(/\.html$/, "");

document.querySelectorAll(".pc-nav a, .hamburger-menu a").forEach((link) => {
  const linkPath = new URL(link.href, window.location.href).pathname;
  const isHome =
    (linkPath === "/" && currentPath === "/") ||
    (linkPath === "/en/" && currentPath === "/en/");
  const section = linkPath.split("/").filter(Boolean)[0];
  const isSection =
    section &&
    section !== "en" &&
    currentPath.startsWith(`/${section}/`);
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
    label.textContent = useMobileEmailApp()
      ? "メールアプリで作成"
      : "Gmailでメールを作成";
    mobileEmailLink.setAttribute(
      "aria-label",
      useMobileEmailApp()
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
      label.textContent = "コピーしました";
      emailCopyButton.classList.add("is-copied");

      window.clearTimeout(resetCopyLabel);
      resetCopyLabel = window.setTimeout(() => {
        label.textContent = defaultLabel;
        emailCopyButton.classList.remove("is-copied");
      }, 700);
    } catch {
      window.prompt("メールアドレスをコピーしてください", email);
    }
  });
});
