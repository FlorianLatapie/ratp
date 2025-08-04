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

async function getOrCreateLocalStorage() {
    if (localStorage.getItem("userData") === null || true) {
        let userData = {}

        // example line
        const lines = await getLines();
        const myLine = lines.find(line => line.mode === "Metro" && line.shortName === "3");

        // example station 
        const myLineStations = await getStations(myLine.externalCode);
        const myStation = myLineStations.find(station => station.name === "Parmentier");

        userData = [{
            line: myLine,
            monitoredStations: [myStation]
        }];

        localStorage.setItem("userData", JSON.stringify(userData));
    }
    return JSON.parse(localStorage.getItem("userData"));
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

async function main() {
    // setup
    API_KEY = await getApikey();

    let userData = await getOrCreateLocalStorage();

    // display all disruptions for all lines of the user
    document.getElementById("disruptions").innerHTML = "";
    userData.forEach(async (data) => {
        // console log disruptions for the line
        const disruptions = await getDisruptionsByLine(data.line.externalCode);
        disruptions.forEach(disruption => {
            console.log(`Disruption on line ${data.line.shortName}: ${disruption.message}`);
        });
        document.getElementById("disruptions").innerHTML += `<h3>Disruptions de la ligne ${data.line.shortName}</h3>`
        disruptions.forEach(disruption => {
            document.getElementById("disruptions").innerHTML += `<p>${disruption.message}</p>`;
        });
    });

    // default example
    /*
    const nextTrainsAtMyStation = await getNextTrains(myLine.externalCode, myStation.id);
    console.log("Prochains trains :", nextTrainsAtMyStation);

    const myLineDisruptions = await getDisruptionsByLine(myLine.externalCode);
    console.log("Perturbations de la ligne 3:", myLineDisruptions[0].message);

    const myLineDisruptions8 = await getDisruptionsByLine("line:IDFM:C01378");
    console.log("Perturbations de la ligne 8:", myLineDisruptions8);
    */
}

main()