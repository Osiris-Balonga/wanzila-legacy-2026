import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4 py-10 grid gap-6 md:grid-cols-3">
        <div className="flex items-start gap-3"><img src="/brand-app-icon.png" alt="" width="44" height="44" />
          <div><strong>Wanzila</strong><p className="text-sm text-muted-foreground">Trouver une pharmacie à Brazzaville.</p></div></div>
        <div><strong>Explorer</strong><p className="mt-2 text-sm"><Link href="/recherche" className="text-primary hover:underline">Rechercher une pharmacie</Link></p></div>
        <p className="text-sm text-muted-foreground">Données cartographiques OpenStreetMap. Vérifiez les horaires et la garde auprès de la pharmacie avant de vous déplacer.</p>
      </div>
    </footer>
  )
}
