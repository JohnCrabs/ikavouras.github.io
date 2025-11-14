/*
init.js
Initialize the page on load.
*/

"strict mode";

/* MAIN COMPONENTS */
const HEADER = document.getElementById("header");
const FOOTER = document.getElementById("footer");
const MAIN_CONTENT = document.getElementById("main-content");
const BODY = document.getElementById("body");


/* STYLE FLAGS */
const STYLE_HIGHLIGHT = "highlight-selected";


/* PATH INFO */
const NAV_PATHS = {
    "profile": "src/html/navs/profile.html",
    "projects": "src/html/navs/projects.html",
    "collaborations": "src/html/navs/collaborations.html",
    "skills": "src/html/navs/skills.html",
    "publications": "src/html/navs/publications.html",
    "certificates": "src/html/navs/certificates.html",
    "demo": "src/html/navs/demo.html",
    "contact": "src/html/navs/contact.html"
};

const JSON_PATHS = {
    "header": "src/json/header.json",
    "profile": "src/json/profile.json",
    "projects": "src/json/projects.json",
    "collaborations": "src/json/collaborations.json",
    "skills": "src/json/skills.json",
    "publications": "src/json/publications.json",
    "certificates": "src/json/certificates.json",
    "demo": "src/json/demo.json",
    "contact": "src/json/contact.json",
    "section_titles": "src/json/section_titles.json"
};

const CITATION_HTML = "src/html/common/citations.html";
const CERTIFICATES_DIR = "assets/certificates/";

/* UTILITY VARIABLES */
let LANG_PREF = "en";


function setHeaderNav(id){
    const navItem = document.getElementById(`${id}-nav`);
    if (navItem){
        fetch(JSON_PATHS["header"])
        .then(response => response.json())
        .then(data => {
            navItem.innerHTML = data[LANG_PREF][id] || data["en"][id] || navItem.innerHTML;
        });
    }
}

function loadHeader() {
    fetch("src/html/common/header.html")
        .then(response => response.text())
        .then(html => {
            HEADER.innerHTML = html;
            setHeaderNav("profile");
            setHeaderNav("projects");
            setHeaderNav("collaborations");
            setHeaderNav("skills");
            setHeaderNav("publications");
            setHeaderNav("certificates");
            setHeaderNav("demo");
            setHeaderNav("contact");
        })
        .catch(error => {
            console.error("Error loading header:", error);
            HEADER.innerHTML = "<p>Error loading header. Please try again later.</p>";
        });
}

function loadFooter() {
     fetch("src/html/common/footer.html")
        .then(response => response.text())
        .then(html => {
            FOOTER.innerHTML = html;
        })
        .catch(error => {
            console.error("Error loading footer:", error);
            FOOTER.innerHTML = "<p>Error loading footer. Please try again later.</p>";
        });
}

function setSectionTitle(curr_section){
    fetch(JSON_PATHS["section_titles"])
        .then(response => response.json())
        .then(data => {
            const secTitle = document.getElementById("section-title");
            if (secTitle) {
                secTitle.innerHTML = data[curr_section][LANG_PREF] || data[curr_section]["en"] || secTitle.innerHTML;
            }
        });
}

function loadProfile() {
    fetch(JSON_PATHS["profile"])
        .then(response => response.json())
        .then(data => {
            // setSectionTitle("profile")
            const mainContainer = document.getElementById("profile-container");
            mainContainer.innerHTML = ""
            let counter = 0;
            data = data[LANG_PREF] || data["en"];
            for (const key in data) {
             	const d_item = data[key];
                const divBlock = document.createElement("div");
                divBlock.classList.add("profile-item");
                
                if (counter%2 == 0){
                    divBlock.innerHTML = `
                        <img src=${d_item["photo"]} alt="Profile Picture" class="profile-photo">
                        <div class="text-justify profile-description">
                        <h2>${d_item["name"]}</h2>
                        <h3>${d_item["position"]}</h3>
                        <p>${d_item["description"]}</p>
                        </div>
                        `;
                } else {
                    divBlock.innerHTML = `
                        <div class="text-justify profile-description">
                        <h2 style="text-align: right;">${d_item["name"]}</h2>
                        <h3 style="text-align: right;">${d_item["position"]}</h3>
                        <p>${d_item["description"]}</p>
                        </div>
                        <img src=${d_item["photo"]} alt="Profile Picture" class="profile-photo">
                        `;
                }
                ++counter;

                mainContainer.appendChild(divBlock);
            }
        });
}

