import { getDistanceInMeters } from "./mymath.js";
import { getLocation, formatTimeRemaining, logAppend, logSet } from "./tooling.js";
import { getStationsAndLinesFromLocation, getDisruptions, getNextTrains} from "./ratp.js";
import { launchFallbackMap } from "./map.js";

function populateDisruptions(disruptions) {
    const disruptionsContainer = document.getElementById("disruptions");
    disruptionsContainer.replaceChildren(); // Clear previous content

    if (!disruptions || disruptions.disruptedLines.length === 0) {
        disruptionsContainer.replaceChildren(); // Clear previous content
        return;
    }

    const title = document.createElement("h2");
    title.textContent = "Perturbations";
    disruptionsContainer.appendChild(title);

    disruptions.disruptedLines.forEach(disruptedLine => {
        const line = disruptedLine.line;

        const lineTitle = document.createElement("h4");
        lineTitle.className = `ligne-${line.shortName}`;
        lineTitle.textContent = `Ligne ${line.shortName}`;
        disruptionsContainer.appendChild(lineTitle);

        const lineDiv = document.createElement("div");
        lineDiv.className = `disruption-paragraph`;
        disruptedLine.messages.forEach(message => {
            lineDiv.innerHTML += `${message.message}`;
        });
        disruptionsContainer.appendChild(lineDiv);
    });
}

function populateStations(stations, lat, lon) {
    const stationsContainer = document.getElementById("nextArrivalsContainer");
    stationsContainer.innerHTML = "<h2>Stations proches</h2>"; // Clear previous content

    stations.forEach(station => {
        const stationDiv = document.createElement("div");
        stationDiv.className = "station";
        const stationDistance = getDistanceInMeters(station.coordinates[1], station.coordinates[0], lat, lon);

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
                if (!nextTrainsAtMyStation || nextTrainsAtMyStation.length === 0) {
                    const noTrainsMessage = document.createElement("p");
                    noTrainsMessage.textContent = "Aucune information disponible";
                    directionsContainer.appendChild(noTrainsMessage);
                    return;
                }
                const directionsMap = {};

                // Grouper les trains par terminus (direction)
                nextTrainsAtMyStation.forEach(train => {
                    if (!directionsMap[train.lineDirection]) {
                        directionsMap[train.lineDirection] = [];
                    }
                    directionsMap[train.lineDirection].push(train);
                });

                // sort directionsMap by train.lineDirection alphabetically
                const sortedDirections = Object.keys(directionsMap).sort((a, b) => a.localeCompare(b));

                // Pour chaque terminus, créer un sous-titre et une liste des trains
                sortedDirections.forEach(direction => {
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

async function refreshData(lat, lon, refreshInterval) {
    logAppend("Rafraîchissement des données...");
    const { stations, lines } = await getStationsAndLinesFromLocation(lat, lon, launchFallbackMap);
    const disruptions = await getDisruptions(lines);
    populateDisruptions(disruptions);
    populateStations(stations, lat, lon);
    logSet(`Dernier rafraîchissement : ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}\nRafraîchissement toutes les ${refreshInterval / 1000} secondes`);
}


async function main() {
    let clock = document.getElementById("clock");
    clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setInterval(() => {
        clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);
    logSet("Récupération de la position...");

    let { coords: { latitude: lat, longitude: lon } } = await getLocation(launchFallbackMap);

    logAppend("Récupération des stations proches...");

    let { stations, lines, coords:newCoords } = await getStationsAndLinesFromLocation(lat, lon, launchFallbackMap);

    let lastRefreshDate = new Date();

    logAppend("Récupération des perturbations...");

    // Display stations
    const disruptions = await getDisruptions(lines);

    logAppend("Récupération des perturbations...");

    populateDisruptions(disruptions);

    logAppend("Affichage des stations proches...");

    if (newCoords) {
        lat = newCoords.latitude;
        lon = newCoords.longitude;
    }

    populateStations(stations, lat, lon);

    let refreshInterval = 30_000; // 30 seconds

    logSet(`Dernier rafraîchissement : ${lastRefreshDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}\nRafraîchissement toutes les ${refreshInterval / 1000} secondes`);

    startLiveCountdownUpdater();

    setInterval(() => {
        refreshData(lat, lon, refreshInterval);
    }, refreshInterval);
}

main();
