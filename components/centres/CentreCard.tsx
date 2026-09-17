import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CATEGORY_LABELS } from '@/lib/constants'
import { isOnDuty } from '@/lib/pharmacies'
import type { Pharmacy } from '@/types/database'

export function CentreCard({ pharmacy }: { pharmacy: Pharmacy }) {
  return (
    <Link href={`/centre/${pharmacy.id}`} className="block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <h3 className="font-semibold text-lg">{pharmacy.name}</h3>
          <div className="flex flex-wrap gap-2">
            <span className="text-sm px-2 py-1 bg-primary/10 text-primary rounded-md">{CATEGORY_LABELS[pharmacy.category]}</span>
            {isOnDuty(pharmacy) && <span className="text-sm px-2 py-1 bg-primary text-white rounded-md">Garde confirmée</span>}
          </div>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0" />{pharmacy.full_address}, {pharmacy.city}</p>
          <p className="mt-3 text-xs">Horaires et garde non vérifiés</p>
        </CardContent>
      </Card>
    </Link>
  )
}
