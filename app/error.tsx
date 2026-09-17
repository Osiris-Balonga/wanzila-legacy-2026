'use client'

import { Button } from '@/components/ui/button'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <div className="container mx-auto px-4 py-20 text-center"><h1 className="text-3xl font-bold mb-3">Une erreur est survenue</h1>
    <p className="text-muted-foreground mb-6">Impossible d'afficher cette page pour le moment.</p>
    <Button onClick={reset}>Réessayer</Button></div>
}
