/** Map GeoIP region names (Russian) to GeoJSON feature names for map matching */
const REGION_ALIASES: Record<string, string[]> = {
  'Москва': ['Moscow', 'Moskva', 'город Москва'],
  'Санкт-Петербург': ['Saint Petersburg', 'Sankt-Peterburg', 'город Санкт-Петербург'],
  'Московская область': ['Moscow Oblast', 'Moskovskaya'],
  'Ленинградская область': ['Leningrad Oblast'],
  'Краснодарский край': ['Krasnodar Krai', 'Krasnodarskiy'],
  'Свердловская область': ['Sverdlovsk Oblast', 'Sverdlovskaya'],
  'Новосибирская область': ['Novosibirsk Oblast', 'Novosibirskaya'],
  'Татарстан': ['Tatarstan', 'Republic of Tatarstan'],
};

export function normalizeRegion(name: string): string {
  for (const [canonical, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.some(a => a.toLowerCase() === name.toLowerCase())) return canonical;
  }
  return name;
}

export function matchRegionToGeo(pulseRegion: string, geoName: string): boolean {
  const a = pulseRegion.toLowerCase().trim();
  const b = geoName.toLowerCase().trim();
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;
  const aliases = REGION_ALIASES[pulseRegion];
  if (aliases?.some(al => al.toLowerCase() === b)) return true;
  return false;
}
