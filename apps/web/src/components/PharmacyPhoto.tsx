import type { PublicPharmacy } from "@wanzila/contracts";
import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import "./pharmacy-photo.css";

export function PharmacyPhoto({
  photo,
  name,
  className = "",
  decorative = false,
  fallback,
}: {
  photo?: PublicPharmacy["photo"];
  name: string;
  className?: string;
  decorative?: boolean;
  fallback?: ReactNode;
}) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const imageAvailable = photo && failedPath !== photo.assetPath;

  return (
    <span className={`pharmacy-photo ${className}`.trim()}>
      {imageAvailable ? (
        <img
          alt={decorative ? "" : `Photo vérifiée de ${name}`}
          decoding="async"
          loading="lazy"
          onError={() => setFailedPath(photo.assetPath)}
          src={photo.assetPath}
        />
      ) : (
        <span aria-hidden="true" className="pharmacy-photo__fallback">
          {fallback ?? <Plus />}
        </span>
      )}
    </span>
  );
}
