import { readFile, writeFile } from 'node:fs/promises'

const sourcePath = process.argv[2]
if (!sourcePath) throw new Error('Usage: node scripts/import-pharmacies.mjs <pharmacies_v2.json>')

const supplied = JSON.parse(await readFile(sourcePath, 'utf8'))
const database = JSON.parse(await readFile('db.json', 'utf8'))
if (!Array.isArray(supplied.pharmacies) || !Array.isArray(database.pharmacies)) {
  throw new Error('Format de données invalide')
}

const normalize = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim()
const existing = new Map(database.pharmacies.map(pharmacy => [normalize(pharmacy.name), pharmacy]))

for (const record of supplied.pharmacies) {
  const match = existing.get(normalize(record.nom))
  if (match) {
    // A shared name is not enough to assert the supplied address and OSM point are the same place.
    // Keep the two records separate until their location can be checked.
    continue
  }
  database.pharmacies.push({
    id: record.id,
    name: record.nom,
    latitude: Number.isFinite(record.latitude) ? record.latitude : null,
    longitude: Number.isFinite(record.longitude) ? record.longitude : null,
    city: 'Brazzaville',
    full_address: record.adresse || 'Adresse non renseignée',
    neighborhood: record.quartier || null,
    borough: record.arrondissement || null,
    phone: record.telephone || null,
    photo_url: null,
    data_origin: 'provided',
    category: 'pharmacy',
    duty_status: 'unverified',
    duty_periods: [],
    source_url: '',
  })
}

for (const pharmacy of database.pharmacies) pharmacy.data_origin ||= 'osm'
await writeFile('db.json', `${JSON.stringify(database, null, 2)}\n`)
console.log(`${database.pharmacies.length} pharmacies : ${database.pharmacies.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).length} points cartographiques`)
