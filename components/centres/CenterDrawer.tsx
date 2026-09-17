'use client'

import Link from 'next/link'
import { MapPin, Navigation } from 'lucide-react'
import { Drawer } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { CATEGORY_LABELS } from '@/lib/constants'
import { isOnDuty } from '@/lib/pharmacies'
import type { Pharmacy } from '@/types/database'

interface Props {
  pharmacy: Pharmacy | null
  onClose: () => void
  onItinerary: (pharmacy: Pharmacy) => void
}

export function CenterDrawer({ pharmacy, onClose, onItinerary }: Props) {
  return (
    <Drawer isOpen={!!pharmacy} onClose={onClose} title={pharmacy?.name} side="left">
      {pharmacy && <div className="p-4 space-y-5">
        <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-md text-sm">{CATEGORY_LABELS[pharmacy.category]}</span>
        <p className="flex gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0" />{pharmacy.full_address}, {pharmacy.city}</p>
        <p className="text-sm text-muted-foreground">{isOnDuty(pharmacy) ? 'Garde confirmée pour la période en cours.' : 'Horaires et garde non vérifiés.'}</p>
        <Button asChild className="w-full"><Link href={`/centre/${pharmacy.id}`}>Voir tous les détails</Link></Button>
        <Button variant="outline" className="w-full" onClick={() => { onClose(); onItinerary(pharmacy) }}><Navigation className="h-4 w-4 mr-2" />Itinéraire</Button>
      </div>}
    </Drawer>
  )
}
