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

async function getStationsFromLocation() {
    // mock data
    let userData = {}

    // example line
    const lines = await getLines();
    const myLine = lines.find(line => line.mode === "Metro" && line.shortName === "3");
    const mySecondLine = lines.find(line => line.mode === "Metro" && line.shortName === "8");
    // example station 
    const myLineStations = await getStations(myLine.externalCode);
    const myStation = myLineStations.find(station => station.name === "Parmentier");
    const mySecondLineStations = await getStations(mySecondLine.externalCode);
    const mySecondStation = mySecondLineStations.find(station => station.name === "Filles du Calvaire");

    userData = [
        {
            line: mySecondLine,
            monitoredStations: [mySecondStation]
        }, {
            line: myLine,
            monitoredStations: [myStation]
        },
    ];

    // sort UserData by line shortName
    userData.sort((a, b) => a.line.shortName.localeCompare(b.line.shortName));
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
            //"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0"
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
            //"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0"
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
            //"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0"
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
            //"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0"
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

    if (linesWithoutDisruptions.length > 0) {
        document.getElementById("disruptions").innerHTML += `<h2>Pas de perturbations pour le moment pour les lignes : ${linesWithoutDisruptions.map(line => line.shortName).join(", ")}</h2>`;
    }

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
                        if (!arrivalsByLineAndDirection[lineName][direction]) {
                            arrivalsByLineAndDirection[lineName][direction] = [];
                        }

                        arrivalsByLineAndDirection[lineName][direction].push({
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
        const lineTitle = document.createElement("h2");
        lineTitle.textContent = `Ligne ${lineName}`;
        lineDiv.appendChild(lineTitle);

        const directions = arrivalsByLineAndDirection[lineName];
        Object.keys(directions).forEach((direction) => {
            const directionDiv = document.createElement("div");
            const directionTitle = document.createElement("h3");
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

            lineDiv.appendChild(directionDiv);
        });

        container.appendChild(lineDiv);
    });
}

main()
