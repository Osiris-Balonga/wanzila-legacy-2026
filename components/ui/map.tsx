'use client'

import dynamic from 'next/dynamic'
import type { Pharmacy } from '@/types/database'
import type { RouteInfo } from '@/components/navigation/NavigationOverlay'

export interface MapProps {
  pharmacies: Pharmacy[]
  route?: RouteInfo | null
  userPosition?: [number, number] | null
  height?: string
  className?: string
  onMarkerClick?: (pharmacy: Pharmacy) => void
}

export const Map = dynamic<MapProps>(() => import('./leaflet-map').then(module => module.LeafletMap), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center bg-gray-100 rounded-lg h-full min-h-[320px]">Chargement de la carte…</div>,
})
