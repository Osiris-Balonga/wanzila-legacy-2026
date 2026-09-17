# Photos individuelles des pharmacies

Aucune photo individuelle autorisée n'est actuellement livrée. L'icône neutre reste affichée si la fiche n'a pas de photo approuvée.

## Collecte et publication

1. Obtenir le fichier original ou une copie autorisée, l'identité de son auteur/source, une autorisation explicite de publication par Wanzila et la date de vérification. Conserver la preuve d'autorisation hors dépôt, sous une référence non sensible.
2. Vérifier que la photo représente la pharmacie concernée et qu'aucun visage, plaque ou autre donnée personnelle superflue n'est publié. Optimiser une version web, avec nom de fichier stable en minuscules, dans `apps/web/public/pharmacy-photos/`. Ne jamais découper une photo des maquettes.
3. Créer d'abord la fiche pharmacie pour obtenir son ID. Ajouter dans `approvedPharmacyPhotos` (`apps/api/src/modules/shared/pharmacy-photo-registry.ts`) une entrée avec cet ID, le chemin public `/pharmacy-photos/<nom>.<format>`, la source, le crédit, la référence de droits et la date de vérification. Le fichier et son entrée passent dans la même PR, avec contrôle humain des droits. Aucun lien distant arbitraire ni upload sur le disque éphémère du service n'est admis.
4. Après déploiement du fichier, associer cette entrée à la pharmacie via `PATCH` de l'API admin. Les métadonnées soumises doivent correspondre exactement au registre et l'ID de la fiche. `recordProvenance` décrit séparément la vérification des coordonnées de la **fiche** ; la source d'une garde ne vérifie pas la fiche.

## Correction et retrait

En cas de demande de retrait ou de doute sur les droits, effacer immédiatement `photo` de la fiche par `PATCH /api/v1/admin/pharmacies/:id` avec `{ "photo": null }` et vérifier l'absence sur l'API publique. Retirer ensuite l'entrée du registre et le fichier dans une PR, purger le cache/CDN si nécessaire, puis consigner la date et la référence du retrait hors dépôt. Une entrée retirée n'est plus exposée par l'API même si une ancienne référence reste en base pendant la transition. Pour une correction, enregistrer une nouvelle entrée vérifiée et remplacer l'association ; ne pas modifier silencieusement les crédits d'une photo existante.
