import "server-only";

type WeatherZone = { name: string; lat: number | null; lng: number | null };
export type WeatherEvent = "storm" | "rain" | "heat" | "cold" | "wind" | "none";
export type ZoneForecast = { name: string; max: number; min: number; rain: number; wind: number; code: number; severity: "ok" | "warning" | "danger"; event: WeatherEvent };

/**
 * Centroide de cada provincia argentina (capital provincial) + los estados
 * de Brasil que ya estaban. No hace falta precisión geodésica para saber si
 * va a llover en la región — alcanza con no caer en la provincia/estado
 * equivocado (AC-12-B: una provincia argentina sin coordenadas nunca puede
 * terminar mostrando el clima de Brasilia).
 */
const FALLBACKS: Record<string, [number, number]> = {
  AMBA: [-34.6037, -58.3816], Interior: [-31.4201, -64.1888],
  "Buenos Aires": [-34.9214, -57.9544],
  "Ciudad Autónoma de Buenos Aires": [-34.6037, -58.3816],
  Catamarca: [-28.4696, -65.7852],
  Chaco: [-27.4512, -58.9867],
  Chubut: [-43.3002, -65.1023],
  Córdoba: [-31.4201, -64.1888],
  Corrientes: [-27.4691, -58.8306],
  "Entre Ríos": [-31.7333, -60.5238],
  Formosa: [-26.1849, -58.1731],
  Jujuy: [-24.1858, -65.2995],
  "La Pampa": [-36.6167, -64.2833],
  "La Rioja": [-29.4131, -66.8558],
  Mendoza: [-32.8895, -68.8458],
  Misiones: [-27.3671, -55.8961],
  Neuquén: [-38.9516, -68.0591],
  "Río Negro": [-40.8135, -62.9967],
  Salta: [-24.7859, -65.4117],
  "San Juan": [-31.5375, -68.5364],
  "San Luis": [-33.295, -66.3356],
  "Santa Cruz": [-51.623, -69.2168],
  "Santa Fe": [-31.6333, -60.7],
  "Santiago del Estero": [-27.7834, -64.2642],
  "Tierra del Fuego": [-54.8019, -68.303],
  Tucumán: [-26.8241, -65.2226],
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

const STORM_CODES = new Set([95, 96, 99]);
const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82]);
const HEAT_THRESHOLD_C = 35;
const COLD_THRESHOLD_C = 0;
const STRONG_WIND_KMH = 50;

/**
 * Qué tipo de evento describe mejor el pronóstico, para que la alerta diga
 * "tormenta" o "temperatura extrema" en vez de un genérico "riesgo
 * climático". El código WMO sólo describe precipitación/cielo, así que la
 * temperatura se evalúa aparte contra umbrales fijos.
 */
function eventType(code: number, max: number, min: number, wind: number): WeatherEvent {
  if (STORM_CODES.has(code)) return "storm";
  if (RAIN_CODES.has(code)) return "rain";
  if (max >= HEAT_THRESHOLD_C) return "heat";
  if (min <= COLD_THRESHOLD_C) return "cold";
  if (wind >= STRONG_WIND_KMH) return "wind";
  return "none";
}

/** Open-Meteo es un tercero: si tarda, no puede arrastrar al tablero con él. */
const WEATHER_TIMEOUT_MS = 5000;

/**
 * Pronóstico por zona a 48 horas (DASH-R2, REQ-12.4). El clima es
 * informativo, así que cualquier falla se traga y devuelve la lista sin esa
 * zona.
 *
 * **Por qué el peor caso entre los dos días, no el promedio.** Errar hacia
 * la alerta cuesta menos que no avisar a tiempo — mismo criterio que ya se
 * usó para el traslado del gate de agenda: una subestimación del riesgo es
 * peor que una sobreestimación.
 *
 * El timeout no es decorativo: este fetch corre dentro del render de
 * `/dashboard`, y ese render es lo que espera `revalidatePath` al publicar un
 * anuncio. Sin corte, una demora de Open-Meteo dejaba el botón en "Publicando…"
 * para siempre aunque el anuncio ya hubiera salido.
 */
export async function fetchZoneForecasts(zones: WeatherZone[]): Promise<ZoneForecast[]> {
  const results = await Promise.allSettled(zones.map(async (zone) => {
    const [latitude, longitude] = coordinates(zone);
    const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max", timezone: "auto", forecast_days: "2" });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
    if (!response.ok) throw new Error("weather");
    const data = await response.json() as { daily?: { weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[]; wind_speed_10m_max?: number[] } };
    const days = [0, 1]
      .map((index) => ({
        code: data.daily?.weather_code?.[index] ?? 0,
        max: data.daily?.temperature_2m_max?.[index] ?? 0,
        min: data.daily?.temperature_2m_min?.[index] ?? 0,
        rain: data.daily?.precipitation_probability_max?.[index] ?? 0,
        wind: data.daily?.wind_speed_10m_max?.[index] ?? 0,
      }))
      .filter((_, index) => data.daily?.weather_code?.[index] !== undefined);
    if (days.length === 0) throw new Error("weather");

    // Peor caso entre ambos días de la ventana de 48h, no un promedio:
    // primero por severidad (ok < warning < danger), y a igual severidad,
    // por la combinación de lluvia + viento más alta.
    const SEVERITY_SCORE = { ok: 0, warning: 1, danger: 2 };
    const worst = days.reduce((acc, day) => {
      const accScore = SEVERITY_SCORE[severity(acc.code, acc.rain, acc.wind)];
      const dayScore = SEVERITY_SCORE[severity(day.code, day.rain, day.wind)];
      if (dayScore !== accScore) return dayScore > accScore ? day : acc;
      return day.rain + day.wind > acc.rain + acc.wind ? day : acc;
    }, days[0]);
    const max = Math.max(...days.map((day) => day.max));
    const min = Math.min(...days.map((day) => day.min));

    return {
      name: zone.name,
      max,
      min,
      rain: worst.rain,
      wind: worst.wind,
      code: worst.code,
      severity: severity(worst.code, worst.rain, worst.wind),
      event: eventType(worst.code, max, min, worst.wind),
    };
  }));
  return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}
