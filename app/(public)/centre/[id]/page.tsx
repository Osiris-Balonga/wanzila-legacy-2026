'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Map } from '@/components/ui/map'
import { NavigationOverlay, type RouteInfo } from '@/components/navigation/NavigationOverlay'
import { CATEGORY_LABELS } from '@/lib/constants'
import { isOnDuty } from '@/lib/pharmacies'
import type { Pharmacy } from '@/types/database'

export default function CentrePage() {
  const params = useParams()
  const id = params.id as string
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [navigation, setNavigation] = useState(false)
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [position, setPosition] = useState<[number, number] | null>(null)
  const onRouteCalculated = useCallback((value: RouteInfo | null) => setRoute(value), [])
  const onUserPositionFound = useCallback((value: [number, number] | null) => setPosition(value), [])

  useEffect(() => {
    setLoading(true)
    fetch(`/data/pharmacies/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? 'Pharmacie non trouvée.' : 'Impossible de charger cette pharmacie.')
        return response.json()
      }).then(setPharmacy).catch(reason => setError(reason.message)).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="container mx-auto px-4 py-12">Chargement de la fiche…</div>
  if (error || !pharmacy) return <div className="container mx-auto px-4 py-12"><h1 className="text-2xl font-bold mb-2">Pharmacie non trouvée</h1><p>{error}</p><Link className="text-primary" href="/recherche">Retour à la recherche</Link></div>

  return (
    <div className="bg-background">
      <div className="bg-card border-b"><div className="container mx-auto px-4 py-4"><Button asChild variant="ghost" size="sm"><Link href="/recherche"><ArrowLeft className="h-4 w-4 mr-2" />Retour à la recherche</Link></Button></div></div>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-3">{pharmacy.name}</h1>
          <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-md font-medium">{CATEGORY_LABELS[pharmacy.category]}</span>
          {isOnDuty(pharmacy) && <span className="inline-block ml-2 px-3 py-1 bg-primary text-white rounded-md">Garde confirmée</span>}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card><CardHeader><CardTitle>Localisation</CardTitle></CardHeader><CardContent>
              <div className="relative">
                <Map pharmacies={[pharmacy]} route={route} userPosition={position} height="min(60vh, 500px)" className="rounded-lg overflow-hidden" />
                {navigation && <NavigationOverlay destination={pharmacy} onClose={() => { setNavigation(false); setRoute(null); setPosition(null) }}
                  onRouteCalculated={onRouteCalculated} onUserPositionFound={onUserPositionFound} />}
              </div>
              <Button className="mt-4 w-full sm:w-auto" onClick={() => setNavigation(true)}><Navigation className="h-4 w-4 mr-2" />Itinéraire</Button>
            </CardContent></Card>
          </div>
          <div className="space-y-6">
            <Card><CardHeader><CardTitle>Contact & localisation</CardTitle></CardHeader><CardContent>
              <p className="flex items-start gap-2"><MapPin className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />{pharmacy.full_address}, {pharmacy.city}</p>
              <p className="text-sm text-muted-foreground mt-4">Téléphone et horaires non renseignés.</p>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Source des données</CardTitle></CardHeader><CardContent className="text-sm space-y-3">
              <p>Nom et coordonnées issus d’OpenStreetMap. L’existence actuelle, les horaires et la garde restent à vérifier.</p>
              <p>Une pharmacie « de nuit » est ainsi nommée dans la source ; cela ne confirme pas une garde en cours.</p>
              <a href={pharmacy.source_url} target="_blank" rel="noreferrer" className="text-primary underline">Voir la fiche OpenStreetMap</a>
            </CardContent></Card>
          </div>
        </div>
      </div>
    </div>
  )
}