function loadProjects() {
    fetch(JSON_PATHS["projects"])
        .then(response => response.json())
        .then(data => {
            setSectionTitle("projects")
            const mainContainer = document.getElementById("projects-container");
            mainContainer.innerHTML = ""
            for (const key in data) {
             	const d_item = data[key];
                const divBlock = document.createElement("div");
                divBlock.classList.add("project-item");
                divBlock.innerHTML = `
                <img src="${d_item["logo"]}" alt="${key}-logo" class="project-image"/>
                <a href="${d_item["link"]}" target="_blank" class="project-title">${d_item["name"]}</a>
                <a href="${d_item["cordis"]}" target="_blank" class="project-link">[eu-cordis]</a>
                `;

                mainContainer.appendChild(divBlock);
            }
        });
}

function loadCollaborations() {
    fetch(JSON_PATHS["collaborations"])
        .then(response => response.json())
        .then(data => {
            setSectionTitle("collaborations")
            const mainContainer = document.getElementById("collaborations-container");
            mainContainer.innerHTML = ""
            for (const key in data) {
             	const d_item = data[key];
                const divBlock = document.createElement("div");
                divBlock.classList.add("collaborations-item");
                
                const d_name = d_item["name"][LANG_PREF] || d_item["name"]["en"] || d_item["name"];
                const d_logo = d_item["logo"][LANG_PREF] || d_item["logo"]["en"] || d_item["logo"];
                const d_link = d_item["link"][LANG_PREF] || d_item["link"]["en"] || d_item["link"];
                
                divBlock.innerHTML = `
                    <img src="${d_logo}" alt="${key}-logo" class="collaborations-image"/>
                    <a href="${d_link}" target="_blank" class="collaborations-title">${d_name}</a>
                `;

                mainContainer.appendChild(divBlock);
            }
        });
}

function loadSkills() {
    fetch(JSON_PATHS["skills"])
        .then(response => response.json())
        .then(data => {
            setSectionTitle("skills")
            const mainContainer = document.getElementById("skills-container");
            mainContainer.innerHTML = ""
            for (const key in data) {
             	const d_item = data[key];
                const divBlock = document.createElement("div");
                divBlock.classList.add("skills-item");
                
                const d_title = d_item["title"][LANG_PREF] || d_item["title"]["en"] || d_item["title"];
                let newHTML = `<h2>${d_title}</h2>`
                
                newHTML = newHTML + `\n<ul>`
                const d_skills = d_item["skills"][LANG_PREF] || d_item["skills"]["en"] || d_item["skills"];
                for (const sk in d_skills) {
                    newHTML = newHTML + `\n<li>${d_skills[sk]}</div>`
                }
                newHTML = newHTML + `\n</ul>`

                divBlock.innerHTML = newHTML;
                mainContainer.appendChild(divBlock);
            }
        });
}

function openCitation(d_key){
    fetch(JSON_PATHS["publications"])
    .then(response => response.json())
    .then(data => {
        const windowFeatures = "left=100,top=100,width=512,height=480";
        const handle = window.open(CITATION_HTML, "Citations", windowFeatures);

        handle.onload = () => {
            const textCitations = handle.document.getElementById("textCitation");
            const bibCitations = handle.document.getElementById("bibCitation");

            textCitations.innerHTML = data[d_key]["citation"];
            bibCitations.innerHTML = data[d_key]["bibtex"];
        };
    });
}

