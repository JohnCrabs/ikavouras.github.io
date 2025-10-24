document.addEventListener("DOMContentLoaded", () => {
    fetch("src/html/profile.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("main-content").innerHTML = data;
        })
        .catch(error => console.error("Error loading footer:", error));
});