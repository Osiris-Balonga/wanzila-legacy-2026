import type { Pharmacy, SearchFilters } from '@/types/database'

export async function loadPharmacies(): Promise<Pharmacy[]> {
  const response = await fetch('/data/pharmacies', { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossible de charger les pharmacies. Réessayez plus tard.')
  const data: unknown = await response.json()
  if (!Array.isArray(data)) throw new Error('Les données des pharmacies sont invalides.')
  return data as Pharmacy[]
}

export function isOnDuty(pharmacy: Pharmacy, at = new Date()): boolean {
  return pharmacy.duty_status === 'confirmed' && pharmacy.duty_periods.some(
    period => new Date(period.starts_at) <= at && at < new Date(period.ends_at)
  )
}

export function filterPharmacies(pharmacies: Pharmacy[], filters: SearchFilters): Pharmacy[] {
  const query = filters.query.trim().toLocaleLowerCase('fr')
  return pharmacies.filter(pharmacy => {
    const matchesQuery = !query || [pharmacy.name, pharmacy.full_address, pharmacy.city]
      .some(value => value.toLocaleLowerCase('fr').includes(query))
    const matchesCategory = filters.category === 'all'
      || (filters.category === 'on_duty' ? isOnDuty(pharmacy) : pharmacy.category === filters.category)
    return matchesQuery && matchesCategory
  })
}
