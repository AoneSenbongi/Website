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
