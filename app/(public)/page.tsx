'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Search, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function HomePage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const router = useRouter()
  const search = () => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (category !== 'all') params.set('category', category)
    router.push(`/recherche?${params}`)
  }

  return (
    <div>
      <section className="bg-gradient-to-b from-primary/10 to-background py-20">
        <div className="container mx-auto px-4 text-center max-w-4xl">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">Trouvez une pharmacie à Brazzaville</h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-12">Recherchez, consultez la fiche et affichez un itinéraire routier sur la carte.</p>
          <form onSubmit={event => { event.preventDefault(); search() }} className="bg-white rounded-lg shadow-lg border overflow-hidden md:flex">
            <label className="flex-1 block text-left px-4 py-3 border-b md:border-b-0 md:border-r">
              <span className="block text-xs text-gray-500 mb-1">Que recherchez-vous ?</span>
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nom ou adresse"
                className="w-full outline-none text-sm" />
            </label>
            <label className="block text-left px-4 py-3 border-b md:border-b-0 md:border-r md:w-60">
              <span className="block text-xs text-gray-500 mb-1">Catégorie</span>
              <select value={category} onChange={event => setCategory(event.target.value)} className="w-full bg-transparent text-sm outline-none">
                <option value="all">Toutes les pharmacies</option>
                <option value="pharmacy">Pharmacies</option>
                <option value="night_pharmacy">Pharmacies de nuit</option>
                <option value="on_duty">Gardes confirmées</option>
              </select>
            </label>
            <Button type="submit" className="w-full md:w-auto h-14 rounded-none px-8"><Search className="h-4 w-4 mr-2" />Rechercher</Button>
          </form>
          <p className="text-sm text-muted-foreground mt-4">Les horaires et gardes des données de démonstration ne sont pas vérifiés.</p>
        </div>
      </section>
      <section className="container mx-auto px-4 py-16 grid gap-8 md:grid-cols-3">
        <div className="text-center"><Search className="h-10 w-10 text-primary mx-auto mb-4" /><h2 className="font-semibold text-xl mb-2">Rechercher</h2><p className="text-muted-foreground">Filtrez par nom ou catégorie.</p></div>
        <div className="text-center"><MapPin className="h-10 w-10 text-primary mx-auto mb-4" /><h2 className="font-semibold text-xl mb-2">Consulter</h2><p className="text-muted-foreground">Ouvrez une fiche et sa position sur la carte.</p></div>
        <div className="text-center"><Navigation className="h-10 w-10 text-primary mx-auto mb-4" /><h2 className="font-semibold text-xl mb-2">Se rendre sur place</h2><p className="text-muted-foreground">Affichez un trajet routier après avoir autorisé votre position.</p></div>
      </section>
    </div>
  )
}
