import "server-only";

type WeatherZone = { name: string; lat: number | null; lng: number | null };
export type ZoneForecast = { name: string; max: number; min: number; rain: number; wind: number; code: number; severity: "ok" | "warning" | "danger" };

const FALLBACKS: Record<string, [number, number]> = {
  AMBA: [-34.6037, -58.3816], Interior: [-31.4201, -64.1888],
  AC: [-9.9754, -67.8249], AL: [-9.6498, -35.7089], AP: [0.0356, -51.0705], AM: [-3.119, -60.0217], BA: [-12.9714, -38.5014], CE: [-3.7319, -38.5267], DF: [-15.7939, -47.8828], ES: [-20.3155, -40.3128], GO: [-16.6869, -49.2648], MA: [-2.5307, -44.3068], MT: [-15.601, -56.0974], MS: [-20.4697, -54.6201], MG: [-19.9167, -43.9345], PA: [-1.4558, -48.4902], PB: [-7.1195, -34.845], PR: [-25.4284, -49.2733], PE: [-8.0476, -34.877], PI: [-5.0892, -42.8016], RJ: [-22.9068, -43.1729], RN: [-5.7945, -35.211], RS: [-30.0346, -51.2177], RO: [-8.7608, -63.8999], RR: [2.8235, -60.6758], SC: [-27.5949, -48.5482], SP: [-23.5505, -46.6333], SE: [-10.9472, -37.0731], TO: [-10.2491, -48.3243],
};

function coordinates(zone: WeatherZone) {
  if (zone.lat !== null && zone.lng !== null) return [zone.lat, zone.lng] as const;
  const code = zone.name.replace(/^BR-/, "").toUpperCase();
  return FALLBACKS[zone.name] ?? FALLBACKS[code] ?? [-15.7939, -47.8828];
}

function severity(code: number, rain: number, wind: number): ZoneForecast["severity"] {
  if ([65, 75, 82, 86, 95, 96, 99].includes(code) || rain >= 70 || wind >= 60) return "danger";
  if ([45, 48, 53, 55, 61, 63, 71, 73, 80, 81, 85].includes(code) || rain >= 40 || wind >= 40) return "warning";
  return "ok";
}

export async function fetchZoneForecasts(zones: WeatherZone[]): Promise<ZoneForecast[]> {
  const results = await Promise.allSettled(zones.map(async (zone) => {
    const [latitude, longitude] = coordinates(zone);
    const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max", timezone: "auto", forecast_days: "1" });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { next: { revalidate: 1800 } });
    if (!response.ok) throw new Error("weather");
    const data = await response.json() as { daily?: { weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[]; wind_speed_10m_max?: number[] } };
    const code = data.daily?.weather_code?.[0] ?? 0;
    const rain = data.daily?.precipitation_probability_max?.[0] ?? 0;
    const wind = data.daily?.wind_speed_10m_max?.[0] ?? 0;
    return { name: zone.name, max: data.daily?.temperature_2m_max?.[0] ?? 0, min: data.daily?.temperature_2m_min?.[0] ?? 0, rain, wind, code, severity: severity(code, rain, wind) };
  }));
  return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}
