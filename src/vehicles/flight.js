// Coordinated flight: faster aircraft need wider turns, and banking raises
// the speed needed to support the aircraft's weight. Limit aerobatic extremes
// so this remains a playable flight model rather than a full simulator.
export function coordinatedTurnRate(speed, bank) {
  const angle = Math.max(-1.2, Math.min(1.2, bank));
  return 9.81 * Math.tan(angle) / Math.max(speed, 20);
}

export function bankedStallSpeed(levelStall, bank) {
  const load = Math.min(4, 1 / Math.max(Math.abs(Math.cos(bank)), 0.25));
  return levelStall * Math.sqrt(load);
}
