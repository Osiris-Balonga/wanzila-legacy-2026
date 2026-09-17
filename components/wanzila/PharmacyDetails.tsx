import { Bookmark, Check, Clock3, Cross, ExternalLink, MapPin, Navigation, Phone, X } from 'lucide-react'
import { hasCoordinates } from '@/lib/pharmacies'
import type { Pharmacy } from '@/types/database'
import type { RouteInfo } from '@/types/route'

export type RouteState = { status: 'idle' | 'loading' | 'ready' | 'error'; message?: string }

interface Props {
  pharmacy: Pharmacy
  saved: boolean
  onSave: () => void
  onClose: () => void
  onRoute: () => void
  route: RouteInfo | null
  routeState: RouteState
  compact?: boolean
}

function PharmacyVisual({ pharmacy }: { pharmacy: Pharmacy }) {
  return <div className="pharmacy-visual" aria-hidden="true">
    {pharmacy.photo_url
      // The data currently contains no verified images; keep a clear visual fallback.
      ? <img src={pharmacy.photo_url} alt="" />
      : <span><Cross size={34} strokeWidth={3} /></span>}
  </div>
}

function RouteFeedback({ route, routeState }: { route: RouteInfo | null; routeState: RouteState }) {
  if (routeState.status === 'loading') return <p className="route-message" role="status">Recherche de votre position et calcul du trajet…</p>
  if (routeState.status === 'error') return <p className="route-message route-message--error" role="alert">{routeState.message}</p>
  if (routeState.status === 'ready' && route) return <p className="route-message" role="status">Trajet en voiture : {(route.distance / 1000).toFixed(1)} km · environ {Math.round(route.duration / 60)} min</p>
  return null
}

export function PharmacyDetails({ pharmacy, saved, onSave, onClose, onRoute, route, routeState, compact = false }: Props) {
  const phone = pharmacy.phone?.split('/')[0].trim()
  const located = hasCoordinates(pharmacy)
  return <div className={`pharmacy-details${compact ? ' is-compact' : ''}`}>
    <div className="pharmacy-details__top">
      <PharmacyVisual pharmacy={pharmacy} />
      <div className="pharmacy-details__title">
        <div className="eyebrow">Pharmacie · Brazzaville</div>
        <h2>{pharmacy.name}</h2>
        <p className="pharmacy-details__status"><Clock3 size={15} /> Horaires et garde non confirmés</p>
      </div>
      <button className="icon-button close-button" aria-label="Fermer la fiche" onClick={onClose}><X size={20} /></button>
    </div>

    {compact && <div className="pharmacy-details__preview">
      <p><MapPin size={15} /> {pharmacy.neighborhood || pharmacy.borough || pharmacy.full_address}</p>
      <div className="pharmacy-details__preview-actions">
        {located && <button className="action-button action-button--primary" onClick={onRoute}><Navigation size={17} /> Itinéraire</button>}
        {!located && pharmacy.maps_url && <a className="action-button action-button--primary" href={pharmacy.maps_url} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Rechercher sur Maps</a>}
        <button className="action-button" onClick={onSave}><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Enregistrée' : 'Enregistrer'}</button>
      </div>
      <RouteFeedback route={route} routeState={routeState} />
    </div>}

    {!compact && <div className="pharmacy-details__extended">
      <div className="pharmacy-details__actions">
        {located && <button className="action-tile action-tile--primary" onClick={onRoute} disabled={routeState.status === 'loading'}><Navigation size={22} /><span>{routeState.status === 'loading' ? 'Calcul…' : 'Itinéraire'}</span></button>}
        {!located && pharmacy.maps_url && <a className="action-tile action-tile--primary" href={pharmacy.maps_url} target="_blank" rel="noreferrer"><ExternalLink size={22} /><span>Voir sur Maps</span></a>}
        {phone && <a className="action-tile" href={`tel:${phone.replace(/\s/g, '')}`}><Phone size={22} /><span>Appeler</span></a>}
        <button className="action-tile" onClick={onSave}><Bookmark size={22} fill={saved ? 'currentColor' : 'none'} /><span>{saved ? 'Enregistrée' : 'Enregistrer'}</span></button>
      </div>

      <RouteFeedback route={route} routeState={routeState} />

      <div className="info-list">
        {pharmacy.phone && <div className="info-list__row"><Phone size={19} /><div><strong>{pharmacy.phone}</strong><span>Numéro fourni dans le jeu de données</span></div></div>}
        {pharmacy.full_address !== 'Adresse non renseignée' && <div className="info-list__row"><MapPin size={19} /><div><strong>{pharmacy.full_address}</strong><span>Brazzaville, Congo</span></div></div>}
        {(pharmacy.neighborhood || pharmacy.borough) && <div className="info-list__row"><MapPin size={19} /><div><strong>{pharmacy.neighborhood || pharmacy.borough}</strong><span>{pharmacy.borough && pharmacy.neighborhood ? `Arrondissement de ${pharmacy.borough}` : 'Quartier ou arrondissement'}</span></div></div>}
        {located && <div className="info-list__row"><Navigation size={19} /><div><strong>Position sur la carte</strong><span>{pharmacy.latitude.toFixed(5)}, {pharmacy.longitude.toFixed(5)}</span></div></div>}
        {!located && <div className="info-list__row"><MapPin size={19} /><div><strong>Position précise indisponible</strong><span>Aucun pointeur ni trajet intégré pour cette pharmacie.</span></div></div>}
      </div>

      <section className="useful-info">
        <h3>Informations utiles</h3>
        <div className="useful-info__row"><Clock3 size={18} /><span>Horaires et gardes à confirmer avant le déplacement.</span></div>
        <div className="useful-info__row"><Check size={18} /><span>{pharmacy.data_origin === 'osm' ? 'Nom et point issus d’OpenStreetMap.' : 'Adresse et contact issus du fichier fourni.'}</span></div>
        {pharmacy.source_url && <a href={pharmacy.source_url} target="_blank" rel="noreferrer" className="useful-info__link">Voir la source <ExternalLink size={15} /></a>}
      </section>
    </div>}
  </div>
}
