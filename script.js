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

async function getLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by this browser.");
            return reject(new Error("Geolocation is not supported by this browser."));
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve(position);
            },
            (error) => {
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        alert("You have blocked location access. Please enable it in your browser settings.");
                        break;
                    case error.POSITION_UNAVAILABLE:
                        alert("Location information is unavailable.");
                        break;
                    case error.TIMEOUT:
                        alert("The request to get your location timed out.");
                        break;
                    case error.UNKNOWN_ERROR:
                    default:
                        alert("An unknown error occurred while trying to fetch your location.");
                        break;
                }

                reject(error);
            },
            {
                enableHighAccuracy: false, // should be faster on Android
                timeout: 1000, // 1 second timeout
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
    const modifyX = 0.0055;
    const modifyY = 0.004;
    const bbox = `BBOX(geometry,${lon - modifyX},${lat - modifyY},${lon + modifyX},${lat + modifyY},'EPSG:4326')`;

    const url = `https://api-iv.iledefrance-mobilites.fr/map/server/services/wms?service=WFS&request=GetFeature&srsName=EPSG:4326&outputFormat=application/json&typeNames=vianavigo:stations&cql_filter=commercialMode IN ('commercial_mode:Metro','commercial_mode:Tramway','commercial_mode:RailShuttle') AND ${bbox}`;

    const [stationsResponse, allLines] = await Promise.all([
        fetch(url, { headers: { "Apikey": API_KEY } }),
        getLines()
    ]);

    const data = await stationsResponse.json();
    const linesMap = new Map(allLines.map(line => [line.externalCode, line.shortName]));
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

    const output = {
        stations: Array.from(nearbyStationsMap.values()).sort((a, b) => {
            const distA = getDistance(lat, lon, a.coordinates[1], a.coordinates[0]);
            const distB = getDistance(lat, lon, b.coordinates[1], b.coordinates[0]);
            return distA - distB;
        }),
        lines: Array.from(nearbyLinesMap.values()).sort((a, b) => a.externalCode.localeCompare(b.externalCode))
    };
    return output;
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
    const requestOptions = {
        headers: {
            "Apikey": API_KEY,
            "Host": "api-iv.iledefrance-mobilites.fr",
        }
    };
    const response = await fetch("https://api-iv.iledefrance-mobilites.fr/lines?mode=Metro%3BTramway%3BRapidTransit%3BregionalRail%3BLocalTrain%3BRailShuttle%3BFunicular", requestOptions);
    const data = await response.json();
    return data;
}

async function getStations(lineId) {
    const requestOptions = {
        headers: {
            "Apikey": API_KEY,
            "Host": "api-iv.iledefrance-mobilites.fr",
        }
    };
    const response = await fetch(`https://api-iv.iledefrance-mobilites.fr/lines/v2/${lineId}/stops`, requestOptions);
    const data = await response.json();
    return data.sort((a, b) => a.name.localeCompare(b.name));
}

