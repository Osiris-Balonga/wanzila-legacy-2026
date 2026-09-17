import { Bookmark, Cross, ExternalLink, MapPin, Navigation } from 'lucide-react'
import { hasCoordinates } from '@/lib/pharmacies'
import type { Pharmacy } from '@/types/database'

interface Props {
  pharmacy: Pharmacy
  saved: boolean
  onOpen: () => void
  onSave: () => void
  onRoute: () => void
}

export function PharmacyRow({ pharmacy, saved, onOpen, onSave, onRoute }: Props) {
  const located = hasCoordinates(pharmacy)
  return <article className="pharmacy-row">
    <button className="pharmacy-row__main" onClick={onOpen} aria-label={`Voir ${pharmacy.name}`}>
      <span className="pharmacy-row__visual"><Cross size={24} strokeWidth={3} /></span>
      <span className="pharmacy-row__text">
        <strong>{pharmacy.name}</strong>
        <small><MapPin size={14} /> {pharmacy.neighborhood || pharmacy.borough || (pharmacy.full_address !== 'Adresse non renseignée' ? pharmacy.full_address : 'Brazzaville')}</small>
        <em>{located ? 'Voir sur la carte' : 'Position à confirmer'}</em>
      </span>
    </button>
    <div className="pharmacy-row__actions">
      {located && <button onClick={onRoute}><Navigation size={16} /> Itinéraire</button>}
      {!located && pharmacy.maps_url && <a href={pharmacy.maps_url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Maps</a>}
      <button onClick={onSave} aria-label={saved ? `Retirer ${pharmacy.name} des enregistrées` : `Enregistrer ${pharmacy.name}`}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Enregistrée' : 'Enregistrer'}</button>
    </div>
  </article>
}
