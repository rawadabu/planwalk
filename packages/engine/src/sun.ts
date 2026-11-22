// Sun position for a place and moment (accurate to ~0.5°, plenty for daylight studies).
// Returns the azimuth in degrees clockwise from TRUE north and the elevation above the horizon.
export function sunPosition(date: Date, lat: number, lng: number): { az: number; el: number } {
  const rad = Math.PI / 180
  const d = date.getTime() / 86400000 - 10957.5                     // days since J2000.0 (2000-01-01 12:00 UTC)
  const g = (357.529 + 0.98560028 * d) * rad                        // mean anomaly
  const q = 280.459 + 0.98564736 * d                                // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * rad                          // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24
  const H = (gmst * 15 + lng) * rad - ra                             // hour angle
  const phi = lat * rad
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H))
  return { az: (az / rad + 360) % 360, el: el / rad }
}
