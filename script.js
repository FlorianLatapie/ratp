import { getDistanceInMeters } from "./mymath.js";
import { getLocation, YYYYMMDDTHHMMSStoDate, formatTimeRemaining } from "./tooling.js";
import { getApikey, getStationsAndLinesFromLocation, getLines, getDisruptions, getNextTrains} from "./ratp.js";

// log function
function logAppend(message) {
    document.getElementById("loadinfo").innerHTML += message + "<br/>";
    console.log(message);
}

function logSet(message) {
    document.getElementById("loadinfo").innerHTML = message + "<br/>";
    console.log("cleared\n" + message);
}

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

async function launchFallbackMap() {
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
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
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

function populateDisruptions(disruptions) {
    const disruptionsContainer = document.getElementById("disruptions");
    disruptionsContainer.innerHTML = "<h2>Perturbations</h2>"; // Clear previous content
    /*if (disruptions.linesOK.length > 0) {
        disruptionsContainer.innerHTML += `<p>Pas de perturbations pour le moment pour les lignes : ${disruptions.linesOK.map(line => line.line.shortName).join(", ")}</p>`;
    }*/
    disruptions.disruptedLines.forEach(disruptedLine => {
        const line = disruptedLine.line;
        disruptionsContainer.innerHTML += `<h4 class="ligne-${line.shortName}">Ligne ${line.shortName}</h4>`;
        disruptedLine.messages.forEach(message => {
            disruptionsContainer.innerHTML += `<p>${message.message}</p>`;
        });
    });

    if (disruptions.disruptedLines.length === 0) {
        disruptionsContainer.innerHTML = ""
    }
}

function populateStations(stations, lat, lon) {
    const stationsContainer = document.getElementById("nextArrivalsContainer");
    stationsContainer.innerHTML = "<h2>Stations proches</h2>"; // Clear previous content

    stations.forEach(station => {
        const stationDiv = document.createElement("div");
        stationDiv.className = "station";
        const stationDistance = getDistanceInMeters(station.coordinates[1], station.coordinates[0], lat, lon);
        // stationDiv.innerHTML = `<h3 class="station-name">${station.name} - ${stationDistance}m</h3>`;
        // same but distance in m (do no display decimal places)
        stationDiv.innerHTML = `<h3 class="station-name">${station.name} - ${Math.round(stationDistance)}m</h3>`;
        stationsContainer.appendChild(stationDiv);

        const linesList = document.createElement("div");

        station.lines.forEach(line => {
            const lineItem = document.createElement("div");
            const lineTitle = document.createElement("h4");
            lineTitle.textContent = `Ligne ${line.shortName}`;
            lineTitle.className = `ligne-${line.shortName}`;
            lineItem.appendChild(lineTitle);
            linesList.appendChild(lineItem);

            // Conteneur pour séparer les terminus
            const directionsContainer = document.createElement("div");
            directionsContainer.className = "directions-container";
            lineItem.appendChild(directionsContainer);

            // fetch next arrivals for this line at this station
            getNextTrains(line.externalCode, station.id).then(({ nextTrainsAtMyStation }) => {
                const directionsMap = {};

                // Grouper les trains par terminus (direction)
                nextTrainsAtMyStation.forEach(train => {
                    if (!directionsMap[train.lineDirection]) {
                        directionsMap[train.lineDirection] = [];
                    }
                    directionsMap[train.lineDirection].push(train);
                });

                // sort directionsMap by train.lineDirection alphabetically
                Object.keys(directionsMap).sort().forEach(direction => {

                });

                // Pour chaque terminus, créer un sous-titre et une liste des trains
                Object.keys(directionsMap).forEach(direction => {
                    const directionDiv = document.createElement("div");
                    directionDiv.className = "direction-section";
                    directionDiv.innerHTML = `<h5>${direction}</h5>`;
                    const trainsList = document.createElement("ul");
                    trainsList.className = "trains-list";
                    directionsMap[direction].forEach(train => {
                        const trainItem = document.createElement("li");
                        trainItem.className = "train-item";
                        trainItem.dataset.arrivalTime = new Date(train.expectedDepartureTime).getTime();

                        const remainingTimeText = document.createElement("span");
                        const trainTimeText = document.createElement("span");


                        const parsedTime = new Date(train.expectedDepartureTime);
                        const timeUntilNextTrain = parsedTime - Date.now();
                        const { minutes, seconds } = formatTimeRemaining(timeUntilNextTrain);

                        if (minutes < 0) {
                            remainingTimeText.textContent = `En station`;
                            trainTimeText.textContent = `depuis ${parsedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                            trainItem.classList.add("arrived");
                        } else {
                            if (train.realtime) {
                                remainingTimeText.textContent = `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
                                trainTimeText.textContent = `à ${parsedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                            } else {
                                remainingTimeText.textContent = `${parsedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                trainTimeText.textContent = " (théorique)";
                                trainItem.classList.add("theoretical");
                            }
                        }
                        trainItem.appendChild(remainingTimeText);
                        trainItem.appendChild(trainTimeText);
                        trainsList.appendChild(trainItem);
                    });
                    directionDiv.appendChild(trainsList);
                    directionsContainer.appendChild(directionDiv);
                });
            });
        });

        stationDiv.appendChild(linesList);
    });
}

function startLiveCountdownUpdater() {
    setInterval(() => {
        const now = Date.now();
        const trainItems = document.querySelectorAll(".train-item");

        trainItems.forEach(trainItem => {
            const arrivalTime = parseInt(trainItem.dataset.arrivalTime);
            const timeUntilArrival = arrivalTime - now;
            const { minutes, seconds } = formatTimeRemaining(timeUntilArrival);

            const remainingTimeText = trainItem.querySelector("span:first-child");
            const trainTimeText = trainItem.querySelector("span:last-child");

            if (trainItem.textContent.includes("(théorique)")) return;

            if (timeUntilArrival < -60_000) {
                trainItem.remove();
            } else if (timeUntilArrival < 0) {
                remainingTimeText.textContent = `En station`;
                trainTimeText.textContent = `depuis ${new Date(arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                trainItem.classList.add("arrived");
            } else {
                remainingTimeText.textContent = `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
                trainTimeText.textContent = `à ${new Date(arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            }
        });
    }, 1000);
}

async function main() {
    // setup
    // loadinfo.innerHTML = "Récupération de la clé API...";

    logSet("Récupération de la position...");

    let { coords: { latitude: lat, longitude: lon } } = await getLocation(launchFallbackMap);
    //const {lat, lon} = { lat: 48.861670, lon: 2.347886 };

    logAppend("Récupération des stations proches...");

    let { stations, lines } = await getStationsAndLinesFromLocation(lat, lon, launchFallbackMap);

    logAppend("Récupération des perturbations...");

    // Display stations
    const disruptions = await getDisruptions(lines);

    logAppend("Récupération des perturbations...");

    populateDisruptions(disruptions);

    logAppend("Affichage des stations proches...");

    populateStations(stations, lat, lon);

    logSet(`Dernier rafraîchissement : ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);

    startLiveCountdownUpdater();
}

main();