async function getDisruptions(lines) {
    const requestOptions = {
        headers: {
            "Apikey": API_KEY,
            "Host": "api-iv.iledefrance-mobilites.fr",
        }
    };

    const response = await fetch("https://api-iv.iledefrance-mobilites.fr/disruptions/v2", requestOptions);
    const data = await response.json();

    let output = {
        linesOK: [],
        disruptedLines: []
    }

    lines.forEach(line => {
        const linesImpacted = data.lines.find(disruption => disruption.id == line.externalCode);
        if (!linesImpacted) {
            output.linesOK.push({ line: line });
            return;
        }
        const disruptionsIds = linesImpacted.impactedObjects.flatMap(did => did.disruptionIds);
        const disruptionMessages = data.disruptions.filter(disruption => disruptionsIds.includes(disruption.id));

        const now = new Date();

        // filter out messages that are not relevant now
        const relevantDisruptionMessages = disruptionMessages.filter(message => {
            return message.applicationPeriods.some(period => {
                const begin = YYYYMMDDTHHMMSStoDate(period.begin);
                if (begin > now) {
                    return false; // not started yet
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


// todo set realtime info in each train object not in the function return
async function getNextTrains(lineId, stationId) {
    const requestOptions = {
        headers: {
            "Apikey": API_KEY,
            "Host": "api-iv.iledefrance-mobilites.fr",
        }
    };
    const response = await fetch(`https://api-iv.iledefrance-mobilites.fr/lines/v2/${lineId}/stops/${stationId}/realTime`, requestOptions);
    const data = await response.json();
    let allDepartures = data.nextDepartures.data;


    // if (data.nextDepartures.statusCode != "200" && data.nextDepartures.errorMessage == "NO_REALTIME_SCHEDULES_FOUND") {
    if (allDepartures.length < 5) {
        const numberOfItems = 4; // default value
        const fallbackResponse = await fetch(`https://api-iv.iledefrance-mobilites.fr/lines/${lineId}/stop_areas/${stationId}/schedules/v2?items_per_schedule=${numberOfItems}&from_datetime=${new Date().toISOString()}`, requestOptions);
        const fallbackData = await fallbackResponse.json();

        fallbackData.forEach(direction => {
            direction.dateTime.forEach(info => {
                allDepartures.push({
                    expectedArrivalTime: YYYYMMDDTHHMMSStoDate(info.dateTime).toISOString(),
                    lineDirection: direction.route.direction.name
                });
            });
        });
        return { nextTrainsAtMyStation: allDepartures, realtime: false };
    }

    return { nextTrainsAtMyStation: allDepartures, realtime: true };
}

function populateDisruptions(disruptions) {
    const disruptionsContainer = document.getElementById("disruptions");
    disruptionsContainer.innerHTML = "<h2>Perturbations</h2>"; // Clear previous content
    /*if (disruptions.linesOK.length > 0) {
        disruptionsContainer.innerHTML += `<p>Pas de perturbations pour le moment pour les lignes : ${disruptions.linesOK.map(line => line.line.shortName).join(", ")}</p>`;
    }*/
    disruptions.disruptedLines.forEach(disruptedLine => {
        const line = disruptedLine.line;
        disruptionsContainer.innerHTML += `<h3 class="ligne-${line.shortName}">Ligne ${line.shortName}</h3>`;
        disruptedLine.messages.forEach(message => {
            disruptionsContainer.innerHTML += `<p>${message.message}</p>`;
        });
    });
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
            getNextTrains(line.externalCode, station.id).then(({ nextTrainsAtMyStation, realtime }) => {
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

                        const timeUntilNextTrain = Date.parse(train.expectedArrivalTime) - Date.now();
                        const minutes = Math.floor(timeUntilNextTrain / 60000);
                        const seconds = Math.floor((timeUntilNextTrain % 60000) / 1000);
                        if (minutes < 0) {
                            trainItem.textContent = "À l'approche";
                        } else {
                            if (realtime) {
                                trainItem.textContent = `${minutes} min ${seconds} sec`;
                            } else {
                                // trainItem.textContent = train.expectedArrivalTime
                                trainItem.textContent = `${new Date(train.expectedArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (théorique)`;
                            }
                        }
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


async function main() {
    // setup
    API_KEY = await getApikey();
    let loadinfo = document.getElementById("loadinfo");
    loadinfo.innerHTML = "Clé d'API chargée, récupération de la position...";

    let { coords: { latitude: lat, longitude: lon } } = await getLocation();
    // const {lat, lon}  = {lat:48.8677097, lon:2.3639890};
    loadinfo.innerHTML = "Position récupérée, récupération des stations proches...";

    let { stations, lines } = await getStationsAndLinesFromLocation(lat, lon);

    loadinfo.innerHTML = "Stations proches récupérées, récupération des perturbations...";

    // Display stations
    const disruptions = await getDisruptions(lines);

    loadinfo.innerHTML = "Perturbations récupérées, affichage des perturbations...";

    populateDisruptions(disruptions);

    loadinfo.innerHTML = "Perturbations affichées, affichage des stations proches...";

    populateStations(stations);

    loadinfo.innerHTML = `Dernier rafraîchissement : ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

    const footer = document.querySelector("footer");
    footer.style.display = "block";
}

main()
