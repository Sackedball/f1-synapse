/**
 * Comprehensive F1 Circuits Database
 * Provides accurate track lengths, official titles, and distinctive SVG silhouettes for every Grand Prix.
 */

export interface CircuitData {
  id: string;
  name: string;
  circuitName: string;
  country: string;
  location: string;
  lengthKm: string;
  turns: number;
  laps: number;
  viewBox: string;
  svgPath: string;
}

export const CIRCUITS: Record<string, CircuitData> = {
  // Round 1 / Bahrain
  bahrain: {
    id: 'bahrain',
    name: 'Bahrain Grand Prix',
    circuitName: 'Bahrain International Circuit',
    country: 'Bahrain',
    location: 'Sakhir',
    lengthKm: '5.412 KM',
    turns: 15,
    laps: 57,
    viewBox: '0 0 100 60',
    svgPath:
      'M 15,50 L 16,22 Q 18,12 25,14 L 38,18 Q 44,20 46,26 L 42,34 Q 45,40 54,38 L 68,32 Q 76,28 82,34 L 88,40 Q 90,46 84,48 L 70,50 Q 64,52 58,46 L 52,38 Q 48,34 40,42 L 32,50 Z',
  },

  // Saudi Arabia
  jeddah: {
    id: 'jeddah',
    name: 'Saudi Arabian Grand Prix',
    circuitName: 'Jeddah Corniche Circuit',
    country: 'Saudi Arabia',
    location: 'Jeddah',
    lengthKm: '6.174 KM',
    turns: 27,
    laps: 50,
    viewBox: '0 0 100 60',
    svgPath:
      'M 12,48 Q 14,35 18,32 L 28,30 Q 38,28 45,22 L 60,16 Q 74,10 84,12 L 90,15 Q 94,20 90,26 L 78,32 Q 68,38 56,42 L 40,46 Q 28,50 18,52 Z',
  },

  // Australia
  melbourne: {
    id: 'melbourne',
    name: 'Australian Grand Prix',
    circuitName: 'Albert Park Circuit',
    country: 'Australia',
    location: 'Melbourne',
    lengthKm: '5.278 KM',
    turns: 14,
    laps: 58,
    viewBox: '0 0 100 60',
    svgPath:
      'M 20,48 L 18,34 Q 17,24 24,20 L 38,18 Q 46,16 56,18 L 74,22 Q 86,25 86,34 L 84,42 Q 80,48 70,48 L 52,47 Q 40,46 32,49 Z',
  },

  // Japan / Suzuka
  suzuka: {
    id: 'suzuka',
    name: 'Japanese Grand Prix',
    circuitName: 'Suzuka International Racing Course',
    country: 'Japan',
    location: 'Suzuka',
    lengthKm: '5.807 KM',
    turns: 18,
    laps: 53,
    viewBox: '0 0 100 60',
    svgPath:
      'M 24,44 C 18,38 14,28 18,20 C 22,12 34,14 38,20 C 44,28 52,18 60,14 C 70,10 78,16 74,24 C 70,32 58,34 50,38 C 42,42 36,46 48,50 C 62,54 78,52 86,46 C 92,42 90,32 82,34 C 74,36 62,44 48,46 C 36,48 28,48 24,44 Z',
  },

  // China
  shanghai: {
    id: 'shanghai',
    name: 'Chinese Grand Prix',
    circuitName: 'Shanghai International Circuit',
    country: 'China',
    location: 'Shanghai',
    lengthKm: '5.451 KM',
    turns: 16,
    laps: 56,
    viewBox: '0 0 100 60',
    svgPath:
      'M 18,50 C 14,40 14,24 22,16 C 30,8 42,12 38,22 C 34,30 26,28 28,34 C 30,40 44,42 54,36 L 70,26 Q 86,14 90,20 L 90,38 Q 88,48 78,48 L 50,49 Q 32,50 18,50 Z',
  },

  // Miami
  miami: {
    id: 'miami',
    name: 'Miami Grand Prix',
    circuitName: 'Miami International Autodrome',
    country: 'USA',
    location: 'Miami',
    lengthKm: '5.412 KM',
    turns: 19,
    laps: 57,
    viewBox: '0 0 100 60',
    svgPath:
      'M 14,46 L 16,22 Q 18,14 26,16 L 46,18 Q 54,20 60,15 L 76,14 Q 86,14 88,22 L 86,34 Q 84,42 76,44 L 56,46 Q 44,48 30,48 Z',
  },

  // Imola
  imola: {
    id: 'imola',
    name: 'Emilia Romagna Grand Prix',
    circuitName: 'Autodromo Enzo e Dino Ferrari',
    country: 'Italy',
    location: 'Imola',
    lengthKm: '4.909 KM',
    turns: 19,
    laps: 63,
    viewBox: '0 0 100 60',
    svgPath:
      'M 18,48 L 32,46 Q 44,42 52,44 L 66,48 Q 78,50 82,42 L 80,30 Q 76,18 64,16 L 48,15 Q 36,16 28,24 L 20,34 Q 14,42 18,48 Z',
  },

  // Monaco
  monaco: {
    id: 'monaco',
    name: 'Monaco Grand Prix',
    circuitName: 'Circuit de Monaco',
    country: 'Monaco',
    location: 'Monte Carlo',
    lengthKm: '3.337 KM',
    turns: 19,
    laps: 78,
    viewBox: '0 0 100 60',
    svgPath:
      'M 16,46 L 22,24 Q 26,14 36,12 L 50,14 Q 58,16 62,22 L 60,28 Q 56,32 64,30 L 78,32 Q 88,34 86,42 L 76,46 Q 66,48 54,46 L 38,47 Q 26,48 16,46 Z',
  },

  // Canada
  montreal: {
    id: 'montreal',
    name: 'Canadian Grand Prix',
    circuitName: 'Circuit Gilles Villeneuve',
    country: 'Canada',
    location: 'Montreal',
    lengthKm: '4.361 KM',
    turns: 14,
    laps: 70,
    viewBox: '0 0 100 60',
    svgPath:
      'M 10,40 L 22,24 Q 28,18 36,20 L 58,22 Q 74,24 88,32 L 88,42 Q 84,48 76,46 L 46,44 Q 28,42 16,44 Z',
  },

  // Spain / Barcelona
  barcelona: {
    id: 'barcelona',
    name: 'Spanish Grand Prix',
    circuitName: 'Circuit de Barcelona-Catalunya',
    country: 'Spain',
    location: 'Barcelona',
    lengthKm: '4.657 KM',
    turns: 14,
    laps: 66,
    viewBox: '0 0 100 60',
    svgPath:
      'M 16,48 L 18,22 Q 22,14 32,16 L 46,20 Q 56,22 62,18 L 74,16 Q 84,18 86,28 L 82,38 Q 78,46 66,46 L 48,47 Q 32,48 16,48 Z',
  },

  // Austria / Red Bull Ring
  spielberg: {
    id: 'spielberg',
    name: 'Austrian Grand Prix',
    circuitName: 'Red Bull Ring',
    country: 'Austria',
    location: 'Spielberg',
    lengthKm: '4.318 KM',
    turns: 10,
    laps: 71,
    viewBox: '0 0 100 60',
    svgPath:
      'M 18,48 L 22,26 Q 26,16 46,14 L 68,14 Q 82,16 82,26 L 78,38 Q 74,48 56,46 L 38,47 Q 28,48 18,48 Z',
  },

  // Great Britain / Silverstone
  silverstone: {
    id: 'silverstone',
    name: 'British Grand Prix',
    circuitName: 'Silverstone Circuit',
    country: 'Great Britain',
    location: 'Silverstone',
    lengthKm: '5.891 KM',
    turns: 18,
    laps: 52,
    viewBox: '0 0 100 60',
    svgPath:
      'M 16,42 L 26,48 Q 36,52 44,46 L 38,32 Q 32,22 42,16 L 62,12 Q 74,10 82,18 L 86,30 Q 88,40 78,44 L 60,46 Q 44,48 30,44 Z',
  },

  // Hungary / Hungaroring
  hungaroring: {
    id: 'hungaroring',
    name: 'Hungarian Grand Prix',
    circuitName: 'Hungaroring',
    country: 'Hungary',
    location: 'Budapest',
    lengthKm: '4.381 KM',
    turns: 14,
    laps: 70,
    viewBox: '0 0 100 60',
    svgPath:
      'M 18,48 L 20,22 Q 24,14 36,16 L 50,22 Q 62,18 72,16 L 82,22 Q 86,32 78,40 L 64,46 Q 48,50 34,48 Z',
  },

  // Belgium / Spa
  spa: {
    id: 'spa',
    name: 'Belgian Grand Prix',
    circuitName: 'Circuit de Spa-Francorchamps',
    country: 'Belgium',
    location: 'Spa-Francorchamps',
    lengthKm: '7.004 KM',
    turns: 19,
    laps: 44,
    viewBox: '0 0 100 60',
    svgPath:
      'M 20,44 L 28,32 Q 34,22 46,16 L 68,12 Q 80,10 84,18 L 84,28 Q 82,38 72,42 L 58,46 Q 42,50 28,48 Z',
  },

  // Netherlands / Zandvoort
  zandvoort: {
    id: 'zandvoort',
    name: 'Dutch Grand Prix',
    circuitName: 'Circuit Zandvoort',
    country: 'Netherlands',
    location: 'Zandvoort',
    lengthKm: '4.259 KM',
    turns: 14,
    laps: 72,
    viewBox: '0 0 100 60',
    svgPath:
      'M 16,46 L 20,18 Q 26,12 38,14 L 56,12 Q 70,12 78,22 L 80,34 Q 78,46 64,48 L 42,48 Q 28,48 16,46 Z',
  },

  // Italy / Monza
  monza: {
    id: 'monza',
    name: 'Italian Grand Prix',
    circuitName: 'Autodromo Nazionale Monza',
    country: 'Italy',
    location: 'Monza',
    lengthKm: '5.793 KM',
    turns: 11,
    laps: 53,
    viewBox: '0 0 100 60',
    svgPath:
      'M 14,48 L 16,16 Q 20,10 32,12 L 56,14 Q 72,14 80,22 L 86,32 Q 88,44 74,48 L 52,49 Q 32,50 14,48 Z',
  },

  // Azerbaijan / Baku
  baku: {
    id: 'baku',
    name: 'Azerbaijan Grand Prix',
    circuitName: 'Baku City Circuit',
    country: 'Azerbaijan',
    location: 'Baku',
    lengthKm: '6.003 KM',
    turns: 20,
    laps: 51,
    viewBox: '0 0 100 60',
    svgPath:
      'M 16,50 L 16,30 L 32,30 L 32,18 L 54,18 L 66,16 L 76,24 L 84,34 L 88,48 L 48,50 Z',
  },

  // Singapore / Marina Bay
  singapore: {
    id: 'singapore',
    name: 'Singapore Grand Prix',
    circuitName: 'Marina Bay Street Circuit',
    country: 'Singapore',
    location: 'Marina Bay',
    lengthKm: '4.940 KM',
    turns: 19,
    laps: 62,
    viewBox: '0 0 100 60',
    svgPath:
      'M 16,46 L 18,24 Q 22,16 34,18 L 58,16 Q 74,18 82,26 L 80,40 Q 76,48 62,48 L 44,48 Q 28,48 16,46 Z',
  },

  // USA / COTA Austin
  cota: {
    id: 'cota',
    name: 'United States Grand Prix',
    circuitName: 'Circuit of the Americas',
    country: 'USA',
    location: 'Austin',
    lengthKm: '5.513 KM',
    turns: 20,
    laps: 56,
    viewBox: '0 0 100 60',
    svgPath:
      'M 18,48 L 22,16 Q 26,12 36,16 L 50,22 Q 62,24 72,16 L 84,26 Q 88,38 78,44 L 62,48 Q 44,50 28,49 Z',
  },

  // Mexico
  mexico: {
    id: 'mexico',
    name: 'Mexico City Grand Prix',
    circuitName: 'Autódromo Hermanos Rodríguez',
    country: 'Mexico',
    location: 'Mexico City',
    lengthKm: '4.304 KM',
    turns: 17,
    laps: 71,
    viewBox: '0 0 100 60',
    svgPath:
      'M 16,50 L 18,16 Q 24,12 40,14 L 60,18 Q 74,20 84,30 L 86,44 Q 80,50 64,50 L 42,50 Q 28,50 16,50 Z',
  },

  // Brazil / Interlagos
  interlagos: {
    id: 'interlagos',
    name: 'São Paulo Grand Prix',
    circuitName: 'Autódromo José Carlos Pace',
    country: 'Brazil',
    location: 'São Paulo',
    lengthKm: '4.309 KM',
    turns: 15,
    laps: 71,
    viewBox: '0 0 100 60',
    svgPath:
      'M 20,46 L 22,24 Q 28,18 38,22 L 56,22 Q 72,18 80,26 L 82,38 Q 78,48 64,48 L 46,47 Q 32,48 20,46 Z',
  },

  // Las Vegas
  lasvegas: {
    id: 'lasvegas',
    name: 'Las Vegas Grand Prix',
    circuitName: 'Las Vegas Strip Circuit',
    country: 'USA',
    location: 'Las Vegas',
    lengthKm: '6.201 KM',
    turns: 17,
    laps: 50,
    viewBox: '0 0 100 60',
    svgPath:
      'M 18,48 L 20,24 L 38,20 Q 52,16 66,18 L 84,20 L 88,34 L 80,48 L 46,49 Z',
  },

  // Qatar / Lusail
  lusail: {
    id: 'lusail',
    name: 'Qatar Grand Prix',
    circuitName: 'Lusail International Circuit',
    country: 'Qatar',
    location: 'Lusail',
    lengthKm: '5.419 KM',
    turns: 16,
    laps: 57,
    viewBox: '0 0 100 60',
    svgPath:
      'M 16,48 L 20,18 Q 26,12 42,14 L 64,16 Q 80,20 84,30 L 82,42 Q 76,48 60,48 L 38,48 Z',
  },

  // Abu Dhabi / Yas Marina
  yasmarina: {
    id: 'yasmarina',
    name: 'Abu Dhabi Grand Prix',
    circuitName: 'Yas Marina Circuit',
    country: 'UAE',
    location: 'Yas Island',
    lengthKm: '5.281 KM',
    turns: 16,
    laps: 58,
    viewBox: '0 0 100 60',
    svgPath:
      'M 18,48 L 24,20 Q 30,14 44,16 L 68,14 Q 82,18 84,28 L 84,40 Q 78,48 62,48 L 40,48 Z',
  },
};