function loadPublications() {
    fetch(JSON_PATHS["publications"])
        .then(response => response.json())
        .then(data => {
            setSectionTitle("publications")
            const mainContainer = document.getElementById("publications-container");
            mainContainer.innerHTML = ""
            for (const key in data) {
             	const d_item = data[key];
                const divBlock = document.createElement("div");
                cmdExecute = `openCitation(${key})`
                
                divBlock.classList.add("publications-item");
                
                divBlock.innerHTML = `
                <h2>${d_item["title"]}</h2>
                <p><strong>Authors: </strong>${d_item["authors"]}</p>
                <p><strong>Year:</strong> ${d_item["year"]}</p>
                <div>
                    <a class="btn-style" href="${d_item["source"]}" target="_blank" rel="noopener noreferrer">View Source</a>
                    <a class="btn-style tertiary" href="${d_item["pdf"]}" target="_blank" rel="noopener noreferrer" onClick="">Open PDF</a>
                    <button class="btn-style secondary" onClick="${cmdExecute}">Citations</button>
                </div>
                `;
                mainContainer.appendChild(divBlock);
            }
        });
}

function loadCertificates() {
    fetch(JSON_PATHS["certificates"])
        .then(response => response.json())
        .then(data => {
            setSectionTitle("certificates")
            const mainContainer = document.getElementById("certificates-container");
            mainContainer.innerHTML = ""
            for (const key in data) {
             	const d_item = data[key];
                const crt_path = CERTIFICATES_DIR + key + "/"
                
                const divBlock = document.createElement("div");
                divBlock.classList.add("certificate-item");
                
                const h2_name = d_item["name"][LANG_PREF] || d_item["name"]["en"] || d_item["name"];

                let newHTML = `<h2>${h2_name}</h2>\n`;
                let divEntry = `<div class="certificate-grid">`;

                for (const f in d_item["certificates"]) {
                    const f_name = d_item["certificates"][f];
                    const c_path = crt_path + d_item["certificates"][f];
                    divEntry = divEntry + `
                    <div class="certificate-card">
                        <div class="certificate-preview">
                            <iframe src="${c_path}" type="application/pdf"></iframe>
                        </div>
                        <div class="certificate-info">
                            <a href="${c_path}" target="_blank" rel="noopener noreferrer">${f_name}</a>
                        </div>
                    </div>
                    `
                }

                divEntry = divEntry +"\n<div>";
                newHTML = newHTML + divEntry;

                divBlock.innerHTML = newHTML;

                mainContainer.appendChild(divBlock);
            }
        });
}

function loadDemo() {
    fetch(JSON_PATHS["demo"])
        .then(response => response.json())
        .then(data => {
            setSectionTitle("demo")
            const mainContainer = document.getElementById("demo-container");
            mainContainer.innerHTML = ""
            data = data[LANG_PREF] || data["en"] || data;
            for (const key in data) {
             	const d_item = data[key];
                const divBlock = document.createElement("div");
                divBlock.classList.add("demo-item");
                let newHTML = `
                    <h2>${d_item["title"][LANG_PREF] || d_item["title"]["en"] || d_item["title"]}</h2>\n
                    <p>${d_item["description"][LANG_PREF] || d_item["description"]["en"] || d_item["description"]}</p>\n
                `;
                let divEntry = `<div>`;
                for (const l in d_item["links"]) {
                    d_link = d_item["links"][l];
                    divEntry = divEntry + `\n<a href="${d_link['url']}" class="btn-style" target="_blank" rel="noopener noreferrer">${d_link['label'][LANG_PREF] || d_link['label']["en"] || d_link['label']}</a>`;
                }
                divEntry = divEntry + `<div>`;
                newHTML = newHTML + divEntry;
                divBlock.innerHTML = newHTML;
                mainContainer.appendChild(divBlock);
            }
        });
}

function genParsFromList(obj) {
    const category = obj["category"][LANG_PREF] || obj["category"]["en"] || obj["category"];
    const value = obj["value"][LANG_PREF] || obj["value"]["en"] || obj["value"];
    
    let o_text = "";
    for (const it in value) {
        if (value.length > 1) {
            l_num = Number(it) + 1;
            o_text = o_text + `\n<p><strong>${category} ${l_num}:</strong><br> ${value[it]}<p>`;
        } else {
            o_text = o_text + `\n<p><strong>${category}:</strong><br> ${value[it]}<p>`;
        }
    }
    return o_text;
}

