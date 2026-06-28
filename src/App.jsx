import { useEffect, useMemo, useState } from 'react';

const fallbackCities = ['New York', 'London', 'Tokyo', 'Sydney'];

function iconUrl(icon) {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(`${date}T12:00:00`)
  );
}

export default function App() {
  const [city, setCity] = useState('Mumbai');
  const [search, setSearch] = useState('Mumbai');
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const updatedTime = useMemo(() => {
    if (!weather?.updatedAt) return '';
    return new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric'
    }).format(new Date(weather.updatedAt));
  }, [weather]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWeather() {
      setStatus('loading');
      setError('');

      try {
        const response = await fetch(`/api/weather?city=${encodeURIComponent(search)}`, {
          signal: controller.signal
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Forecast unavailable.');
        }

        setWeather(data);
        setStatus('success');
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Something went wrong.');
        setStatus('error');
      }
    }

    loadWeather();

    return () => controller.abort();
  }, [search]);

  function handleSubmit(event) {
    event.preventDefault();
    const nextCity = city.trim();
    if (nextCity) setSearch(nextCity);
  }

  return (
    <main className="app-shell">
      <section className="weather-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">OpenWeatherMap Forecast</p>
            <h1>Weather Forecast</h1>
          </div>
          {weather?.cached && <span className="cache-badge">Cached</span>}
        </div>

        <form className="search-row" onSubmit={handleSubmit}>
          <label htmlFor="city">City</label>
          <div className="search-control">
            <input
              id="city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Search by city"
              autoComplete="address-level2"
            />
            <button type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Loading' : 'Search'}
            </button>
          </div>
        </form>

        {status === 'error' && (
          <div className="message" role="alert">
            {error}
          </div>
        )}

        {status === 'loading' && !weather && <div className="skeleton">Loading forecast...</div>}

        {weather && (
          <>
            <section className="current-weather" aria-live="polite">
              <div>
                <p className="location">
                  {weather.location.name}, {weather.location.country}
                </p>
                <p className="description">{weather.current.description}</p>
                <p className="updated">
                  Updated {updatedTime}
                  {weather.provider ? ` via ${weather.provider}` : ''}
                </p>
              </div>
              <img src={iconUrl(weather.current.icon)} alt="" />
              <div className="temp">{weather.current.temp}°C</div>
            </section>

            <section className="metric-grid">
              <div>
                <span>Feels Like</span>
                <strong>{weather.current.feelsLike}°C</strong>
              </div>
              <div>
                <span>Humidity</span>
                <strong>{weather.current.humidity}%</strong>
              </div>
              <div>
                <span>Wind</span>
                <strong>{weather.current.windSpeed} m/s</strong>
              </div>
            </section>

            <section className="forecast-grid">
              {weather.forecast.map((day) => (
                <article className="forecast-card" key={day.date}>
                  <p>{formatDate(day.date)}</p>
                  <img src={iconUrl(day.icon)} alt="" />
                  <strong>{day.temp}°C</strong>
                  <span>{day.tempMin}° / {day.tempMax}°</span>
                  <small>{day.description}</small>
                </article>
              ))}
            </section>
          </>
        )}

        <div className="quick-links" aria-label="Quick city searches">
          {fallbackCities.map((name) => (
            <button
              type="button"
              key={name}
              onClick={() => {
                setCity(name);
                setSearch(name);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
