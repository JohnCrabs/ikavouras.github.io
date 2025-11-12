async function copyToClipboard(given_id){
    selector = '#' + given_id
    const element = document.querySelector(selector);
    if (!element) {
        console.error(`Element not found: ${selector}`);
        return;
    }

    const html = element.innerHTML;

    try {
        await navigator.clipboard.writeText(html);
        alert("Text successfully copied!");
    } catch (err) {
        console.error("Failed to copy:", err);
    }
}

