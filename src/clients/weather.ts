import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, string>({ max: 2000, ttl: 30 * 60_000 });
const geoCache = new LRUCache<string, { lat: number; lon: number; label: string }>({ max: 2000, ttl: 7 * 24 * 3600_000 });

/** One prompt line with the 3-day forecast, or null if Open-Meteo fails (never blocks the answer). */
export async function weatherLine(lat: number, lon: number): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + '&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m'
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max'
      + '&forecast_days=3&timezone=Asia%2FKolkata';
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const j = await r.json() as {
      current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number };
      daily: { temperature_2m_max: number[]; precipitation_sum: number[]; precipitation_probability_max: number[] };
    };
    const d = j.daily;
    const day = (i: number, name: string) => `${name} rain chance ${d.precipitation_probability_max[i] ?? '?'}% (${d.precipitation_sum[i] ?? 0} mm), max ${d.temperature_2m_max[i]}°C`;
    const line = `now ${j.current.temperature_2m}°C, humidity ${j.current.relative_humidity_2m}%, wind ${j.current.wind_speed_10m} km/h; `
      + [day(0, 'today'), day(1, 'tomorrow'), day(2, 'day after')].join('; ');
    cache.set(key, line);
    return line;
  } catch {
    return null;
  }
}

const revCache = new LRUCache<string, { place: string; district: string; state: string; label: string }>({ max: 2000, ttl: 7 * 24 * 3600_000 });

/** Coordinates → "Locality, District, State" (BigDataCloud free client endpoint, Nominatim fallback). */
export async function reverseGeocode(lat: number, lon: number) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = revCache.get(key);
  if (hit) return hit;
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { signal: AbortSignal.timeout(2500) });
    const j = await r.json() as { locality?: string; city?: string; principalSubdivision?: string; localityInfo?: { administrative?: { name: string; adminLevel: number }[] } };
    const admin = j.localityInfo?.administrative ?? [];
    const district = admin.find((a) => a.adminLevel === 5)?.name ?? admin.find((a) => a.adminLevel === 6)?.name ?? '';
    const state = j.principalSubdivision ?? '';
    const place = j.city || j.locality || '';
    if (state) {
      const v = { place, district, state, label: [place, district !== place ? district : '', state].filter(Boolean).join(', ') };
      revCache.set(key, v);
      return v;
    }
  } catch { /* fall through */ }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`, { headers: { 'User-Agent': 'krishi-dhwani-hackathon/0.1' }, signal: AbortSignal.timeout(3000) });
    const j = await r.json() as { address?: { city?: string; town?: string; village?: string; county?: string; state_district?: string; state?: string } };
    const a = j.address ?? {};
    const place = a.city ?? a.town ?? a.village ?? '';
    const district = a.state_district ?? a.county ?? '';
    const state = a.state ?? '';
    if (!state) return null;
    const v = { place, district, state, label: [place, district, state].filter(Boolean).join(', ') };
    revCache.set(key, v);
    return v;
  } catch {
    return null;
  }
}

export async function geocode(place: string) {
  const k = place.trim().toLowerCase();
  if (!k) return null;
  const hit = geoCache.get(k);
  if (hit) return hit;
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&countryCode=IN`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json() as { results?: { latitude: number; longitude: number; name: string; admin1?: string }[] };
    const g = j.results?.[0];
    if (!g) return null;
    const v = { lat: g.latitude, lon: g.longitude, label: [g.name, g.admin1].filter(Boolean).join(', ') };
    geoCache.set(k, v);
    return v;
  } catch {
    return null;
  }
}
