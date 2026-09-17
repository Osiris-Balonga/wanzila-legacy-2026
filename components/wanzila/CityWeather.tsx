'use client'

import { useEffect, useState } from 'react'
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSun, Moon, Sun } from 'lucide-react'

type Weather = { temperature: number; code: number; isDay: boolean }

function describe(code: number) {
  if (code === 0) return 'Ciel dégagé'
  if (code <= 3) return 'Partiellement nuageux'
  if (code <= 48) return 'Brume'
  if (code <= 57) return 'Bruine'
  if (code <= 67 || (code >= 80 && code <= 82)) return 'Pluie'
  if (code >= 95) return 'Orage'
  return 'Nuageux'
}

function WeatherIcon({ code, isDay }: Pick<Weather, 'code' | 'isDay'>) {
  if (code === 0) return isDay ? <Sun size={18} /> : <Moon size={18} />
  if (code <= 2) return isDay ? <CloudSun size={18} /> : <CloudMoon size={18} />
  if (code <= 3) return <Cloud size={18} />
  if (code <= 48) return <CloudFog size={18} />
  if (code <= 57) return <CloudDrizzle size={18} />
  if (code <= 82) return <CloudRain size={18} />
  if (code >= 95) return <CloudLightning size={18} />
  return <Cloud size={18} />
}

export function CityWeather() {
  const [weather, setWeather] = useState<Weather | null>(null)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch('/api/weather')
        if (!response.ok) return
        const data = await response.json()
        if (active && Number.isFinite(data.temperature) && Number.isFinite(data.code)) setWeather(data)
      } catch { /* City name stays visible when weather is unavailable. */ }
    }
    load()
    const interval = window.setInterval(load, 15 * 60 * 1000)
    return () => { active = false; window.clearInterval(interval) }
  }, [])
  return <div className="map-city" title={weather ? `${describe(weather.code)} · météo Open-Meteo` : 'Brazzaville'}>
    {weather && <WeatherIcon code={weather.code} isDay={weather.isDay} />}
    <span>Brazzaville</span>
    {weather && <strong>{weather.temperature} °C</strong>}
  </div>
}
