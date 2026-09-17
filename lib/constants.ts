import type { PharmacyCategory } from '@/types/database'

export const CATEGORY_LABELS: Record<PharmacyCategory, string> = {
  pharmacy: 'Pharmacie',
  night_pharmacy: 'Pharmacie de nuit (nom OSM)',
}

export const MAP_CONFIG = {
  defaultCenter: [-4.267, 15.283] as [number, number],
  defaultZoom: 12,
}
