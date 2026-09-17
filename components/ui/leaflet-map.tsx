'use client'

import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAP_CONFIG } from '@/lib/constants'
import { getAvailability, hasCoordinates } from '@/lib/pharmacies'
import type { MapProps } from './map'

const marker = (pharmacy: MapProps['pharmacies'][number], selected: boolean) => L.icon({
  iconUrl: pharmacy.category === 'night_pharmacy' ? '/markers/night.webp' : '/markers/day.webp',
  className: `wanzila-pin${selected ? ' is-selected' : ''}${getAvailability(pharmacy) === 'closed' ? ' is-closed' : ''}`,
  iconSize: [58, 60], iconAnchor: [29, 53],
})
const userIcon = L.divIcon({
  className: 'wanzila-user-location',
  html: '<span class="wanzila-user-location__pulse"></span><span class="wanzila-user-location__dot"></span>',
  iconSize: [44, 44], iconAnchor: [22, 22],
})

function MapCamera({ route, pharmacies, resetKey, restoreView }: Pick<MapProps, 'route' | 'pharmacies' | 'resetKey' | 'restoreView'>) {
  const map = useMap()
  useEffect(() => { map.invalidateSize() }, [map])
  useEffect(() => {
    if (restoreView) {
      map.flyTo(restoreView.center, restoreView.zoom, { duration: 0.35 })
    } else if (route?.coordinates && route.coordinates.length > 1) {
      const mobile = map.getSize().x < 720
      map.fitBounds(L.latLngBounds(route.coordinates), mobile
        ? { paddingTopLeft: [30, 125], paddingBottomRight: [30, Math.min(405, Math.max(185, map.getSize().y - 190))], maxZoom: 15 }
        : { padding: [56, 56], maxZoom: 16 })
    } else {
      const points = pharmacies.filter(hasCoordinates)
      if (map.getSize().x < 720 && points.length > 5) map.setView([-4.263, 15.268], 13, { animate: false })
      else if (points.length) map.fitBounds(L.latLngBounds(points.map(p => [p.latitude, p.longitude])), { padding: [48, 48], maxZoom: 14 })
    }
  }, [map, route, pharmacies, resetKey, restoreView])
  return null
}

function ViewportReporter({ onViewportChange }: Pick<MapProps, 'onViewportChange'>) {
  const map = useMapEvents({ moveend: () => { const center = map.getCenter(); onViewportChange?.({ center: [center.lat, center.lng], zoom: map.getZoom() }) } })
  return null
}

export function LeafletMap({ pharmacies, route, userPosition, height = '100%', className = '', onMarkerClick, focusPharmacy, tileStyle = 'standard', resetKey, restoreView, onViewportChange }: MapProps) {
  return <div className={className} style={{ height }}>
    <MapContainer center={MAP_CONFIG.defaultCenter} zoom={MAP_CONFIG.defaultZoom} className="h-full w-full" zoomControl={false}>
      <TileLayer
        key={tileStyle}
        attribution={tileStyle === 'standard'
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://www.hotosm.org/">HOT</a>'}
        url={tileStyle === 'standard' ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' : 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'}
      />
      <MapCamera pharmacies={pharmacies} route={route} resetKey={resetKey} restoreView={restoreView} />
      <ViewportReporter onViewportChange={onViewportChange} />
      {pharmacies.filter(hasCoordinates).map(pharmacy => <Marker
        key={pharmacy.id}
        position={[pharmacy.latitude, pharmacy.longitude]}
        icon={marker(pharmacy, pharmacy.id === focusPharmacy?.id)}
        eventHandlers={{ click: () => onMarkerClick?.(pharmacy) }}
      />)}
      {userPosition && <Marker position={userPosition} icon={userIcon} title="Votre position" />}
      {route && <Polyline positions={route.coordinates} pathOptions={{ color: '#6537e9', weight: 6, opacity: 0.9 }} />}
    </MapContainer>
  </div>
}
