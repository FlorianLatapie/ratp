let API_KEY = "";

// setup shit

async function getApikey() {
    // const response = await fetch("https://me-deplacer.iledefrance-mobilites.fr/api/env");
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
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        } else {
            reject(new Error("Geolocation is not supported by this browser."));
        }
    });
}


async function getStationsFromLocation() {
    const location = await getLocation();
    const lat = location.coords.latitude;
    const lon = location.coords.longitude;

    const requestOptions = {
        headers: {
            "Apikey": API_KEY,
        }
    };

    const modifyX = 0.0055;
    const modifyY = 0.004;
    const xMin = lon - modifyX;
    const xMax = lon + modifyX;
    const yMin = lat - modifyY;
    const yMax = lat + modifyY;

    const BBOX = `BBOX(geometry,${xMin},${yMin},${xMax},${yMax},'EPSG:4326')`;
    const response = await fetch(`https://api-iv.iledefrance-mobilites.fr/map/server/services/wms?service=WFS&request=GetFeature&srsName=EPSG:4326&outputFormat=application/json&typeNames=vianavigo:stations&cql_filter=commercialMode IN ('commercial_mode:Metro','commercial_mode:Tramway','commercial_mode:RailShuttle') AND ${BBOX}`, requestOptions);
    const data = await response.json();

    const allLines = await getLines();

    let userData = [];
    data.features.forEach(station => {
        const lineExternalCode = station.properties.lineId;
        const lineShortName = allLines.find(line => line.externalCode === lineExternalCode).shortName;

        // Check if this line already exists in userData
        const existingLineIndex = userData.findIndex(item => item.line.externalCode === lineExternalCode);

        if (existingLineIndex !== -1) {
            // Line exists, check if station already exists in monitoredStations array
            const stationId = station.properties.stopAreaId;
            const stationExists = userData[existingLineIndex].monitoredStations.some(
                existingStation => existingStation.id === stationId
            );

            // Only add if the station doesn't already exist
            if (!stationExists) {
                userData[existingLineIndex].monitoredStations.push({
                    id: stationId,
                    name: station.properties.name,
                });
            }
        } else {
            // Line doesn't exist, create new entry
            userData.push({
                line: {
                    shortName: lineShortName,
                    externalCode: lineExternalCode,
                },
                monitoredStations: [{
                    id: station.properties.stopAreaId,
                    name: station.properties.name,
                }]
            });
        }
    });
    return userData;
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
    // const response = await fetch(`https://corsproxy.io/?url=https://api-iv.iledefrance-mobilites.fr/lines/v2/${lineId}/stops`, requestOptions);
    const data = await response.json();
    return data.sort((a, b) => a.name.localeCompare(b.name));
}

async function getDisruptions() {
    const requestOptions = {
        headers: {
            "Apikey": API_KEY,
            "Host": "api-iv.iledefrance-mobilites.fr",
        }
    };

    const response = await fetch("https://api-iv.iledefrance-mobilites.fr/disruptions/v2", requestOptions);
    const data = await response.json();
    return data;
}

