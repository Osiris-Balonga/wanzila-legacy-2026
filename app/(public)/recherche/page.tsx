'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ListIcon, MapIcon, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CentreCard } from '@/components/centres/CentreCard'
import { FilterPanel } from '@/components/centres/FilterPanel'
import { Map } from '@/components/ui/map'
import { FullscreenMapModal } from '@/components/ui/fullscreen-map-modal'
import { filterPharmacies, loadPharmacies } from '@/lib/pharmacies'
import type { Pharmacy, SearchFilters } from '@/types/database'

function SearchContent() {
  const params = useSearchParams()
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([])
  const [filters, setFilters] = useState<SearchFilters>({
    query: params.get('q') || '',
    category: (params.get('category') as SearchFilters['category']) || 'all',
  })
  const [view, setView] = useState<'list' | 'map'>('list')
  const [fullscreen, setFullscreen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadPharmacies().then(setPharmacies).catch(reason => setError(reason.message)).finally(() => setLoading(false))
  }, [])
  const results = useMemo(() => filterPharmacies(pharmacies, filters), [pharmacies, filters])

  return (
    <div className="bg-background">
      <div className="bg-card border-b"><div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">Recherche de pharmacies</h1>
        <p className="text-muted-foreground">{results.length} pharmacie{results.length > 1 ? 's' : ''} trouvée{results.length > 1 ? 's' : ''}</p>
      </div></div>
      <div className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="hidden lg:block"><FilterPanel filters={filters} onChange={setFilters} /></div>
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between gap-2 mb-6">
            <div className="flex gap-2">
              <Button size="sm" variant={view === 'list' ? 'default' : 'outline'} onClick={() => setView('list')}><ListIcon className="h-4 w-4 mr-2" />Liste</Button>
              <Button size="sm" variant={view === 'map' ? 'default' : 'outline'} onClick={() => setView('map')}><MapIcon className="h-4 w-4 mr-2" />Carte</Button>
            </div>
            <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setFilterOpen(true)}>Filtres</Button>
          </div>
          {loading && <p className="py-12 text-center">Chargement des pharmacies…</p>}
          {error && <div role="alert" className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}
          {!loading && !error && results.length === 0 && <div className="text-center py-12"><h2 className="font-semibold text-xl mb-2">Aucune pharmacie trouvée</h2>
            <p className="text-muted-foreground">{filters.category === 'on_duty' ? 'Aucune garde confirmée dans les données actuelles.' : 'Essayez de modifier vos critères.'}</p></div>}
          {!loading && !error && results.length > 0 && view === 'list' && <div className="grid gap-4">{results.map(pharmacy => <CentreCard key={pharmacy.id} pharmacy={pharmacy} />)}</div>}
          {!loading && !error && results.length > 0 && view === 'map' && <div className="relative">
            <Map pharmacies={results} height="min(65vh, 600px)" className="rounded-lg border overflow-hidden" />
            <Button className="absolute top-4 right-4 z-[1000]" onClick={() => setFullscreen(true)}><Maximize2 className="h-4 w-4 mr-2" />Plein écran</Button>
          </div>}
        </div>
      </div>
      {filterOpen && <div className="fixed inset-0 z-[2000] bg-white overflow-y-auto p-4"><FilterPanel filters={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} /></div>}
      <FullscreenMapModal isOpen={fullscreen} onClose={() => setFullscreen(false)} pharmacies={results} filters={filters} onFiltersChange={setFilters} />
    </div>
  )
}

export default function SearchPage() {
  return <Suspense fallback={<p className="p-8">Chargement…</p>}><SearchContent /></Suspense>
}
