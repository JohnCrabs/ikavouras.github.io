document.addEventListener("DOMContentLoaded", () => {
    fetch("./pages/header/header.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("header-placeholder").innerHTML = data;
        })
        .catch(error => console.error("Error loading footer:", error));
});