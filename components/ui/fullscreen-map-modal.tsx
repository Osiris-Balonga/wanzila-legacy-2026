'use client'

import { useCallback, useEffect, useState } from 'react'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Map } from '@/components/ui/map'
import { FilterPanel } from '@/components/centres/FilterPanel'
import { CenterDrawer } from '@/components/centres/CenterDrawer'
import { NavigationOverlay, type RouteInfo } from '@/components/navigation/NavigationOverlay'
import type { Pharmacy, SearchFilters } from '@/types/database'

interface Props {
  isOpen: boolean
  onClose: () => void
  pharmacies: Pharmacy[]
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
}

export function FullscreenMapModal({ isOpen, onClose, pharmacies, filters, onFiltersChange }: Props) {
  const [selected, setSelected] = useState<Pharmacy | null>(null)
  const [destination, setDestination] = useState<Pharmacy | null>(null)
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const onRouteCalculated = useCallback((value: RouteInfo | null) => setRoute(value), [])
  const onUserPositionFound = useCallback((value: [number, number] | null) => setPosition(value), [])

  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [isOpen])

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <h2 className="font-semibold text-lg truncate">Carte des pharmacies</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowFilters(true)}><Filter className="h-4 w-4 mr-1" />Filtres</Button>
          <Button size="sm" variant="outline" onClick={onClose} aria-label="Fermer la carte"><X className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        <Map pharmacies={pharmacies} route={route} userPosition={position} height="100%" className="w-full h-full" onMarkerClick={setSelected} />
        {destination && <NavigationOverlay destination={destination} onClose={() => { setDestination(null); setRoute(null); setPosition(null) }}
          onRouteCalculated={onRouteCalculated} onUserPositionFound={onUserPositionFound} />}
      </div>
      <CenterDrawer pharmacy={selected} onClose={() => setSelected(null)} onItinerary={setDestination} />
      {showFilters && <div className="fixed inset-0 z-[10002] bg-white overflow-y-auto p-4">
        <FilterPanel filters={filters} onChange={onFiltersChange} onClose={() => setShowFilters(false)} />
      </div>}
    </div>
  )
}
