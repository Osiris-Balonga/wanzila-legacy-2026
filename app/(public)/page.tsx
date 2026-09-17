'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Bookmark, Layers2, MapPin, RotateCcw, Search, SlidersHorizontal, X, PlusCircle } from 'lucide-react'
import { Map } from '@/components/ui/map'
import { PharmacyDetails, type RouteState } from '@/components/wanzila/PharmacyDetails'
import { PharmacyRow } from '@/components/wanzila/PharmacyRow'
import { filterPharmacies, hasCoordinates, loadPharmacies } from '@/lib/pharmacies'
import type { Pharmacy, SearchFilters } from '@/types/database'
import type { RouteInfo } from '@/types/route'

type Tab = 'map' | 'saved' | 'contribute'
type SheetSize = 'peek' | 'full'
const STORAGE_KEY = 'wanzila:saved:v1'

const tabs: { id: Tab; label: string; Icon: typeof MapPin }[] = [
  { id: 'map', label: 'Carte', Icon: MapPin },
  { id: 'saved', label: 'Enregistrés', Icon: Bookmark },
  { id: 'contribute', label: 'Contribuer', Icon: PlusCircle },
]

function SearchControls({ filters, onChange, pharmacies, mobile = false }: {
  filters: SearchFilters
  onChange: (filters: SearchFilters) => void
  pharmacies: Pharmacy[]
  mobile?: boolean
}) {
  const neighborhoods = useMemo(() => [...new Set(pharmacies.map(p => p.neighborhood).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'fr')), [pharmacies])
  const boroughs = useMemo(() => [...new Set(pharmacies.map(p => p.borough).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'fr')), [pharmacies])
  return <div className={`search-controls${mobile ? ' search-controls--mobile' : ''}`}>
    <label className="search-field">
      <Search size={21} aria-hidden="true" />
      <span className="sr-only">Rechercher une pharmacie ou un quartier</span>
      <input value={filters.query} onChange={event => onChange({ ...filters, query: event.target.value })} placeholder="Rechercher une pharmacie, un quartier…" />
      {filters.query && <button aria-label="Effacer la recherche" onClick={() => onChange({ ...filters, query: '' })}><X size={17} /></button>}
      {mobile && <Image className="mobile-search__brand" src="/brand-app-icon.png" width={34} height={34} alt="Wanzila" priority />}
    </label>
    <div className="filter-strip" aria-label="Filtres de recherche">
      <button className={`filter-chip${filters.category === 'night_pharmacy' ? ' is-active' : ''}`} onClick={() => onChange({ ...filters, category: filters.category === 'night_pharmacy' ? 'all' : 'night_pharmacy' })} aria-pressed={filters.category === 'night_pharmacy'}><SlidersHorizontal size={15} /> De nuit*</button>
      <label className="filter-chip filter-chip--select"><MapPin size={15} /><span className="sr-only">Quartier</span><select value={filters.neighborhood || ''} onChange={event => onChange({ ...filters, neighborhood: event.target.value })}><option value="">Quartier</option>{neighborhoods.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="filter-chip filter-chip--select"><span className="sr-only">Arrondissement</span><select value={filters.borough || ''} onChange={event => onChange({ ...filters, borough: event.target.value })}><option value="">Arrondissement</option>{boroughs.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
  </div>
}

export default function HomePage() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filters, setFilters] = useState<SearchFilters>({ query: '', category: 'all' })
  const [tab, setTab] = useState<Tab>('map')
  const [selected, setSelected] = useState<Pharmacy | null>(null)
  const [sheetSize, setSheetSize] = useState<SheetSize>('peek')
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [storageReady, setStorageReady] = useState(false)
  const [tileStyle, setTileStyle] = useState<'standard' | 'humanitarian'>('standard')
  const [mapReset, setMapReset] = useState(0)
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [routeState, setRouteState] = useState<RouteState>({ status: 'idle' })
  const requestRef = useRef(0)
  const dragStart = useRef<number | null>(null)
  const previousSheetOpen = useRef(false)

  useEffect(() => {
    loadPharmacies().then(setPharmacies).catch(error => setLoadError(error.message)).finally(() => setLoading(false))
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      if (Array.isArray(value)) setSavedIds(value.filter((id): id is string => typeof id === 'string'))
    } catch { /* Ignore damaged or blocked local storage. */ }
    setStorageReady(true)
  }, [])

  useEffect(() => {
    if (storageReady) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(savedIds)) } catch { /* Saving remains optional on restricted browsers. */ }
    }
  }, [savedIds, storageReady])

  useEffect(() => {
    if (!pharmacies.length) return
    const id = new URLSearchParams(window.location.search).get('pharmacy')
    const match = pharmacies.find(item => item.id === id)
    if (match) { setSelected(match); setSheetSize('peek') }
  }, [pharmacies])

  const visible = useMemo(() => filterPharmacies(pharmacies, filters), [pharmacies, filters])
  const saved = useMemo(() => pharmacies.filter(pharmacy => savedIds.includes(pharmacy.id)), [pharmacies, savedIds])
  const mapPharmacies = useMemo(() => (tab === 'map' ? visible : pharmacies).filter(hasCoordinates), [tab, visible, pharmacies])
  const focused = mapReset > 0 ? null : selected

  const clearRoute = useCallback(() => {
    requestRef.current += 1
    setRoute(null)
    setPosition(null)
    setRouteState({ status: 'idle' })
  }, [])

  const openPharmacy = useCallback((pharmacy: Pharmacy) => {
    clearRoute()
    setSelected(pharmacy)
    setMapReset(0)
    setSheetSize('peek')
    setTab('map')
  }, [clearRoute])

  const selectTab = (next: Tab) => {
    clearRoute()
    setSelected(null)
    setTab(next)
    setSheetSize('peek')
  }

  const toggleSaved = (id: string) => setSavedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])

  const startRoute = useCallback(async (pharmacy: Pharmacy) => {
    if (!hasCoordinates(pharmacy)) return
    const requestId = ++requestRef.current
    setSelected(pharmacy)
    setTab('map')
    setSheetSize('peek')
    setMapReset(0)
    setRoute(null)
    setPosition(null)
    setRouteState({ status: 'loading' })
    try {
      if (!navigator.geolocation) throw new Error('La géolocalisation est indisponible sur ce navigateur.')
      const location = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }))
      if (requestId !== requestRef.current) return
      const origin: [number, number] = [location.coords.latitude, location.coords.longitude]
      setPosition(origin)
      const url = `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${pharmacy.longitude},${pharmacy.latitude}?overview=full&geometries=geojson`
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (!response.ok) throw new Error('Le service d’itinéraire est indisponible.')
      const data = await response.json()
      const result = data.routes?.[0]
      const coordinates = result?.geometry?.coordinates
      if (data.code !== 'Ok' || !Array.isArray(coordinates) || coordinates.length < 2 || !Number.isFinite(result.distance) || !Number.isFinite(result.duration)) throw new Error('Aucun trajet routier trouvé.')
      if (requestId !== requestRef.current) return
      setRoute({ distance: result.distance, duration: result.duration, coordinates: coordinates.map(([longitude, latitude]: [number, number]) => [latitude, longitude]) })
      setRouteState({ status: 'ready' })
    } catch (error) {
      if (requestId !== requestRef.current) return
      setRoute(null)
      const isLocationError = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number'
      setRouteState({ status: 'error', message: isLocationError ? 'Position indisponible. Autorisez la géolocalisation puis réessayez.' : error instanceof Error ? error.message : 'Le trajet n’a pas pu être calculé.' })
    }
  }, [])

  const details = selected && <PharmacyDetails pharmacy={selected} saved={savedIds.includes(selected.id)} onSave={() => toggleSaved(selected.id)} onClose={() => { clearRoute(); setSelected(null) }} onRoute={() => startRoute(selected)} route={route} routeState={routeState} />
  const selectedSheet = selected && <PharmacyDetails pharmacy={selected} saved={savedIds.includes(selected.id)} onSave={() => toggleSaved(selected.id)} onClose={() => { clearRoute(); setSelected(null) }} onRoute={() => startRoute(selected)} route={route} routeState={routeState} compact={sheetSize === 'peek'} />

  const list = tab === 'saved' ? saved : visible
  const listTitle = tab === 'saved' ? 'Mes pharmacies enregistrées' : 'Pharmacies à Brazzaville'
  const sheetOpen = Boolean(selected) || tab !== 'map'

  useEffect(() => {
    if (previousSheetOpen.current === sheetOpen) return
    previousSheetOpen.current = sheetOpen
    if (!window.matchMedia('(max-width: 900px)').matches) return
    requestAnimationFrame(() => {
      const target = sheetOpen
        ? document.querySelector<HTMLButtonElement>('.mobile-sheet button[aria-label^="Fermer"]')
        : document.querySelector<HTMLButtonElement>('.mobile-tabs button.is-active')
      target?.focus()
    })
  }, [sheetOpen])

  return <div className="wanzila-app">
    <nav className="desktop-rail" aria-label="Navigation principale">
      <div className="brand"><Image className="brand__image" src="/brand-app-icon.png" width={50} height={50} alt="Logo Wanzila" priority /><strong>Wanzila</strong></div>
      <div className="desktop-rail__tabs">{tabs.map(({ id, label, Icon }) => <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => selectTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon size={21} fill={id === 'saved' && tab === id ? 'currentColor' : 'none'} /><span>{label}</span></button>)}</div>
      <span className="desktop-rail__city"><MapPin size={15} /> Brazzaville</span>
    </nav>

    <aside className="desktop-panel" aria-label={selected ? 'Fiche pharmacie' : listTitle}>
      {selected && tab === 'map' ? <div className="desktop-panel__inner"><button className="back-link" onClick={() => { clearRoute(); setSelected(null) }}>← Retour aux résultats</button>{details}</div>
        : tab === 'contribute' ? <div className="desktop-panel__inner coming-soon"><span className="coming-soon__icon"><PlusCircle size={28} /></span><h1>Contribuer</h1><p>Disponible prochainement</p><span>Vous pourrez bientôt proposer des informations pour améliorer la carte.</span></div>
          : <><div className="desktop-panel__head"><SearchControls filters={filters} onChange={setFilters} pharmacies={pharmacies} /><div className="panel-heading"><div><h1>{listTitle}</h1><p>{tab === 'saved' ? `${saved.length} pharmacie${saved.length > 1 ? 's' : ''} enregistrée${saved.length > 1 ? 's' : ''} sur cet appareil` : `${visible.length} pharmacie${visible.length > 1 ? 's' : ''} · ${visible.filter(hasCoordinates).length} sur la carte`}</p></div></div></div><div className="desktop-panel__list">{loading && <p className="panel-note">Chargement des pharmacies…</p>}{loadError && <p className="panel-error" role="alert">{loadError}</p>}{!loading && !loadError && list.length === 0 && <p className="panel-note">{tab === 'saved' ? 'Aucune pharmacie enregistrée. Touchez le signet d’une fiche pour la retrouver ici.' : 'Aucune pharmacie trouvée. Modifiez votre recherche.'}</p>}{list.map(pharmacy => <PharmacyRow key={pharmacy.id} pharmacy={pharmacy} saved={savedIds.includes(pharmacy.id)} onOpen={() => openPharmacy(pharmacy)} onSave={() => toggleSaved(pharmacy.id)} onRoute={() => startRoute(pharmacy)} />)}<p className="panel-footnote">* « De nuit » figure dans le nom OSM. Aucune garde actuelle n’est confirmée.</p></div></>}
    </aside>

    <main className="map-stage" aria-label="Carte des pharmacies de Brazzaville">
      <Map pharmacies={mapPharmacies} route={route} userPosition={position} focusPharmacy={focused} tileStyle={tileStyle} resetKey={mapReset} onMarkerClick={openPharmacy} height="100%" className="map-stage__map" />
      <div className="mobile-search"><SearchControls filters={filters} onChange={setFilters} pharmacies={pharmacies} mobile />{filters.query.trim() && !selected && tab === 'map' && <div className="mobile-search-results"><strong>{visible.length} résultat{visible.length > 1 ? 's' : ''}</strong>{visible.slice(0, 5).map(pharmacy => <button key={pharmacy.id} onClick={() => openPharmacy(pharmacy)}>{pharmacy.name}<span>{pharmacy.neighborhood || pharmacy.borough || 'Brazzaville'}</span></button>)}{visible.length === 0 && <p>Aucune pharmacie trouvée.</p>}</div>}</div>
      <div className="map-city"><MapPin size={15} /> Brazzaville</div>
      <div className="map-tools"><button aria-label="Recentrer la carte" title="Recentrer la carte" onClick={() => { clearRoute(); setSelected(null); setMapReset(value => value + 1) }}><RotateCcw size={21} /></button><button aria-label="Changer le fond de carte" title="Changer le fond de carte" onClick={() => setTileStyle(value => value === 'standard' ? 'humanitarian' : 'standard')}><Layers2 size={21} /></button></div>

      <div className={`mobile-sheet${selected ? ' is-detail' : ''}${selected && routeState.status !== 'idle' ? ' has-route-status' : ''}${sheetSize === 'full' ? ' is-full' : ''}${!sheetOpen ? ' is-hidden' : ''}`}>
        <div className="mobile-sheet__handle-zone" onPointerDown={event => { dragStart.current = event.clientY }} onPointerUp={event => { if (dragStart.current === null) return; const delta = event.clientY - dragStart.current; dragStart.current = null; if (delta < -45) setSheetSize('full'); if (delta > 45) { if (selected && sheetSize === 'peek') { clearRoute(); setSelected(null) } else setSheetSize('peek') } }}><button className="mobile-sheet__handle" aria-label={sheetSize === 'full' ? 'Réduire la fiche' : 'Développer la fiche'} onClick={() => setSheetSize(value => value === 'peek' ? 'full' : 'peek')} /></div>
        <div className="mobile-sheet__content">{selected ? selectedSheet : tab === 'saved' ? <div className="mobile-sheet__list"><div className="panel-heading"><div><h1>Mes pharmacies enregistrées</h1><p>{saved.length} pharmacie{saved.length > 1 ? 's' : ''} sur cet appareil</p></div><button className="icon-button" aria-label="Fermer les enregistrés" onClick={() => selectTab('map')}><X size={20} /></button></div>{saved.length === 0 && <p className="panel-note">Aucune pharmacie enregistrée. Depuis la carte, ouvrez une fiche puis touchez Enregistrer.</p>}{saved.map(pharmacy => <PharmacyRow key={pharmacy.id} pharmacy={pharmacy} saved onOpen={() => openPharmacy(pharmacy)} onSave={() => toggleSaved(pharmacy.id)} onRoute={() => startRoute(pharmacy)} />)}</div> : <div className="coming-soon"><button className="icon-button coming-soon__close" aria-label="Fermer contribuer" onClick={() => selectTab('map')}><X size={20} /></button><span className="coming-soon__icon"><PlusCircle size={28} /></span><h1>Contribuer</h1><p>Disponible prochainement</p><span>Vous pourrez bientôt aider à enrichir la carte.</span></div>}</div>
      </div>
      <nav className={`mobile-tabs${sheetOpen ? ' is-hidden' : ''}`} aria-label="Navigation principale" aria-hidden={sheetOpen}>{tabs.map(({ id, label, Icon }) => <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => selectTab(id)} tabIndex={sheetOpen ? -1 : 0} aria-current={tab === id ? 'page' : undefined}><Icon size={22} fill={id === 'saved' && tab === id ? 'currentColor' : 'none'} /><span>{label}</span></button>)}</nav>
    </main>
  </div>
}
