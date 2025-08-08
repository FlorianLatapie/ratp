let API_KEY = "";

// setup shit

async function getApikey() {
    const response = await fetch("https://corsproxy.io/?url=https://me-deplacer.iledefrance-mobilites.fr/api/env");

    const data = await response.json();
    const output = data["ivApiKey"];
    if (output != "vNcCf2jKkRtDywAcrARI2Mspn8OAXuFx") {
        console.warn("API Key is not the default one");
    }
    return output;
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


async function getLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            console.warn("Geolocation is not supported by this browser.");
            return reject(new Error("Geolocation is not supported by this browser."));
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve(position);
            },
            (error) => {
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        console.warn("You have blocked location access. Please enable it in your browser settings.");
                        break;
                    case error.POSITION_UNAVAILABLE:
                        console.warn("Location information is unavailable.");
                        break;
                    case error.TIMEOUT:
                        console.warn("The request to get your location timed out.");
                        break;
                    case error.UNKNOWN_ERROR:
                    default:
                        console.warn("An unknown error occurred while trying to fetch your location.");
                        break;
                }

                resolve(launchFallbackMap()); // Fallback to map selection
            },
            {
                enableHighAccuracy: false, // should be faster on Android
            }
        );
    });
}

const R_KM = 6371; // Earth's radius in kilometers (saves division)
const DEG_TO_RAD = Math.PI / 180; // Pre-calculated conversion factor

function getDistance(lat1, lon1, lat2, lon2) {
    // Convert to radians in one go
    const φ1 = lat1 * DEG_TO_RAD;
    const φ2 = lat2 * DEG_TO_RAD;
    const Δφ = (lat2 - lat1) * DEG_TO_RAD;
    const Δλ = (lon2 - lon1) * DEG_TO_RAD;

    // Calculate half-chord distances
    const sinΔφ2 = Math.sin(Δφ * 0.5);
    const sinΔλ2 = Math.sin(Δλ * 0.5);

    const a = sinΔφ2 * sinΔφ2 + Math.cos(φ1) * Math.cos(φ2) * sinΔλ2 * sinΔλ2;

    // Use 2 * asin instead of 2 * atan2 for better performance
    return R_KM * 2 * Math.asin(Math.sqrt(a));
}

async function getStationsAndLinesFromLocation(lat, lon) {
    let modifyX = 0.0055;
    let modifyY = 0.004;
    let data, linesMap;
    let iterations = 0;
    do {
        modifyX *= 1.5;
        modifyY *= 1.5;
        const bbox = `BBOX(geometry,${lon - modifyX},${lat - modifyY},${lon + modifyX},${lat + modifyY},'EPSG:4326')`;

        const url = `https://api-iv.iledefrance-mobilites.fr/map/server/services/wms?service=WFS&request=GetFeature&srsName=EPSG:4326&outputFormat=application/json&typeNames=vianavigo:stations&cql_filter=${bbox}`;

        const [stationsResponse, allLines] = await Promise.all([
            fetch(url, { headers: { "Apikey": API_KEY } }),
            getLines()
        ]);

        data = await stationsResponse.json();
        linesMap = new Map(allLines.map(line => [line.externalCode, line.shortName]));
        iterations++;
    } while (data.features.length === 0);
    const nearbyStationsMap = new Map();
    const nearbyLinesMap = new Map();

    data.features.forEach(station => {
        const { lineId, stopAreaId, name } = station.properties;
        const coordinates = station.geometry.coordinates;

        if (!nearbyStationsMap.has(stopAreaId)) {
            nearbyStationsMap.set(stopAreaId, {
                id: stopAreaId,
                name,
                coordinates,
                lines: []
            });
        }

        const stationData = nearbyStationsMap.get(stopAreaId);

        if (!stationData.lines.some(line => line.externalCode === lineId)) {
            stationData.lines.push({
                shortName: linesMap.get(lineId),
                externalCode: lineId
            });
        }

        if (!nearbyLinesMap.has(lineId)) {
            nearbyLinesMap.set(lineId, {
                shortName: linesMap.get(lineId),
                externalCode: lineId,
            });
        }
    });

    return {
        stations: Array.from(nearbyStationsMap.values()).sort((a, b) => {
            const distA = getDistance(lat, lon, a.coordinates[1], a.coordinates[0]);
            const distB = getDistance(lat, lon, b.coordinates[1], b.coordinates[0]);
            return distA - distB;
        }),
        lines: Array.from(nearbyLinesMap.values()).sort((a, b) => a.externalCode.localeCompare(b.externalCode))
    };
}

// tooling

function YYYYMMDDTHHMMSStoDate(dateString) {
    // Convert YYYYMMDDTHHTMMSS to a Date object
    const year = parseInt(dateString.slice(0, 4), 10);
    const month = parseInt(dateString.slice(4, 6), 10) - 1; // Months are zero-based
    const day = parseInt(dateString.slice(6, 8), 10);
    const hours = parseInt(dateString.slice(9, 11), 10);
    const minutes = parseInt(dateString.slice(11, 13), 10);
    const seconds = parseInt(dateString.slice(13, 15), 10);
    return new Date(year, month, day, hours, minutes, seconds);
}

// real time data

async function getLines() {
    const response = await fetch("https://api-iv.iledefrance-mobilites.fr/lines?mode=Metro%3BTramway%3BRapidTransit%3BregionalRail%3BLocalTrain%3BRailShuttle%3BFunicular", {
        headers: { "Apikey": API_KEY, "Host": "api-iv.iledefrance-mobilites.fr" }
    });
    return await response.json();
}

