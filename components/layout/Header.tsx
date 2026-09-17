'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const navigation = [
  { name: 'Accueil', href: '/' },
  { name: 'Rechercher', href: '/recherche' },
]

export function Header() {
  const [open, setOpen] = useState(false)
  const path = usePathname()
  return (
    <header className="bg-background border-b border-border sticky top-0 z-[1100]">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <img src="/brand-app-icon.png" alt="" width="48" height="48" />
            <span><strong className="block text-lg leading-5">Wanzila</strong><small className="text-muted-foreground">Brazzaville</small></span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {navigation.map(item => <Link key={item.href} href={item.href}
              className={path === item.href ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'}>{item.name}</Link>)}
          </nav>
          <Button className="hidden md:inline-flex" asChild><Link href="/recherche"><Search className="h-4 w-4 mr-2" />Trouver une pharmacie</Link></Button>
          <Button className="md:hidden" variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-label="Ouvrir le menu">{open ? <X /> : <Menu />}</Button>
        </div>
        {open && <nav className="md:hidden border-t py-3 space-y-1">{navigation.map(item =>
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="block px-3 py-3 rounded hover:bg-accent">{item.name}</Link>
        )}</nav>}
      </div>
    </header>
  )
}
