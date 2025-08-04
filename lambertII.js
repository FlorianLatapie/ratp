proj4.defs("EPSG:27572", "+proj=lcc +lat_1=46.8 +lat_0=46.8 +lon_0=0 +k_0=0.99987742 +x_0=600000 +y_0=2200000 +a=6378249.2 +b=6356515 +towgs84=-168,-60,320,0,0,0,0 +pm=paris +units=m +no_defs");

const lambertII = "EPSG:27572";
const wgs84 = "EPSG:4326";

/**
 * Converts Lambert II extended coordinates to WGS84 (Lat/Lon).
 * @param {number} x - Lambert X coordinate.
 * @param {number} y - Lambert Y coordinate.
 * @returns {{ lat: number, lon: number }}
 */
export function convertLambertToWGS84(x, y) {
    const [lon, lat] = proj4(lambertII, wgs84, [x, y]);
    return { lat, lon };
}