async function getDisruptionsByLine(lineId) {
    const disruptions = await getDisruptions();
    const disruptedInfos = disruptions.lines.filter(disruption => disruption.id === lineId)

    const disruptionsIds = disruptedInfos.flatMap(info => info.impactedObjects.flatMap(did => did.disruptionIds));

    // Get the disruptions details for the collected IDs
    return disruptions.disruptions.filter(disruption => disruptionsIds.includes(disruption.id));
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
    // const response = await fetch(`https://corsproxy.io/?url=https://api-iv.iledefrance-mobilites.fr/lines/v2/${lineId}/stops/${stationId}/realTime`, requestOptions);
    const data = await response.json();
    let allDepartures = data.nextDepartures.data;


    if (data.nextDepartures.statusCode != "200" && data.nextDepartures.errorMessage == "NO_REALTIME_SCHEDULES_FOUND") {
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

async function main() {
    // setup
    API_KEY = await getApikey();

    let userData = await getStationsFromLocation();

    // Display disruptions
    document.getElementById("disruptions").innerHTML = "";

    let linesWithoutDisruptions = [];
    await Promise.all(
        userData.map(async (data) => { // forEach line but returns so the "Promise.all" is happy
            const disruptions = await getDisruptionsByLine(data.line.externalCode);

            if (disruptions.length === 0) {
                linesWithoutDisruptions.push(data.line);
                return;
            }

            const validDisruptions = disruptions.filter(disruption => {
                const isNow = disruption.applicationPeriods.some(period =>
                    YYYYMMDDTHHMMSStoDate(period.begin) <= new Date()
                );
                // available disruption.cause values : "INFORMATION", "TRAVAUX", "PERTURBATION"
                return isNow && disruption.cause !== "INFORMATION";
            });


            let html = '';

            if (validDisruptions.length > 0) {
                html += `<h3>Perturbations de la ligne ${data.line.shortName}</h3>`;
                validDisruptions.forEach(disruption => {
                    html += `<p>${disruption.message}</p>`;
                });
            } else {
                linesWithoutDisruptions.push(data.line);
            }

            document.getElementById("disruptions").innerHTML += html;
        })
    );
/* 
    if (linesWithoutDisruptions.length > 0) {
        document.getElementById("disruptions").innerHTML += `<h2>Pas de perturbations pour le moment pour les lignes : ${linesWithoutDisruptions.map(line => line.shortName).join(", ")}</h2>`;
    } */

    // Display next arrivals


    const container = document.getElementById("nextArrivalsContainer");
    container.innerHTML = "";

    const arrivalsByLineAndDirection = {}; // { lineShortName: { direction: [times] } }

    await Promise.all(
        userData.map(async (data) => {
            await Promise.all(
                data.monitoredStations.map(async (station) => {
                    const { nextTrainsAtMyStation, realtime } = await getNextTrains(data.line.externalCode, station.id);
                    nextTrainsAtMyStation.forEach((train) => {
                        const timeUntilNextTrain = Date.parse(train.expectedArrivalTime) - Date.now();
                        const minutes = Math.floor(timeUntilNextTrain / 60000);
                        const seconds = Math.floor((timeUntilNextTrain % 60000) / 1000);

                        const lineName = data.line.shortName;
                        const direction = train.lineDirection;

                        if (!arrivalsByLineAndDirection[lineName]) {
                            arrivalsByLineAndDirection[lineName] = {};
                        }
                        if (!arrivalsByLineAndDirection[lineName][station.name]) {
                            arrivalsByLineAndDirection[lineName][station.name] = {};
                        }
                        if (!arrivalsByLineAndDirection[lineName][station.name][direction]) {
                            arrivalsByLineAndDirection[lineName][station.name][direction] = [];
                        }

                        arrivalsByLineAndDirection[lineName][station.name][direction].push({
                            minutes: minutes,
                            seconds: seconds,
                            date: Date.parse(train.expectedArrivalTime),
                            realtime: realtime
                        });
                    });
                })
            );
        })
    );

    // Insert into DOM
    Object.keys(arrivalsByLineAndDirection).forEach((lineName) => {
        const lineDiv = document.createElement("div");
        lineDiv.className = "line";
        const lineTitle = document.createElement("h2");
        lineTitle.textContent = `Ligne ${lineName}`;
        lineDiv.appendChild(lineTitle);

        const stations = arrivalsByLineAndDirection[lineName];
        Object.keys(stations).forEach((stationName) => {
            const stationDiv = document.createElement("div");
            stationDiv.className = "station";
            const stationTitle = document.createElement("h3");
            stationTitle.textContent = `Station : ${stationName}`;
            stationDiv.appendChild(stationTitle);
            const directions = stations[stationName];

            Object.keys(directions).forEach((direction) => {
                const directionDiv = document.createElement("div");
                directionDiv.className = "direction";
                const directionTitle = document.createElement("h4");
                directionTitle.textContent = `Direction : ${direction}`;
                directionDiv.appendChild(directionTitle);
                directions[direction].forEach((timeObj) => {
                    const timeP = document.createElement("p");
                    if (timeObj.realtime) {
                        if (timeObj.minutes < 0) {
                            timeP.textContent = "À l'approche";
                        } else {
                            timeP.textContent = `${timeObj.minutes}m ${timeObj.seconds}s`;
                        }
                    } else {
                        timeP.textContent = `À ${new Date(timeObj.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (horaire théorique)`;
                    }
                    directionDiv.appendChild(timeP);
                });
                stationDiv.appendChild(directionDiv);
            });

            lineDiv.appendChild(stationDiv);
        });
        container.appendChild(lineDiv);
    });
}

main()