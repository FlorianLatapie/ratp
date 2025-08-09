const R_KM = 6371; // Earth's radius in kilometers (saves division)
const DEG_TO_RAD = Math.PI / 180; // Pre-calculated conversion factor

export function getDistance(lat1, lon1, lat2, lon2) {
    // Convert to radians in one go
    const φ1 = lat1 * DEG_TO_RAD;
    const φ2 = lat2 * DEG_TO_RAD;
    const Δφ = (lat2 - lat1) * DEG_TO_RAD;
    const Δλ = (lon2 - lon1) * DEG_TO_RAD;

    // Calculate half-chord distances
    const sinΔφ2 = Math.sin(Δφ * 0.5);
    const sinΔλ2 = Math.sin(Δλ * 0.5);

    const a = sinΔφ2 * sinΔφ2 + Math.cos(φ1) * Math.cos(φ2) * sinΔλ2 * sinΔλ2;

    const res =  R_KM * 2 * Math.asin(Math.sqrt(a));
    return res;
}

export function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    return getDistance(lat1, lon1, lat2, lon2) * 1000; // Convert kilometers to meters
}