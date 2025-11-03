const MAIN_BODY = "mainBody";

function loadContent(path){
    fetch(path)
        .then(response => response.text())
        .then(data => {
            document.getElementById(MAIN_BODY).innerHTML = data;
        })
        .catch(error => console.error("Error loading content:", error));
}

function changeTitle(){
    document.getElementById("headTitle").innerHTML = document.getElementById("textArea").value;
}

function