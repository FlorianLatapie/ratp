export async function getLocation(fallbackFunction) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            return reject(new Error("Geolocation is not supported by this browser."));
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve(position);
            },
            (error) => {
                if (fallbackFunction) {
                    resolve(fallbackFunction());
                }
                reject(error);
            },
            {
                enableHighAccuracy: false, // should be faster on Android
            }
        );
    });
}

export function YYYYMMDDTHHMMSStoDate(dateString) {
    // Convert YYYYMMDDTHHTMMSS to a Date object
    const year = parseInt(dateString.slice(0, 4), 10);
    const month = parseInt(dateString.slice(4, 6), 10) - 1; // Months are zero-based
    const day = parseInt(dateString.slice(6, 8), 10);
    const hours = parseInt(dateString.slice(9, 11), 10);
    const minutes = parseInt(dateString.slice(11, 13), 10);
    const seconds = parseInt(dateString.slice(13, 15), 10);
    return new Date(year, month, day, hours, minutes, seconds);
}

export function formatTimeRemaining(ms){
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return { minutes, seconds };
}

export function logAppend(message) {
    document.getElementById("loadinfo").innerHTML += message + "<br/>";
    console.log(message);
}

export function logSet(message) {
    document.getElementById("loadinfo").innerHTML = message + "<br/>";
    console.log("cleared\n" + message);
}

export function getTextForLineSummary(shortName) {
    if (/^\d/.test(shortName)) {
        return `Métro ${shortName}`;
    } else {
        return `Ligne ${shortName}`;
    }
}