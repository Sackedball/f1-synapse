/**
 * Unified unit conversion utilities for F1 Synapse.
 * Supports metric and imperial system formats across all panels and overlays.
 */

export type UnitSystem = 'metric' | 'imperial';

/**
 * Format speed value based on current unit system.
 */
export function formatSpeed(kmh: number, units: UnitSystem = 'metric'): string {
  if (isNaN(kmh)) return '—';
  if (units === 'imperial') {
    const mph = Math.round(kmh * 0.621371);
    return `${mph} mph`;
  }
  return `${Math.round(kmh)} km/h`;
}

/**
 * Format temperature value (°C or °F).
 */
export function formatTemp(celsius: number, units: UnitSystem = 'metric', decimals?: number): string {
  if (isNaN(celsius)) return '—';
  if (units === 'imperial') {
    const fahrenheit = celsius * 1.8 + 32;
    return `${decimals !== undefined ? fahrenheit.toFixed(decimals) : Math.round(fahrenheit)}°F`;
  }
  return `${decimals !== undefined ? celsius.toFixed(decimals) : Math.round(celsius)}°C`;
}

/**
 * Format distance value (meters/km or feet/miles).
 */
export function formatDistance(meters: number, units: UnitSystem = 'metric'): string {
  if (isNaN(meters)) return '—';
  if (units === 'imperial') {
    if (meters >= 1000) {
      const miles = (meters * 0.000621371).toFixed(2);
      return `${miles} mi`;
    }
    const feet = Math.round(meters * 3.28084);
    return `${feet} ft`;
  }

  if (meters >= 1000) {
    const km = (meters / 1000).toFixed(2);
    return `${km} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Get unit label for speed.
 */
export function speedUnit(units: UnitSystem = 'metric'): string {
  return units === 'imperial' ? 'mph' : 'km/h';
}

/**
 * Get unit label for temperature.
 */
export function tempUnit(units: UnitSystem = 'metric'): string {
  return units === 'imperial' ? '°F' : '°C';
}

/**
 * Get unit label for large distances.
 */
export function distanceUnit(units: UnitSystem = 'metric'): string {
  return units === 'imperial' ? 'mi' : 'km';
}
