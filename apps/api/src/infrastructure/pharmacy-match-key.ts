import { createHash } from "node:crypto";
import { canonicalPharmacyKey } from "@wanzila/domain";

export function pharmacyMatchKey(candidate: {
  name: string;
  address: string;
  district: string;
  arrondissement: string;
}): string {
  return createHash("sha256")
    .update(canonicalPharmacyKey(candidate))
    .digest("hex");
}
