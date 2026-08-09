import { getDistanceInMeters } from "./mymath.js";
import { getLocation, formatTimeRemaining, logAppend, logSet, getTextForLineSummary } from "./tooling.js";
import { getStationsAndLinesFromLocation, getDisruptions, getNextTrains} from "./ratp.js";
import { launchFallbackMap } from "./map.js";

function populateDisruptions(disruptions) {
    const disruptionsContainer = document.getElementById("disruptions");
    
    // Sauvegarder l'état des details ouverts
    const openStates = new Map();
    disruptionsContainer.querySelectorAll("details").forEach(details => {
        const summary = details.querySelector("summary");
        if (summary) {
            openStates.set(summary.textContent, details.open);
        }
    });
    
    disruptionsContainer.replaceChildren(); // Clear previous content

    if (!disruptions || disruptions.disruptedLines.length === 0) {
        disruptionsContainer.replaceChildren(); // Clear previous content
        return;
    }

    const perturbationsSummary = document.createElement("summary");
    perturbationsSummary.className = "h2-summary";
    perturbationsSummary.textContent = "Perturbations";
    disruptionsContainer.appendChild(perturbationsSummary);
    
    const perturbationsDetails = document.createElement("details");
    perturbationsDetails.appendChild(perturbationsSummary);
    disruptionsContainer.appendChild(perturbationsDetails);
    
    // Restaurer l'état du details principal "Perturbations"
    const wasMainOpen = openStates.get("Perturbations");
    if (wasMainOpen !== undefined) {
        perturbationsDetails.open = wasMainOpen;
    } else {
        perturbationsDetails.setAttribute("open", "true");
    }


    disruptions.disruptedLines.forEach(disruptedLine => {
        const line = disruptedLine.line;

        // Bloc repliable pour chaque ligne
        const details = document.createElement("details");

        const summary = document.createElement("summary");
        summary.className = `perturbed-line-header ligne-${line.shortName}`;

        summary.textContent = getTextForLineSummary(line.shortName);
        details.appendChild(summary);

        const lineDiv = document.createElement("div");
        lineDiv.className = `disruption-paragraph`;
        disruptedLine.messages.forEach(message => {
            lineDiv.innerHTML += `${message.message}`;
        });

        details.appendChild(lineDiv);
        
        // Restaurer l'état ouvert/fermé de ce details
        const wasOpen = openStates.get(summary.textContent);
        if (wasOpen) {
            details.open = true;
        }
        
        perturbationsDetails.appendChild(details);
    });
}

function populateStations(stations, lat, lon) {
    const stationsContainer = document.getElementById("nextArrivalsContainer");
    
    // Sauvegarder l'état des details ouverts
    const openStates = new Map();
    stationsContainer.querySelectorAll("details").forEach(details => {
        const summary = details.querySelector("summary");
        if (summary) {
            // Créer une clé unique basée sur le nom de la station et de la ligne
            const stationTitle = details.closest('.station')?.querySelector('.station-name')?.textContent || '';
            // Ne garder que le nom de station sans la distance (ex: "Station X - 120m" => "Station X")
            const baseStationName = stationTitle.split(' - ')[0].trim();
            const key = `${baseStationName}|${summary.textContent}`;
            openStates.set(key, details.open);
        }
    });
    
    stationsContainer.innerHTML = "<h2>Stations proches</h2>"; // Clear previous content

    stations.forEach(station => {
        const stationDiv = document.createElement("div");
        stationDiv.className = "station";
        const stationDistance = getDistanceInMeters(station.coordinates[1], station.coordinates[0], lat, lon);

        stationDiv.innerHTML = `<h3 class="station-name">${station.name} - ${Math.round(stationDistance)}m</h3>`;
        stationsContainer.appendChild(stationDiv);

        const linesList = document.createElement("div");

        station.lines.forEach(line => {
            // Bloc repliable pour chaque ligne
            const lineItem = document.createElement("details");
            const lineSummary = document.createElement("summary");
            lineSummary.className = `ligne-${line.shortName} h4-summary`;
            lineSummary.textContent = getTextForLineSummary(line.shortName);

            lineItem.appendChild(lineSummary);
            linesList.appendChild(lineItem);
            
            // Restaurer l'état ouvert/fermé de ce details
            const key = `${station.name}|${lineSummary.textContent}`;
            if (openStates.get(key)) {
                lineItem.open = true;
            }

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
                                //remainingTimeText.textContent = `${parsedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                //trainTimeText.textContent = " (théorique)";
                                remainingTimeText.textContent = "(théorique)";
                                trainTimeText.textContent = `à ${parsedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
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
    const updateLiveUI = () => {
        const now = Date.now();
        const clock = document.getElementById("clock");
        clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

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
    };

    updateLiveUI();
    setInterval(updateLiveUI, 1000);
}

async function refreshData(lat, lon, refreshInterval) {
    logAppend("Rafraîchissement des données...");
    const { stations, lines } = await getStationsAndLinesFromLocation(lat, lon, launchFallbackMap);
    const disruptions = await getDisruptions(lines);
    populateDisruptions(disruptions);
    populateStations(stations, lat, lon);
    logSet(`Dernier rafraîchissement à ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })},<br/>Rafraîchissement toutes les ${refreshInterval / 1000}s`);
}


async function main() {
    startLiveCountdownUpdater();

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

    logSet(`Dernier rafraîchissement à ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })},<br/>Rafraîchissement toutes les ${refreshInterval / 1000}s`);
    const footer = document.querySelector("footer");
    footer.style.display = "block";

    setInterval(() => {
        refreshData(lat, lon, refreshInterval);
    }, refreshInterval);
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('ServiceWorker registered:', reg))
            .catch(err => console.error('ServiceWorker registration failed:', err));
    });
}

main();
