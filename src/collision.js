/**
 * Stylized aircraft/drone proximity in world units. A drone that flies past
 * outside the fuselage and wing outline cannot affect the shield.
 */
export function droneTouchesAircraft(drone, aircraft, wingHalfSpan) {
  const dx = Math.abs(drone.x - aircraft.x);
  const dy = Math.abs(drone.y - aircraft.y);
  const dz = Math.abs(drone.z - aircraft.z);
  if (dz > 1.55) return false;
  const fuselage = dx <= 1.55 && dy <= 1.25;
  const wing = dx <= wingHalfSpan + 0.85 && dy <= 0.92;
  return fuselage || wing;
}
