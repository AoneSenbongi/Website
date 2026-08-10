// =====================================================
// Portfolio Website
// Seiya Yamachika
// =====================================================

window.addEventListener("scroll", () => {
  const header = document.querySelector("header");

  if (window.scrollY > 20) {
    header.style.boxShadow = "0 4px 20px rgba(0,0,0,.08)";
  } else {
    header.style.boxShadow = "none";
  }
});

const hamburger = document.querySelector(".hamburger");
const menu = document.querySelector(".hamburger-menu");
const closeMenu = document.querySelector(".close-menu");

if (hamburger && menu) {
  hamburger.addEventListener("click", () => {
    menu.classList.toggle("active");
  });
}

if (closeMenu && menu) {
  closeMenu.addEventListener("click", () => {
    menu.classList.remove("active");
  });
}

const header = document.querySelector(".header");

window.addEventListener("scroll", () => {
  if (window.scrollY > 50) {
    header.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
  }
});

window.addEventListener("scroll", () => {
  const construction = document.querySelector(".construction");

  if (window.scrollY > 50) {
    construction.style.display = "none";
  } else {
    construction.style.display = "block";
  }
});

window.addEventListener("scroll", () => {
  const header = document.querySelector("header");

  if (window.scrollY > 50) {
    header.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
  }
});

window.addEventListener("scroll", () => {
  const construction = document.querySelector(".construction");

  if (window.scrollY > 50) {
    construction.style.height = "0";
    construction.style.padding = "0";
  } else {
    construction.style.height = "60px";
    construction.style.padding = "14px 20px";
  }
});
