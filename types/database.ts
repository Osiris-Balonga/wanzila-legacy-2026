export type PharmacyCategory = 'pharmacy' | 'night_pharmacy'
export type DutyStatus = 'unverified' | 'confirmed'

export interface DutyPeriod {
  starts_at: string
  ends_at: string
  source_url: string
}

export interface Pharmacy {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  city: string
  full_address: string
  neighborhood?: string | null
  borough?: string | null
  phone?: string | null
  photo_url?: string | null
  maps_url?: string | null
  data_origin?: 'osm' | 'provided'
  category: PharmacyCategory
  duty_status: DutyStatus
  duty_periods: DutyPeriod[]
  source_url: string
}

export interface SearchFilters {
  query: string
  category: 'all' | PharmacyCategory | 'on_duty'
  neighborhood?: string
  borough?: string
}
