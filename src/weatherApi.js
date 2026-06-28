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

async function fetchOpenMeteoWeather(city, signal) {
  const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodingUrl.search = new URLSearchParams({
    name: city,
    count: '1',
    language: 'en',
    format: 'json'
  }).toString();

  const geocodingResponse = await fetch(geocodingUrl, { signal });
  const geocodingPayload = await geocodingResponse.json();

  if (!geocodingResponse.ok) {
    throw new Error('Location lookup failed.');
  }

  const location = geocodingPayload.results?.[0];
  if (!location) {
    throw new Error('City not found. Try a nearby city or check the spelling.');
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

  const forecastResponse = await fetch(forecastUrl, { signal });
  const forecastPayload = await forecastResponse.json();

  if (!forecastResponse.ok) {
    throw new Error(forecastPayload.reason || 'Forecast unavailable.');
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
        icon: condition.icon
      };
    }),
    updatedAt: new Date().toISOString(),
    cached: false
  };
}

async function fetchBackendWeather(city, signal) {
  const response = await fetch(`/api/weather?city=${encodeURIComponent(city)}`, { signal });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Forecast unavailable.');
  }

  return data;
}

export async function fetchWeather(city, signal) {
  const useStaticWeather =
    import.meta.env.VITE_STATIC_WEATHER === 'true' || window.location.hostname.endsWith('github.io');

  if (useStaticWeather) {
    return fetchOpenMeteoWeather(city, signal);
  }

  try {
    return await fetchBackendWeather(city, signal);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return fetchOpenMeteoWeather(city, signal);
  }
}
