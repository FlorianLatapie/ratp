import { getDistance } from "./mymath.js";
import { YYYYMMDDTHHMMSStoDate } from "./tooling.js";


let API_KEY = "vNcCf2jKkRtDywAcrARI2Mspn8OAXuFx";

export async function getApikey() {
    const response = await fetch("https://corsproxy.io/?url=https://me-deplacer.iledefrance-mobilites.fr/api/env");

    const data = await response.json();
    const fetchedApiKey = data["ivApiKey"];
    if (fetchedApiKey != API_KEY) {
        logAppend("API Key is not the default one");
    }
    return fetchedApiKey;
}

export async function getStationsAndLinesFromLocation(lat, lon, fallbackFunction) {
    let modifyX = 0.0055;
    let modifyY = 0.004;
    let data, linesMap;
    let iterations = 0;

    const allLines = await getLines();
    do {
        modifyX *= 1.5;
        modifyY *= 1.5;
        const bbox = `BBOX(geometry,${lon - modifyX},${lat - modifyY},${lon + modifyX},${lat + modifyY},'EPSG:4326')`;

        const url = `https://api-iv.iledefrance-mobilites.fr/map/server/services/wms?service=WFS&request=GetFeature&srsName=EPSG:4326&outputFormat=application/json&typeNames=vianavigo:stations&cql_filter=${bbox}`;

        const stationsResponse = await fetch(url, {
            headers: { "Apikey": API_KEY, "Host": "api-iv.iledefrance-mobilites.fr" }
        });

        data = await stationsResponse.json();
        linesMap = new Map(allLines.map(line => [line.externalCode, line.shortName]));
        iterations++;
        if (iterations > 3) {
            // launch fallback function that is passed, we do not check if it is defined because it is always defined and passed
            return fallbackFunction().then(({ coords: { latitude: lat, longitude: lon } }) => {
                return getStationsAndLinesFromLocation(lat, lon, fallbackFunction);
            });
        }
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
        lines: Array.from(nearbyLinesMap.values()).sort((a, b) => a.externalCode.localeCompare(b.externalCode)),
        coords: {
            latitude: lat,
            longitude: lon
        }
    };
}

export async function getLines() {
    const response = await fetch("https://api-iv.iledefrance-mobilites.fr/lines?mode=Metro%3BTramway%3BRapidTransit%3BregionalRail%3BLocalTrain%3BRailShuttle%3BFunicular", {
        headers: { "Apikey": API_KEY, "Host": "api-iv.iledefrance-mobilites.fr" }
    });
    return await response.json();
}

export async function getDisruptions(lines) {
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

export async function getNextTrains(lineId, stationId) {
    const requestOptions = {
        headers: { "Apikey": API_KEY, "Host": "api-iv.iledefrance-mobilites.fr" }
    };
    const response = await fetch(`https://api-iv.iledefrance-mobilites.fr/lines/v2/${lineId}/stops/${stationId}/realTime`, requestOptions);
    const data = await response.json();
    let allDepartures = data.nextDepartures.data.map(dep => ({ ...dep, realtime: true }));



    if (allDepartures.length < 4) {
        const numberOfItems = 4;
        const fallbackResponse = await fetch(`https://api-iv.iledefrance-mobilites.fr/lines/${lineId}/stop_areas/${stationId}/schedules/v2?items_per_schedule=${numberOfItems}&from_datetime=${new Date().toISOString()}`, requestOptions);
        const fallbackData = await fallbackResponse.json();

        fallbackData.forEach(direction => {
            direction.dateTime.forEach(info => {
                allDepartures.push({
                    expectedDepartureTime: YYYYMMDDTHHMMSStoDate(info.dateTime).toISOString(),
                    lineDirection: direction.route.direction.name.split("(")[0].trim(),
                    realtime: false
                });
            });
        });
    } else if (allDepartures.length > 10) {
        // limit at 4 departures per direction
        const directionsMap = {};
        allDepartures = allDepartures.filter(dep => {
            if (!directionsMap[dep.lineDirection]) {
                directionsMap[dep.lineDirection] = 0;
            }
            if (directionsMap[dep.lineDirection] < 3) {
                directionsMap[dep.lineDirection]++;
                return true;
            }
        });
    }
    return { nextTrainsAtMyStation: allDepartures };
}