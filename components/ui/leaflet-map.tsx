'use client'

import { useEffect } from 'react'
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import Link from 'next/link'
import 'leaflet/dist/leaflet.css'
import { MAP_CONFIG } from '@/lib/constants'
import type { MapProps } from './map'

const pharmacyIcon = L.divIcon({
  className: 'wanzila-marker',
  html: '<span style="display:grid;place-items:center;width:32px;height:32px;border:3px solid white;border-radius:50%;background:#6d28d9;color:white;box-shadow:0 2px 8px #0005;font-size:18px">✚</span>',
  iconSize: [32, 32], iconAnchor: [16, 16],
})
const userIcon = L.divIcon({
  className: 'wanzila-user-marker',
  html: '<span style="display:block;width:17px;height:17px;border:3px solid white;border-radius:50%;background:#2563eb;box-shadow:0 2px 8px #0005"></span>',
  iconSize: [17, 17], iconAnchor: [9, 9],
})

function MapBounds({ route, pharmacies }: Pick<MapProps, 'route' | 'pharmacies'>) {
  const map = useMap()
  useEffect(() => {
    if (route?.coordinates && route.coordinates.length > 1) {
      const mobile = map.getSize().x < 640
      map.fitBounds(L.latLngBounds(route.coordinates), mobile
        ? { paddingTopLeft: [20, 260], paddingBottomRight: [20, 24], maxZoom: 16 }
        : { padding: [36, 36], maxZoom: 16 })
    } else if (pharmacies.length > 0) {
      map.fitBounds(L.latLngBounds(pharmacies.map(p => [p.latitude, p.longitude])), { padding: [36, 36], maxZoom: 15 })
    }
  }, [map, route, pharmacies])
  return null
}

export function LeafletMap({ pharmacies, route, userPosition, height = '500px', className = '', onMarkerClick }: MapProps) {
  return (
    <div className={className} style={{ height }}>
      <MapContainer center={MAP_CONFIG.defaultCenter} zoom={MAP_CONFIG.defaultZoom} className="w-full h-full rounded-lg">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBounds route={route} pharmacies={pharmacies} />
        {pharmacies.map(pharmacy => (
          <Marker key={pharmacy.id} position={[pharmacy.latitude, pharmacy.longitude]} icon={pharmacyIcon}
            eventHandlers={onMarkerClick ? { click: () => onMarkerClick(pharmacy) } : undefined}>
            {!onMarkerClick && <Popup><strong>{pharmacy.name}</strong><br /><Link href={`/centre/${pharmacy.id}`}>Voir la fiche</Link></Popup>}
          </Marker>
        ))}
        {userPosition && <Marker position={userPosition} icon={userIcon}><Popup>Votre position</Popup></Marker>}
        {route && <Polyline positions={route.coordinates} pathOptions={{ color: '#6d28d9', weight: 6, opacity: 0.9 }} />}
      </MapContainer>
    </div>
  )
}
