import { Bookmark, MapPin, Navigation, Phone } from 'lucide-react'
import { getAvailability, hasCoordinates } from '@/lib/pharmacies'
import { AvailabilityBadge, PharmacyArtwork } from './PharmacyArtwork'
import type { Pharmacy } from '@/types/database'

interface Props {
  pharmacy: Pharmacy
  saved: boolean
  onOpen: () => void
  onSave: () => void
  onRoute: () => void
}

export function PharmacyRow({ pharmacy, saved, onOpen, onSave, onRoute }: Props) {
  const phone = pharmacy.phone?.split('/')[0].trim()
  const located = hasCoordinates(pharmacy)
  return <article className={`pharmacy-row${getAvailability(pharmacy) === 'closed' ? ' is-closed' : ''}`}>
    <button className="pharmacy-row__main" onClick={onOpen} aria-label={`Voir ${pharmacy.name}`}>
      <PharmacyArtwork pharmacy={pharmacy} className="pharmacy-row__visual" />
      <span className="pharmacy-row__text">
        <strong>{pharmacy.name}</strong>
        <small><MapPin size={14} /> {pharmacy.neighborhood || pharmacy.borough || (pharmacy.full_address !== 'Adresse non renseignée' ? pharmacy.full_address : 'Brazzaville')}</small>
        <AvailabilityBadge pharmacy={pharmacy} />
      </span>
    </button>
    <div className="pharmacy-row__actions">
      {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} aria-label={`Appeler ${pharmacy.name}`}><Phone size={16} /> Appeler</a>}
      {located && <button onClick={onRoute}><Navigation size={16} /> Itinéraire</button>}
      <button onClick={onSave} aria-label={saved ? `Retirer ${pharmacy.name} des enregistrées` : `Enregistrer ${pharmacy.name}`}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Enregistrée' : 'Enregistrer'}</button>
    </div>
  </article>
}
