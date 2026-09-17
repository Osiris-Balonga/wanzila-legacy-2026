'use client'

import { Button } from '@/components/ui/button'
import Image from 'next/image'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <div className="container mx-auto px-4 py-20 text-center"><Image src="/brand-app-icon.png" width={68} height={68} alt="Wanzila" className="mx-auto mb-4" /><h1 className="text-3xl font-bold mb-3">Une erreur est survenue</h1>
    <p className="text-muted-foreground mb-6">Impossible d'afficher cette page pour le moment.</p>
    <Button onClick={reset}>Réessayer</Button></div>
}
