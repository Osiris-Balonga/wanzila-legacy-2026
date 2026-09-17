import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return <div className="container mx-auto px-4 py-20 text-center"><Image src="/brand-app-icon.png" width={68} height={68} alt="Wanzila" className="mx-auto mb-4" /><h1 className="text-3xl font-bold mb-3">Page non trouvée</h1>
    <p className="text-muted-foreground mb-6">Cette page n'est pas disponible.</p>
    <Button asChild><Link href="/">Retour à la carte</Link></Button></div>
}
