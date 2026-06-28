import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 5000;
const apiKey = process.env.OPENWEATHER_API_KEY;
const cacheTtlMs = Math.max(Number(process.env.CACHE_TTL_SECONDS) || 300, 0) * 1000;
const cache = new Map();

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }));
app.use(express.json());

function getCachedForecast(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedForecast(key, data) {
  if (cacheTtlMs === 0) return;
  cache.set(key, { data, expiresAt: Date.now() + cacheTtlMs });
}

function describeWeatherCode(code) {
  const descriptions = {
    0: ['clear sky', '01d'],
    1: ['mainly clear', '02d'],
    2: ['partly cloudy', '03d'],
    3: ['overcast', '04d'],
    45: ['fog', '50d'],
    48: ['depositing rime fog', '50d'],
    51: ['light drizzle', '09d'],
    53: ['moderate drizzle', '09d'],
    55: ['dense drizzle', '09d'],
    56: ['light freezing drizzle', '13d'],
    57: ['dense freezing drizzle', '13d'],
    61: ['slight rain', '10d'],
    63: ['moderate rain', '10d'],
    65: ['heavy rain', '10d'],
    66: ['light freezing rain', '13d'],
    67: ['heavy freezing rain', '13d'],
    71: ['slight snow', '13d'],
    73: ['moderate snow', '13d'],
    75: ['heavy snow', '13d'],
    77: ['snow grains', '13d'],
    80: ['slight rain showers', '09d'],
    81: ['moderate rain showers', '09d'],
    82: ['violent rain showers', '09d'],
    85: ['slight snow showers', '13d'],
    86: ['heavy snow showers', '13d'],
    95: ['thunderstorm', '11d'],
    96: ['thunderstorm with slight hail', '11d'],
    99: ['thunderstorm with heavy hail', '11d']
  };

  const [description, icon] = descriptions[code] ?? ['weather unavailable', '01d'];
  return { description, icon };
}

function groupForecastByDay(list) {
  const days = new Map();

  for (const item of list) {
    const date = item.dt_txt.split(' ')[0];
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(item);
  }

  return Array.from(days.entries()).slice(0, 5).map(([date, entries]) => {
    const midday =
      entries.find((entry) => entry.dt_txt.includes('12:00:00')) ||
      entries[Math.floor(entries.length / 2)];

    const temps = entries.map((entry) => entry.main.temp);
    const conditions = midday.weather?.[0] ?? {};

    return {
      date,
      tempMin: Math.round(Math.min(...temps)),
      tempMax: Math.round(Math.max(...temps)),
      temp: Math.round(midday.main.temp),
      description: conditions.description ?? 'Forecast unavailable',
      icon: conditions.icon ?? '01d',
      humidity: midday.main.humidity,
      windSpeed: Math.round(midday.wind.speed)
    };
  });
}

function formatWeatherPayload(payload) {
  const current = payload.list[0];
  const condition = current.weather?.[0] ?? {};

  return {
    location: {
      name: payload.city.name,
      country: payload.city.country
    },
    current: {
      temp: Math.round(current.main.temp),
      feelsLike: Math.round(current.main.feels_like),
      description: condition.description ?? 'Weather unavailable',
      icon: condition.icon ?? '01d',
      humidity: current.main.humidity,
      windSpeed: Math.round(current.wind.speed)
    },
    provider: 'OpenWeatherMap',
    forecast: groupForecastByDay(payload.list),
    updatedAt: new Date().toISOString()
  };
}

async function getOpenMeteoForecast(city) {
  const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodingUrl.search = new URLSearchParams({
    name: city,
    count: '1',
    language: 'en',
    format: 'json'
  }).toString();

  const geocodingResponse = await fetch(geocodingUrl);
  const geocodingPayload = await geocodingResponse.json();

  if (!geocodingResponse.ok) {
    throw new Error('Location lookup failed.');
  }

  const location = geocodingPayload.results?.[0];
  if (!location) {
    const error = new Error('City not found. Try a nearby city or check the spelling.');
    error.status = 404;
    throw error;
  }

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '5',
    wind_speed_unit: 'ms'
  }).toString();

  const forecastResponse = await fetch(forecastUrl);
  const forecastPayload = await forecastResponse.json();

  if (!forecastResponse.ok) {
    throw new Error(forecastPayload.reason || 'Open-Meteo could not return a forecast right now.');
  }

  const currentCondition = describeWeatherCode(forecastPayload.current.weather_code);
  const daily = forecastPayload.daily;

  return {
    location: {
      name: location.name,
      country: location.country_code || location.country || ''
    },
    current: {
      temp: Math.round(forecastPayload.current.temperature_2m),
      feelsLike: Math.round(forecastPayload.current.apparent_temperature),
      description: currentCondition.description,
      icon: currentCondition.icon,
      humidity: forecastPayload.current.relative_humidity_2m,
      windSpeed: Math.round(forecastPayload.current.wind_speed_10m)
    },
    provider: 'Open-Meteo',
    forecast: daily.time.map((date, index) => {
      const condition = describeWeatherCode(daily.weather_code[index]);
      const tempMin = Math.round(daily.temperature_2m_min[index]);
      const tempMax = Math.round(daily.temperature_2m_max[index]);

      return {
        date,
        tempMin,
        tempMax,
        temp: Math.round((tempMin + tempMax) / 2),
        description: condition.description,
        icon: condition.icon,
        humidity: null,
        windSpeed: null
      };
    }),
    updatedAt: new Date().toISOString()
  };
}

async function getOpenWeatherMapForecast(city) {
  const url = new URL('https://api.openweathermap.org/data/2.5/forecast');
  url.search = new URLSearchParams({
    q: city,
    units: 'metric',
    appid: apiKey
  }).toString();

  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(
      response.status === 404
        ? 'City not found. Try a nearby city or check the spelling.'
        : payload.message || 'OpenWeatherMap could not return a forecast right now.'
    );
    error.status = response.status;
    throw error;
  }

  return formatWeatherPayload(payload);
}

app.get('/api/weather', async (req, res) => {
  const city = String(req.query.city || '').trim();

  if (!city) {
    return res.status(400).json({ message: 'Enter a city name to get the forecast.' });
  }

  const cacheKey = city.toLowerCase();
  const cached = getCachedForecast(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const formatted = apiKey
      ? await getOpenWeatherMapForecast(city)
      : await getOpenMeteoForecast(city);
    setCachedForecast(cacheKey, formatted);
    return res.json({ ...formatted, cached: false });
  } catch (error) {
    console.error('Weather request failed:', error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(502).json({
      message: 'Unable to reach the weather service. Please try again in a moment.'
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.listen(port, () => {
  console.log(`Weather API proxy listening on http://127.0.0.1:${port}`);
});
