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


hamburger.addEventListener("click",()=>{

    menu.classList.toggle("active");

});