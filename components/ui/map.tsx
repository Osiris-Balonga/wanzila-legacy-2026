'use client'

import dynamic from 'next/dynamic'
import type { Pharmacy } from '@/types/database'
import type { RouteInfo } from '@/types/route'

export interface MapProps {
  pharmacies: Pharmacy[]
  route?: RouteInfo | null
  userPosition?: [number, number] | null
  height?: string
  className?: string
  onMarkerClick?: (pharmacy: Pharmacy) => void
  focusPharmacy?: Pharmacy | null
  tileStyle?: 'standard' | 'humanitarian'
  resetKey?: number
  restoreView?: { center: [number, number]; zoom: number; key: number } | null
  onViewportChange?: (view: { center: [number, number]; zoom: number }) => void
}

export const Map = dynamic<MapProps>(() => import('./leaflet-map').then(module => module.LeafletMap), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-[320px] place-items-center bg-[#eef1f6] text-sm text-slate-600">Chargement de la carte…</div>,
})
