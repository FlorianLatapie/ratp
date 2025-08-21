function loadLeaflet() {
    return new Promise((resolve, reject) => {
        // If Leaflet already loaded, skip
        if (window.L) return resolve();

        // Load CSS
        const leafletCSS = document.createElement('link');
        leafletCSS.rel = 'stylesheet';
        leafletCSS.href = 'https://unpkg.com/leaflet/dist/leaflet.css';
        document.head.appendChild(leafletCSS);

        // Load JS
        const leafletScript = document.createElement('script');
        leafletScript.src = 'https://unpkg.com/leaflet/dist/leaflet.js';
        leafletScript.onload = () => resolve();
        leafletScript.onerror = reject;
        document.head.appendChild(leafletScript);
    });
}

export async function launchFallbackMap() {
    await loadLeaflet();

    let chosenCoords = { lat: 48.8566, lng: 2.3522 }; // default coords

    const fallbackMapContainer = document.createElement('div');
    fallbackMapContainer.id = "fallbackMapContainer";

    const titleItem = document.createElement('h2');
    titleItem.textContent = "Choisissez une position";
    fallbackMapContainer.appendChild(titleItem);

    const mapDiv = document.createElement('div');
    mapDiv.id = "map";
    mapDiv.style.height = "400px";
    fallbackMapContainer.appendChild(mapDiv);

    const acceptButton = document.createElement('button');
    acceptButton.id = "acceptMapButton";
    acceptButton.textContent = "Valider";
    fallbackMapContainer.appendChild(acceptButton);

    document.body.appendChild(fallbackMapContainer);

    const map = L.map('map').setView([chosenCoords.lat, chosenCoords.lng], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '',
        subdomains: 'abcd'
    }).addTo(map);

    let marker = L.marker([chosenCoords.lat, chosenCoords.lng]).addTo(map);

    map.on('click', function (e) {
        chosenCoords = {
            lat: parseFloat(e.latlng.lat.toFixed(6)),
            lng: parseFloat(e.latlng.lng.toFixed(6))
        };

        if (marker) {
            marker.setLatLng(e.latlng);
        } else {
            marker = L.marker(e.latlng).addTo(map);
        }
    });

    // Return a promise that resolves when user clicks "Accepter"
    return new Promise((resolve) => {
        acceptButton.onclick = function () {
            document.body.removeChild(fallbackMapContainer);
            resolve({ coords: { latitude: chosenCoords.lat, longitude: chosenCoords.lng } });
        };
    });
}