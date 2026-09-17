'use client'

import { useEffect, useState } from 'react'
import { getAvailability } from '@/lib/pharmacies'
import type { Pharmacy } from '@/types/database'

export function PharmacyArtwork({ pharmacy, className }: { pharmacy: Pharmacy; className: string }) {
  const fallback = pharmacy.category === 'night_pharmacy' ? '/illustrations/pharmacy-night.webp' : '/illustrations/pharmacy-day.webp'
  const [source, setSource] = useState(pharmacy.photo_url || fallback)
  useEffect(() => setSource(pharmacy.photo_url || fallback), [pharmacy.photo_url, fallback])
  return <span className={className} style={{ backgroundImage: `url(${fallback})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
    <img src={source} alt={source === fallback ? 'Illustration de pharmacie' : `Façade de ${pharmacy.name}`} loading={className === 'pharmacy-visual' ? 'eager' : 'lazy'} onError={() => setSource(fallback)} />
  </span>
}

export function AvailabilityBadge({ pharmacy }: { pharmacy: Pharmacy }) {
  const availability = getAvailability(pharmacy)
  const label = availability === 'open' ? 'Ouverte selon les horaires publiés' : availability === 'closed' ? 'Fermée selon les horaires publiés' : 'Horaires à confirmer'
  return <span className={`availability-badge availability-badge--${availability}`}>{label}</span>
}
