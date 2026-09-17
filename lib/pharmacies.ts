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

export function getAvailability(pharmacy: Pharmacy, at = new Date()): 'open' | 'closed' | 'unknown' {
  if (isOnDuty(pharmacy, at)) return 'open'
  const hours = pharmacy.opening_hours
  if (!hours) return 'unknown'
  const current = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Brazzaville', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
  const toMinutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute }
  const now = toMinutes(current)
  const start = toMinutes(hours.daily_start)
  const end = toMinutes(hours.daily_end)
  if (![now, start, end].every(Number.isFinite)) return 'unknown'
  return start < end ? (now >= start && now < end ? 'open' : 'closed') : (now >= start || now < end ? 'open' : 'closed')
}

export function filterPharmacies(pharmacies: Pharmacy[], filters: SearchFilters): Pharmacy[] {
  const query = filters.query.trim().toLocaleLowerCase('fr')
  return pharmacies.filter(pharmacy => {
    const matchesQuery = !query || [pharmacy.name, pharmacy.full_address, pharmacy.city, pharmacy.neighborhood, pharmacy.borough]
      .some(value => value?.toLocaleLowerCase('fr').includes(query))
    const matchesCategory = filters.category === 'all'
      || (filters.category === 'on_duty' ? isOnDuty(pharmacy) : pharmacy.category === filters.category)
    return matchesQuery && matchesCategory
      && (!filters.availability || filters.availability === 'all' || getAvailability(pharmacy) === filters.availability)
      && (!filters.neighborhood || pharmacy.neighborhood === filters.neighborhood)
      && (!filters.borough || pharmacy.borough === filters.borough)
  })
}

export function hasCoordinates(pharmacy: Pharmacy): pharmacy is Pharmacy & { latitude: number; longitude: number } {
  return typeof pharmacy.latitude === 'number' && Number.isFinite(pharmacy.latitude)
    && typeof pharmacy.longitude === 'number' && Number.isFinite(pharmacy.longitude)
}