async function getDisruptions(lines) {
    const response = await fetch("https://api-iv.iledefrance-mobilites.fr/disruptions/v2", {
        headers: { "Apikey": API_KEY, "Host": "api-iv.iledefrance-mobilites.fr" }
    });
    const data = await response.json();

    let output = { linesOK: [], disruptedLines: [] };

    lines.forEach(line => {
        const linesImpacted = data.lines.find(disruption => disruption.id == line.externalCode);
        if (!linesImpacted) {
            output.linesOK.push({ line: line });
            return;
        }
        if (linesImpacted.mode == "RapidTransit") {
            return; // ignore RER lines messages
        }

        const disruptionsIds = linesImpacted.impactedObjects.flatMap(did => did.disruptionIds);
        const disruptionMessages = data.disruptions.filter(disruption => disruptionsIds.includes(disruption.id));

        const now = new Date();

        // filter out messages that are not relevant now
        const relevantDisruptionMessages = disruptionMessages.filter(message => {
            return message.applicationPeriods.some(period => {
                const begin = YYYYMMDDTHHMMSStoDate(period.begin);
                if (begin > now) {
                    return false;
                }

                // available disruption.cause values : "INFORMATION", "TRAVAUX", "PERTURBATION"
                if (message.cause === "INFORMATION") {
                    return false; // ignore information messages
                }


                return true;
            });
        });

        if (relevantDisruptionMessages.length === 0) {
            output.linesOK.push({ line: line });
            return;
        }

        output.disruptedLines.push({
            line: line,
            messages: relevantDisruptionMessages
        });
    });
    return output;
}

async function getNextTrains(lineId, stationId) {
    const requestOptions = {
        headers: { "Apikey": API_KEY, "Host": "api-iv.iledefrance-mobilites.fr" }
    };
    const response = await fetch(`https://api-iv.iledefrance-mobilites.fr/lines/v2/${lineId}/stops/${stationId}/realTime`, requestOptions);
    const data = await response.json();
    let allDepartures = data.nextDepartures.data.map(dep => ({ ...dep, realtime: true }));

    if (allDepartures.length < 5) {
        const numberOfItems = 4;
        const fallbackResponse = await fetch(`https://api-iv.iledefrance-mobilites.fr/lines/${lineId}/stop_areas/${stationId}/schedules/v2?items_per_schedule=${numberOfItems}&from_datetime=${new Date().toISOString()}`, requestOptions);
        const fallbackData = await fallbackResponse.json();

        fallbackData.forEach(direction => {
            direction.dateTime.forEach(info => {
                allDepartures.push({
                    expectedArrivalTime: YYYYMMDDTHHMMSStoDate(info.dateTime).toISOString(),
                    lineDirection: direction.route.direction.name.split("(")[0].trim(),
                    realtime: false
                });
            });
        });
    }
    return { nextTrainsAtMyStation: allDepartures };
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

function populateStations(stations) {
    const stationsContainer = document.getElementById("nextArrivalsContainer");
    stationsContainer.innerHTML = "<h2>Stations proches</h2>"; // Clear previous content

    stations.forEach(station => {
        const stationDiv = document.createElement("div");
        stationDiv.className = "station";
        stationDiv.innerHTML = `<h3 class="station-name">${station.name}</h3>`;
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
                        trainItem.dataset.arrivalTime = new Date(train.expectedArrivalTime).getTime();

                        const remainingTimeText = document.createElement("span");
                        const trainTimeText = document.createElement("span");


                        const parsedTime = new Date(train.expectedArrivalTime);
                        const timeUntilNextTrain = parsedTime - Date.now();
                        const minutes = Math.floor(timeUntilNextTrain / 60000);
                        const seconds = Math.floor((timeUntilNextTrain % 60000) / 1000);

                        if (minutes < 0) {
                            remainingTimeText.textContent = `En station`;
                            trainTimeText.textContent = `(depuis ${parsedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`;
                            trainItem.classList.add("arrived");
                        } else {
                            if (train.realtime) {
                                remainingTimeText.textContent = `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
                                trainTimeText.textContent = `(à ${parsedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`;
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
            const minutes = Math.floor(timeUntilArrival / 60000);
            const seconds = Math.floor((timeUntilArrival % 60000) / 1000);

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
    let loadinfo = document.getElementById("loadinfo");

    loadinfo.innerHTML = "Récupération de la clé API...";
    API_KEY = await getApikey();

    loadinfo.innerHTML = "Récupération de la position...";

    let { coords: { latitude: lat, longitude: lon } } = await getLocation();
    //const {lat, lon} = { lat: 48.861670, lon: 2.347886 };

    loadinfo.innerHTML = "Récupération des stations proches...";

    let { stations, lines } = await getStationsAndLinesFromLocation(lat, lon);

    loadinfo.innerHTML = "Récupération des perturbations...";

    // Display stations
    const disruptions = await getDisruptions(lines);

    loadinfo.innerHTML = "Récupération des perturbations...";

    populateDisruptions(disruptions);

    loadinfo.innerHTML = "Affichage des stations proches...";

    populateStations(stations);

    loadinfo.innerHTML = `Dernier rafraîchissement :<br/>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

    startLiveCountdownUpdater();
}

main();
