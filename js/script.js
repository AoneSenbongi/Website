const header = document.querySelector(".header");
const hamburger = document.querySelector(".hamburger");
const menu = document.querySelector(".hamburger-menu");
const closeMenu = document.querySelector(".close-menu");

function setMenu(open) {
  if (!hamburger || !menu) return;

  menu.classList.toggle("active", open);
  hamburger.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("menu-open", open);
}

if (hamburger && menu) {
  hamburger.addEventListener("click", () => {
    setMenu(!menu.classList.contains("active"));
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
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

const emailComposeLink = document.querySelector("[data-email-compose]");

if (emailComposeLink) {
  emailComposeLink.addEventListener("click", () => {
    let emailAppOpened = false;
    const gmailUrl = emailComposeLink.dataset.gmailFallback;
    const markEmailAppOpened = () => {
      emailAppOpened = true;
    };
    const markHidden = () => {
      if (document.hidden) markEmailAppOpened();
    };

    window.addEventListener("blur", markEmailAppOpened, { once: true });
    window.addEventListener("pagehide", markEmailAppOpened, { once: true });
    document.addEventListener("visibilitychange", markHidden);

    window.setTimeout(() => {
      window.removeEventListener("blur", markEmailAppOpened);
      window.removeEventListener("pagehide", markEmailAppOpened);
      document.removeEventListener("visibilitychange", markHidden);

      if (!emailAppOpened && !document.hidden) {
        window.open(gmailUrl, "_blank", "noopener,noreferrer");
      }
    }, 1200);
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
      }, 2000);
    } catch {
      window.prompt("メールアドレスをコピーしてください", email);
    }
  });
});
