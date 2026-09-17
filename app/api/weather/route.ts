import { NextResponse } from 'next/server'

export const revalidate = 900

export async function GET() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=-4.263&longitude=15.268&current=temperature_2m,weather_code,is_day&timezone=Africa%2FBrazzaville'
    const response = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error('Weather service unavailable')
    const data = await response.json()
    const current = data.current
    if (!Number.isFinite(current?.temperature_2m) || !Number.isFinite(current?.weather_code)) throw new Error('Invalid weather data')
    return NextResponse.json({ temperature: Math.round(current.temperature_2m), code: current.weather_code, isDay: current.is_day === 1 })
  } catch {
    return NextResponse.json({ temperature: null, code: null, isDay: null }, { status: 503 })
  }
}
