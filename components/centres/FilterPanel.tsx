'use client'

import { Filter, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SearchFilters } from '@/types/database'

interface Props {
  filters: SearchFilters
  onChange: (filters: SearchFilters) => void
  onClose?: () => void
}

export function FilterPanel({ filters, onChange, onClose }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filtrer votre recherche</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <label className="block text-sm font-medium">
          Recherche
          <span className="relative block mt-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input className="w-full h-10 pl-10 pr-3 border border-input rounded-md" placeholder="Nom ou adresse"
              value={filters.query} onChange={event => onChange({ ...filters, query: event.target.value })} />
          </span>
        </label>
        <label className="block text-sm font-medium">
          Catégorie
          <select className="block w-full h-10 px-3 mt-2 border border-input rounded-md bg-background"
            value={filters.category} onChange={event => onChange({ ...filters, category: event.target.value as SearchFilters['category'] })}>
            <option value="all">Toutes les pharmacies</option>
            <option value="pharmacy">Pharmacies</option>
            <option value="night_pharmacy">Pharmacies de nuit (nom OSM)</option>
            <option value="on_duty">Gardes confirmées</option>
          </select>
        </label>
        <p className="text-xs text-muted-foreground">Les horaires et gardes de ces établissements restent à confirmer.</p>
        <Button variant="outline" className="w-full" onClick={() => onChange({ query: '', category: 'all' })}>Réinitialiser</Button>
        {onClose && <Button className="w-full" onClick={onClose}>Voir les résultats</Button>}
      </CardContent>
    </Card>
  )
}