/**
 * Resolve circuit data by matching Grand Prix name, location, or country.
 */
export function getCircuitForEvent(event: {
  name?: string;
  location?: string;
  country?: string;
}): CircuitData {
  const name = (event.name || '').toLowerCase();
  const loc = (event.location || '').toLowerCase();
  const country = (event.country || '').toLowerCase();

  if (name.includes('bahrain') || loc.includes('sakhir') || country.includes('bahrain')) {
    return CIRCUITS.bahrain;
  }
  if (name.includes('saudi') || loc.includes('jeddah') || country.includes('saudi')) {
    return CIRCUITS.jeddah;
  }
  if (name.includes('austral') || loc.includes('melbourne') || country.includes('australia')) {
    return CIRCUITS.melbourne;
  }
  if (name.includes('japan') || loc.includes('suzuka') || country.includes('japan')) {
    return CIRCUITS.suzuka;
  }
  if (name.includes('chin') || loc.includes('shanghai') || country.includes('china')) {
    return CIRCUITS.shanghai;
  }
  if (name.includes('miami')) {
    return CIRCUITS.miami;
  }
  if (name.includes('imola') || name.includes('emilia') || loc.includes('imola')) {
    return CIRCUITS.imola;
  }
  if (name.includes('monaco') || loc.includes('monte carlo') || country.includes('monaco')) {
    return CIRCUITS.monaco;
  }
  if (name.includes('canad') || loc.includes('montreal') || country.includes('canada')) {
    return CIRCUITS.montreal;
  }
  if (name.includes('span') || loc.includes('barcelona') || country.includes('spain')) {
    return CIRCUITS.barcelona;
  }
  if (name.includes('austr') || loc.includes('spielberg') || country.includes('austria')) {
    return CIRCUITS.spielberg;
  }
  if (name.includes('brit') || loc.includes('silverstone') || country.includes('united kingdom')) {
    return CIRCUITS.silverstone;
  }
  if (name.includes('hungar') || loc.includes('budapest') || country.includes('hungary')) {
    return CIRCUITS.hungaroring;
  }
  if (name.includes('belgi') || loc.includes('spa') || country.includes('belgium')) {
    return CIRCUITS.spa;
  }
  if (name.includes('dutch') || loc.includes('zandvoort') || country.includes('netherlands')) {
    return CIRCUITS.zandvoort;
  }
  if (name.includes('ital') || loc.includes('monza') || country.includes('italy')) {
    return CIRCUITS.monza;
  }
  if (name.includes('azerbaijan') || loc.includes('baku') || country.includes('azerbaijan')) {
    return CIRCUITS.baku;
  }
  if (name.includes('singapore') || loc.includes('singapore') || country.includes('singapore')) {
    return CIRCUITS.singapore;
  }
  if (name.includes('united states') || loc.includes('austin') || name.includes('cota')) {
    return CIRCUITS.cota;
  }
  if (name.includes('mexic') || loc.includes('mexico')) {
    return CIRCUITS.mexico;
  }
  if (name.includes('brazil') || loc.includes('são paulo') || loc.includes('sao paulo') || country.includes('brazil')) {
    return CIRCUITS.interlagos;
  }
  if (name.includes('vegas')) {
    return CIRCUITS.lasvegas;
  }
  if (name.includes('qatar') || loc.includes('lusail') || country.includes('qatar')) {
    return CIRCUITS.lusail;
  }
  if (name.includes('abu dhabi') || loc.includes('yas') || country.includes('uae')) {
    return CIRCUITS.yasmarina;
  }

  // Fallback: Generic sleek modern GP circuit
  return {
    id: 'generic',
    name: event.name || 'Grand Prix',
    circuitName: `${event.location || event.country || 'Formula 1'} Circuit`,
    country: event.country || 'FIA',
    location: event.location || '',
    lengthKm: '5.380 KM',
    turns: 16,
    laps: 55,
    viewBox: '0 0 100 60',
    svgPath:
      'M 15,48 L 18,22 Q 22,14 34,16 L 54,16 Q 72,16 82,24 L 86,36 Q 84,48 68,48 L 44,48 Z',
  };
}
