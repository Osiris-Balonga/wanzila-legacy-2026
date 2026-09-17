'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Car, Clock, MapPin, Navigation, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Pharmacy } from '@/types/database'

export interface RouteInfo {
  distance: number
  duration: number
  coordinates: [number, number][]
}

interface Props {
  destination: Pharmacy
  onClose: () => void
  onRouteCalculated: (route: RouteInfo | null) => void
  onUserPositionFound: (position: [number, number] | null) => void
}

export function NavigationOverlay({ destination, onClose, onRouteCalculated, onUserPositionFound }: Props) {
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    onRouteCalculated(null)
    onUserPositionFound(null)
    setRoute(null)
    setError(null)
    setLoading(true)

    const fail = (message: string) => {
      if (!active) return
      setError(message)
      setRoute(null)
      onRouteCalculated(null)
      setLoading(false)
    }

    if (!navigator.geolocation) {
      fail('La géolocalisation est indisponible sur ce navigateur.')
      return () => { active = false }
    }

    navigator.geolocation.getCurrentPosition(async position => {
      if (!active) return
      const origin: [number, number] = [position.coords.latitude, position.coords.longitude]
      onUserPositionFound(origin)
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`
        const timeout = setTimeout(() => controller.abort(), 12000)
        let response: Response
        try { response = await fetch(url, { signal: controller.signal }) }
        finally { clearTimeout(timeout) }
        if (!response.ok) throw new Error('OSRM indisponible')
        const data = await response.json()
        const result = data.routes?.[0]
        const points = result?.geometry?.coordinates
        if (data.code !== 'Ok' || !Array.isArray(points) || points.length < 2
          || !Number.isFinite(result.distance) || !Number.isFinite(result.duration)) {
          throw new Error('Aucun trajet routier trouvé')
        }
        const calculated: RouteInfo = {
          distance: result.distance,
          duration: result.duration,
          coordinates: points.map(([longitude, latitude]: [number, number]) => [latitude, longitude]),
        }
        if (!active) return
        setRoute(calculated)
        onRouteCalculated(calculated)
        setLoading(false)
      } catch {
        fail("Le trajet routier n'a pas pu être calculé. Réessayez plus tard.")
      }
    }, () => fail("Position indisponible. Autorisez la géolocalisation puis réessayez."), {
      enableHighAccuracy: true, timeout: 12000, maximumAge: 0,
    })

    return () => { active = false; controller.abort() }
  }, [destination.id, attempt, onRouteCalculated, onUserPositionFound])

  return (
    <div className="absolute top-3 left-3 right-3 sm:right-auto z-[1010] bg-white rounded-lg shadow-lg border border-gray-200 sm:max-w-sm">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-start gap-2 min-w-0">
            <Navigation className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-sm">Itinéraire vers</h3>
              <p className="text-xs text-gray-600 truncate">{destination.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fermer l'itinéraire"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center gap-2 text-sm mb-3"><Car className="h-4 w-4" /> Voiture</div>
        {loading && <p className="text-sm text-gray-600 py-2">Calcul du trajet routier…</p>}
        {error && (
          <div role="alert" className="flex gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 mb-3">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
        {route && !loading && (
          <div className="space-y-2 text-sm mb-3">
            <div className="flex justify-between p-2 bg-gray-50 rounded"><span className="flex items-center gap-2"><MapPin className="h-4 w-4" />Distance</span><strong>{(route.distance / 1000).toFixed(1)} km</strong></div>
            <div className="flex justify-between p-2 bg-gray-50 rounded"><span className="flex items-center gap-2"><Clock className="h-4 w-4" />Durée OSRM</span><strong>{Math.round(route.duration / 60)} min</strong></div>
          </div>
        )}
        {error && <Button variant="outline" size="sm" className="w-full mb-2" onClick={() => setAttempt(value => value + 1)}>Réessayer</Button>}
        <Button variant="outline" size="sm" className="w-full" onClick={onClose}>Fermer l'itinéraire</Button>
      </div>
    </div>
  )
}
