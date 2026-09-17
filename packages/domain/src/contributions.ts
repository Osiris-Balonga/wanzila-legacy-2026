export interface ContributionCandidate {
  id: string;
  name: string;
  phone: string | null;
  address: string;
  district: string;
  arrondissement: string;
  latitude: number | null;
  longitude: number | null;
}

export interface DuplicateIndicator {
  kind: "EXACT_NAME_ADDRESS" | "PHONE" | "NEARBY";
  target: "PHARMACY" | "CONTRIBUTION";
  id: string;
  distanceMeters?: number;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

export function canonicalPharmacyKey(
  candidate: Pick<
    ContributionCandidate,
    "name" | "address" | "district" | "arrondissement"
  >,
): string {
  return [
    candidate.name,
    candidate.address,
    candidate.district,
    candidate.arrondissement,
  ]
    .map(normalize)
    .join("\u001f");
}

function distanceMeters(
  a: ContributionCandidate,
  b: ContributionCandidate,
): number | null {
  if (
    a.latitude === null ||
    a.longitude === null ||
    b.latitude === null ||
    b.longitude === null
  )
    return null;
  const toRad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRad;
  const dLon = (b.longitude - a.longitude) * toRad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * toRad) *
      Math.cos(b.latitude * toRad) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(x))));
}

export function duplicateIndicators(
  input: ContributionCandidate,
  candidates: Array<{
    target: "PHARMACY" | "CONTRIBUTION";
    value: ContributionCandidate;
  }>,
): DuplicateIndicator[] {
  const result: DuplicateIndicator[] = [];
  for (const { target, value } of candidates) {
    if (target === "CONTRIBUTION" && value.id === input.id) continue;
    if (canonicalPharmacyKey(input) === canonicalPharmacyKey(value))
      result.push({ kind: "EXACT_NAME_ADDRESS", target, id: value.id });
    if (
      input.phone &&
      value.phone &&
      input.phone.replace(/\D/g, "") === value.phone.replace(/\D/g, "")
    )
      result.push({ kind: "PHONE", target, id: value.id });
    const distance = distanceMeters(input, value);
    if (distance !== null && distance <= 200)
      result.push({
        kind: "NEARBY",
        target,
        id: value.id,
        distanceMeters: distance,
      });
  }
  return result;
}
