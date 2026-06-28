# Weather Forecast Application

React + Express weather forecast app with a backend proxy for OpenWeatherMap and an automatic no-key real forecast fallback.

## Features

- React UI with dynamic loading, error, cached, and forecast states
- Express proxy keeps the OpenWeatherMap API key off the client
- Async/await API integration
- Environment-based configuration through `.env`
- Automatic Open-Meteo fallback when no OpenWeatherMap key is configured
- GitHub Pages deployment with direct Open-Meteo browser forecasts
- In-memory cache controlled by `CACHE_TTL_SECONDS`
- Graceful validation, missing-key, city-not-found, and upstream-service errors

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from the example:

   ```bash
   cp .env.example .env
   ```

3. Optionally add your OpenWeatherMap key to `.env`:

   ```bash
   OPENWEATHER_API_KEY=your_key_here
   ```

4. Start the React and Express dev servers:

   ```bash
   npm run dev
   ```

The frontend runs at `http://127.0.0.1:5173` and proxies `/api/weather` to the backend at `http://127.0.0.1:5000`.

If `OPENWEATHER_API_KEY` is empty, the backend automatically uses Open-Meteo so searches still return real forecast data.

## GitHub Pages

The site is configured to deploy from GitHub Actions to:

```text
https://poornachandu556.github.io/weather-forecast-application-api-driven-engineering/
```

In the GitHub repository, open **Settings > Pages** and set **Build and deployment** to **GitHub Actions**. After the workflow finishes, the website link will be live.
