document.addEventListener("DOMContentLoaded", () => {
    fetch("./pages/main/home.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("main-content").innerHTML = data;
        })
        .catch(error => console.error("Error loading footer:", error));
});