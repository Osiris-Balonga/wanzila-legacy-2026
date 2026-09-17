import type { z } from "zod";
import { pharmacyPhotoSchema } from "@wanzila/contracts";

export type PharmacyPhoto = z.infer<typeof pharmacyPhotoSchema>;

// Add an entry only in the same reviewed change that adds its licensed file to
// apps/web/public/pharmacy-photos. An empty registry is intentional until then.
export const approvedPharmacyPhotos: readonly (PharmacyPhoto & {
  pharmacyId: string;
})[] = [];

export function approvedPhoto(
  photo: PharmacyPhoto,
  pharmacyId: string,
  registry: readonly (PharmacyPhoto & {
    pharmacyId: string;
  })[] = approvedPharmacyPhotos,
): boolean {
  return registry.some(
    (item) =>
      item.pharmacyId === pharmacyId &&
      item.assetPath === photo.assetPath &&
      item.source === photo.source &&
      item.credit === photo.credit &&
      item.rights === photo.rights &&
      Date.parse(item.verifiedAt) === Date.parse(photo.verifiedAt),
  );
}

export function serializedPhoto(record: {
  id: string;
  photoAssetPath: string | null;
  photoSource: string | null;
  photoCredit: string | null;
  photoRights: string | null;
  photoVerifiedAt: Date | null;
}): PharmacyPhoto | undefined {
  if (
    !record.photoAssetPath ||
    !record.photoSource ||
    !record.photoCredit ||
    !record.photoRights ||
    !record.photoVerifiedAt
  )
    return undefined;
  const parsed = pharmacyPhotoSchema.safeParse({
    assetPath: record.photoAssetPath,
    source: record.photoSource,
    credit: record.photoCredit,
    rights: record.photoRights,
    verifiedAt: record.photoVerifiedAt.toISOString(),
  });
  return parsed.success && approvedPhoto(parsed.data, record.id)
    ? parsed.data
    : undefined;
}

export function serializedRecordProvenance(record: {
  recordSource: string | null;
  recordVerifiedAt: Date | null;
}) {
  return record.recordSource && record.recordVerifiedAt
    ? {
        source: record.recordSource,
        verifiedAt: record.recordVerifiedAt.toISOString(),
      }
    : undefined;
}
