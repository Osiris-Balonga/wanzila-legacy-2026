# #62 — Sources et couverture dans la qualité admin

Référence : [maquette admin-data-quality](../../mockups/admin-data-quality.png).

Captures de l’implémentation : [390 px](quality-detail-390.png) · [1440 px](quality-detail-1440.png). Contrôles complémentaires : [320 px](quality-detail-320.png) · [768 px](quality-detail-768.png).

Les captures Playwright utilisent une réponse déterministe conforme au contrat #61 afin de comparer la géométrie à chaque largeur. En production, les deux panneaux chargent `GET /api/v1/admin/analytics/quality` avec authentification et validation Zod ; les valeurs de la fixture ne sont pas codées dans l’interface.

## Comparaison ciblée

| Région de la maquette           | Résultat #62                                                                                                                               | Écart justifié                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tableau « Sources de planning » | Six lignes initiales, observation, fiabilité, fraîcheur et gardes en cours ; page suivante indépendante et total global visible.           | La fréquence, les actions d’édition/création et la « dernière mise à jour » de la maquette ne sont pas fournies par #61. L’horodatage affiché est explicitement `observedAt`. |
| « Couverture des gardes »       | Cinq arrondissements initiaux, comptes de pharmacies uniques, ratios et barres de largeur exacte ; pagination et totaux globaux distincts. | Les chiffres de la maquette sont illustratifs ; les captures montrent la fixture #61. Aucun taux n’est inventé si le dénominateur est nul.                                    |
| Indicateurs de qualité          | Quatre comptes réellement disponibles, sans tendance ni pourcentage global fabriqué.                                                       | Le KPI « Qualité globale » et les sparklines de la maquette demandent des données absentes des contrats actuels.                                                              |
| Anomalies à traiter             | État de détection indisponible ; contributions et signalements restent des actions en attente séparées.                                    | Pas de liste d’anomalies ou de priorité simulée (#37).                                                                                                                        |

À 390 et 320 px, les cartes restent empilées sans débordement du document ; le tableau garde ses colonnes dans une région défilable au clavier et au toucher, annoncée par un texte visible. À 768 et 1440 px, la hiérarchie des panneaux reste celle de la maquette. Le sélecteur 7d/30d ne transforme pas les sources et la couverture en série temporelle : chaque panneau affiche son instantané `asOf` et son indépendance de la période d’activité.

Vérifications : assertions Playwright sur 320/390/768/1440, clavier, focus, absence de débordement, largeur d’une barre à 70 %, requêtes paginées indépendantes, récupération de page hors plage, états loading/empty/401/403/500/réessai et rejet d’un payload invalide.
