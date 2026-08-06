// ======================================================
// Portfolio Website
// Language Switch
// ======================================================

console.log("Portfolio Loaded");

// ボタン取得
const jaButton = document.getElementById("ja-btn");
const enButton = document.getElementById("en-btn");

// 表示言語切替
function switchLanguage(language) {

    const jaElements = document.querySelectorAll(".lang-ja");
    const enElements = document.querySelectorAll(".lang-en");

    if (language === "ja") {

        jaElements.forEach(element => {
            element.style.display = "";
        });

        enElements.forEach(element => {
            element.style.display = "none";
        });

        document.documentElement.lang = "ja";

        localStorage.setItem("language", "ja");

        jaButton.classList.add("active");
        enButton.classList.remove("active");

    } else {

        jaElements.forEach(element => {
            element.style.display = "none";
        });

        enElements.forEach(element => {
            element.style.display = "";
        });

        document.documentElement.lang = "en";

        localStorage.setItem("language", "en");

        jaButton.classList.remove("active");
        enButton.classList.add("active");

    }

}

// ボタンイベント
jaButton.addEventListener("click", () => {

    switchLanguage("ja");

});

enButton.addEventListener("click", () => {

    switchLanguage("en");

});

// 初回読み込み
const savedLanguage = localStorage.getItem("language");

if (savedLanguage === "en") {

    switchLanguage("en");

} else {

    switchLanguage("ja");

}