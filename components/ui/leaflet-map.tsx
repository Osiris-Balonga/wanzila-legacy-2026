'use client'

import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAP_CONFIG } from '@/lib/constants'
import { hasCoordinates } from '@/lib/pharmacies'
import type { MapProps } from './map'

const marker = (selected: boolean) => L.divIcon({
  className: `wanzila-pin${selected ? ' is-selected' : ''}`,
  html: '<span class="wanzila-pin__head"><span class="wanzila-pin__cross">+</span></span>',
  iconSize: [42, 52], iconAnchor: [21, 50],
})
const userIcon = L.divIcon({
  className: 'wanzila-user-pin',
  html: '<span></span>',
  iconSize: [32, 32], iconAnchor: [16, 16],
})

function MapCamera({ route, pharmacies, focusPharmacy, resetKey }: Pick<MapProps, 'route' | 'pharmacies' | 'focusPharmacy' | 'resetKey'>) {
  const map = useMap()
  useEffect(() => { map.invalidateSize() }, [map])
  useEffect(() => {
    if (route?.coordinates && route.coordinates.length > 1) {
      const mobile = map.getSize().x < 720
      map.fitBounds(L.latLngBounds(route.coordinates), mobile
        ? { paddingTopLeft: [30, 125], paddingBottomRight: [30, 305], maxZoom: 15 }
        : { padding: [56, 56], maxZoom: 16 })
    } else if (focusPharmacy && hasCoordinates(focusPharmacy)) {
      map.flyTo([focusPharmacy.latitude, focusPharmacy.longitude], Math.max(map.getZoom(), 14), { duration: 0.45 })
    } else {
      const points = pharmacies.filter(hasCoordinates)
      if (map.getSize().x < 720 && points.length > 5) map.setView([-4.263, 15.268], 13, { animate: false })
      else if (points.length) map.fitBounds(L.latLngBounds(points.map(p => [p.latitude, p.longitude])), { padding: [48, 48], maxZoom: 14 })
    }
  }, [map, route, pharmacies, focusPharmacy, resetKey])
  return null
}

export function LeafletMap({ pharmacies, route, userPosition, height = '100%', className = '', onMarkerClick, focusPharmacy, tileStyle = 'standard', resetKey }: MapProps) {
  return <div className={className} style={{ height }}>
    <MapContainer center={MAP_CONFIG.defaultCenter} zoom={MAP_CONFIG.defaultZoom} className="h-full w-full" zoomControl={false}>
      <TileLayer
        key={tileStyle}
        attribution={tileStyle === 'standard'
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://www.hotosm.org/">HOT</a>'}
        url={tileStyle === 'standard' ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' : 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'}
      />
      <MapCamera pharmacies={pharmacies} route={route} focusPharmacy={focusPharmacy} resetKey={resetKey} />
      {pharmacies.filter(hasCoordinates).map(pharmacy => <Marker
        key={pharmacy.id}
        position={[pharmacy.latitude, pharmacy.longitude]}
        icon={marker(pharmacy.id === focusPharmacy?.id)}
        eventHandlers={{ click: () => onMarkerClick?.(pharmacy) }}
      />)}
      {userPosition && <Marker position={userPosition} icon={userIcon} />}
      {route && <Polyline positions={route.coordinates} pathOptions={{ color: '#6537e9', weight: 6, opacity: 0.9 }} />}
    </MapContainer>
  </div>
}