function loadContact() {
    fetch(JSON_PATHS["contact"])
        .then(response => response.json())
        .then(data => {
            setSectionTitle("contact")
            const mainContainer = document.getElementById("contact-container");
            mainContainer.innerHTML = ""
            for (const key in data) {
             	const d_item = data[key];
                const divBlock = document.createElement("div");
                divBlock.classList.add("contact-item");
                let newHTML = `
                    <h2>${d_item["name"][LANG_PREF] || d_item["name"]["en"] || d_item["name"]}</h2>\n
                `;
                const addressEntry = genParsFromList(d_item["addresses"]);
                const phoneEntry = genParsFromList(d_item["phones"]);
                const mailEntry = genParsFromList(d_item["mails"]);
                
                newHTML = newHTML + addressEntry + phoneEntry + mailEntry
                
                divBlock.innerHTML = newHTML;
                mainContainer.appendChild(divBlock);
            }
        });
}

function loadContent(content) {
    const NAVS = document.getElementsByClassName("nav-link");
    // console.log("Loading content for:", content);
    fetch(NAV_PATHS[content])
        .then(response => response.text())
        .then(html => {
            MAIN_CONTENT.innerHTML = html;
            // Update active class on navigation links
            Array.from(NAVS).forEach(nav => {
                nav.classList.remove(STYLE_HIGHLIGHT);
            });

            try {
                const CURRENT_NAV = document.getElementById(content + "-nav");
                // console.log("Current Nav:", CURRENT_NAV);
                CURRENT_NAV.classList.add(STYLE_HIGHLIGHT);
            } catch (error) {
                setTimeout(() => {
                    const CURRENT_NAV = document.getElementById(content + "-nav");
                    // console.log("Current Nav (delayed):", CURRENT_NAV);
                    CURRENT_NAV.classList.add(STYLE_HIGHLIGHT);
                }, 1000);
            }

            if (content == "profile") {
                loadProfile();
            } else if (content === "projects") {
                loadProjects();
            } else if (content === "collaborations") {
                loadCollaborations();
            } else if (content === "skills") {
                loadSkills();
            } else if (content === "publications") {
                loadPublications();
            } else if (content === "certificates") {
                loadCertificates();
            } else if (content === "demo") {
                loadDemo();
            } else if (content === "contact") {
                loadContact();
            }
        })
        .catch(error => {
            console.error("Error loading content:", error);
            MAIN_CONTENT.innerHTML = "<p>Error loading content. Please try again later.</p>";
        });
}

function setLanguage(lang) {
    const lang_btns = document.getElementsByClassName("lang-button");
    const sel_lang_btns = document.getElementById(`lang-${lang}`);
        if (sel_lang_btns){
        for (const btn in lang_btns){
            if (lang_btns[btn].classList){
                lang_btns[btn].classList.remove(STYLE_HIGHLIGHT);
            }
        }
            
        sel_lang_btns.classList.add(STYLE_HIGHLIGHT);
        localStorage.setItem("lang", lang);
        if (lang != LANG_PREF){
            LANG_PREF = lang;
            loadHeader();
            loadFooter();
            refreshContent();
        }
    }
}

function refreshContent() {
    let hash = window.location.hash.substring(1);
    // console.log("URL Hash:", hash);
    if (hash && NAV_PATHS.hasOwnProperty(hash)) {
        loadContent(hash);
    } else {
        loadContent("profile");
        window.location.hash = "#profile";
    }
    LANG_PREF = localStorage.getItem("lang");
    setTimeout(() => {
        setLanguage(LANG_PREF);
    }, 50);
}

document.addEventListener("DOMContentLoaded", () => {
    // Load header and footer
    loadHeader();
    loadFooter();
    // Unhide body
    BODY.classList.remove("hidden");
    BODY.classList.add("unhidden");
    // Load default content
    refreshContent();
});

window.onhashchange = function() {
    refreshContent();
}

