import { convertLambertToWGS84 } from './lambertII.js';

let API_KEY = "";

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
    const allDepatures = data.nextDepartures.data;
    return allDepatures;
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



async function main() {
    // setup
    API_KEY = await getApikey();
    console.log("API Key:", API_KEY);

    // user pick
    const lines = await getLines();
    console.log("Lignes:", lines);
    const myLine = lines.find(line => line.mode === "Metro" && line.shortName === "3");
    console.log("Code ligne 3:", myLine.externalCode);

    const myLineStations = await getStations(myLine.externalCode);
    console.log("Stations de la ligne 3:", myLineStations);

    const myStation = myLineStations.find(station => station.name === "Parmentier");
    console.log("Station:", myStation);

    // maybe not useful
    console.log(`Station Lambert II coordinates: ${myStation.x}, ${myStation.y}`);
    const { lat, lon } = convertLambertToWGS84(myStation.x, myStation.y);
    console.log(`Converted Latitude,Longitude: ${lat},${lon}`);

    // default example
    const nextTrainsAtMyStation = await getNextTrains(myLine.externalCode, myStation.id);
    console.log("Prochains trains :", nextTrainsAtMyStation);

    const myLineDisruptions = await getDisruptionsByLine(myLine.externalCode);
    console.log("Perturbations de la ligne 3:", myLineDisruptions[0].message);

    const myLineDisruptions8 = await getDisruptionsByLine("line:IDFM:C01378");
    console.log("Perturbations de la ligne 8:", myLineDisruptions8);
}

main()