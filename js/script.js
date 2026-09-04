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

const emailCopyButton = document.querySelector("[data-copy-email]");

if (emailCopyButton) {
  let resetCopyLabel;

  emailCopyButton.addEventListener("click", async () => {
    const email = emailCopyButton.dataset.copyEmail;
    const label = emailCopyButton.querySelector(".email-copy-label");

    try {
      await navigator.clipboard.writeText(email);
      label.textContent = "コピーしました";
      emailCopyButton.classList.add("is-copied");

      window.clearTimeout(resetCopyLabel);
      resetCopyLabel = window.setTimeout(() => {
        label.textContent = "Email（クリックでコピー）";
        emailCopyButton.classList.remove("is-copied");
      }, 2000);
    } catch {
      window.prompt("メールアドレスをコピーしてください", email);
    }
  });
}
