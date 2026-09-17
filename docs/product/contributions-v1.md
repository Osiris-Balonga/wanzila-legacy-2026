# Contributions de pharmacies — contrat V1 proposé

Statut : contrat proposé pour #10, #41 et #42. La décision du 17 septembre 2026 inclut les contributions publiques et leur modération dans la V1, après les lots #98 (itinéraire) et #99 (données de fiche). Les signalements #43 restent hors V1. Ce document fixe le périmètre des prochaines PR ; il ne décrit pas une fonction déjà livrée.

## Parcours public (#41)

1. Une personne sans compte ouvre `/contribuer`. Elle choisit une position sur la carte MapLibre/OpenFreeMap ou continue sans carte vers la saisie d'adresse. Le bouton « utiliser ma position » demande une autorisation seulement après une action explicite. Refus, absence de géolocalisation et échec du fond de carte n'empêchent pas de continuer.
2. L'étape `/contribuer/details` conserve le contexte de position choisi, s'il existe, et demande le nom de la pharmacie, l'adresse ou indication, le quartier et l'arrondissement. Le téléphone de la pharmacie et une note courte sont facultatifs. La note est plafonnée à 200 caractères. Aucun nom, compte, courriel, photo ou pièce jointe du contributeur n'est demandé. Les valeurs de quartier et d'arrondissement restent du texte validé tant qu'aucun référentiel géographique n'est disponible ; l'interface ne doit pas inventer une liste exhaustive.
3. Avant l'envoi, l'interface explique que la proposition attend une vérification, que le téléphone et la note ne sont pas requis, que la note ne doit pas contenir de renseignement personnel, et qu'aucune pharmacie n'est publiée par cette action. La validation du navigateur aide, mais l'API valide à nouveau les champs, les longueurs et les coordonnées lorsqu'elles sont fournies.
4. Un envoi accepté persiste une seule contribution `PENDING` et affiche une confirmation en attente. Les erreurs de validation, de limite d'envoi et de réseau donnent une issue compréhensible et permettent de corriger ou réessayer sans multiplier les lignes. Les propositions et indices de doublon non publiés ne sont jamais exposés par les API publiques de pharmacies.

Les coordonnées d'une proposition `PENDING` sont facultatives. Si une position est choisie, latitude et longitude doivent être finies et comprises dans les plages géographiques valides ; la carte ne vaut pas vérification de l'adresse. Sans coordonnées, l'adresse reste utilisable pour la revue. **L'approbation est impossible tant qu'un administrateur n'a pas renseigné une position valide.** La position d'une personne utilisant l'application ne devient jamais un historique de trajet.

## Validation, doublons et abus

- Le serveur limite la taille du corps à 4 Kio, applique les longueurs du contrat, refuse les champs inattendus et limite les envois à cinq par heure et vingt par jour par client. Le mécanisme doit identifier correctement le client derrière le proxy de déploiement sans faire confiance à un en-tête transmis librement par le visiteur. Les adresses IP ne sont pas stockées dans la contribution ; un compteur éphémère ou un contrôle en périphérie est acceptable pour une instance V1, avec test de la limite effective.
- Un identifiant aléatoire de soumission, généré dans le navigateur et transmis avec la requête, rend un nouvel essai du même envoi idempotent. Il ne sert pas à lister ou consulter une proposition publique. La réponse publique reste une confirmation générique en attente et ne révèle ni autres propositions ni indices de doublon.
- La revue admin affiche des **indices factuels**, sans score inventé : égalité du nom et de l'adresse normalisés, téléphone identique lorsqu'il est présent, et proximité calculée à partir des coordonnées disponibles. Chaque indice identifie la pharmacie ou proposition concernée et, pour la proximité, la distance calculée. Une proximité seule ne décide pas qu'il s'agit d'un doublon.
- Un doublon exact avec une pharmacie existante bloque la création d'une nouvelle pharmacie jusqu'à résolution du conflit. Les rapprochements moins certains exigent une vérification et une confirmation explicite de l'administrateur avant approbation. Une contribution ne modifie jamais silencieusement une pharmacie existante.

Les seuils cinq/heure, vingt/jour, 4 Kio et proximité à 200 m sont des **hypothèses de démarrage** à confirmer par les tests et l'usage ; ils ne sont pas déduits des maquettes. La sécurité ne doit pas reposer seulement sur un contrôle côté navigateur.

## Revue et publication (#42)

- La file `/admin/contributions` et le détail `/admin/contributions/:id` exigent une session administrateur. Liste paginée et filtres `PENDING`, `APPROVED`, `REJECTED` ; la fiche montre les champs soumis, la position ou « non renseignée », les indices de doublon, l'historique de correction et la décision. Aucun nom de contributeur, photo ou score de risque ne doit être fabriqué pour reproduire les maquettes.
- Une correction explicite ne concerne qu'une proposition `PENDING`. L'original et les champs corrigés restent distinguables dans l'audit, avec administrateur et date. Les mutations utilisent une version attendue pour refuser une revue concurrente devenue périmée.
- L'approbation et le rejet exigent un motif court, l'identité de l'administrateur et une date. Une décision est terminale ; la répétition d'une même requête ne crée pas de seconde pharmacie et une décision différente après coup renvoie un conflit.
- L'approbation vérifie à nouveau les champs, les coordonnées et les doublons dans une opération atomique : elle lie la contribution `APPROVED` à une **nouvelle pharmacie `DRAFT`**. Elle ne publie rien et ne modifie pas une fiche existante. La publication éventuelle utilise ensuite l'action admin de pharmacie déjà disponible. Le rejet passe à `REJECTED` sans créer de pharmacie.
- Une contribution corrigée puis approuvée garde la proposition originale, les corrections, le motif et le lien vers le brouillon pour que la décision soit vérifiable. Les API publiques ne montrent que les pharmacies explicitement publiées.

## Conservation minimale proposée dans #10

- Aucun identifiant de contributeur n'est collecté. Le téléphone demandé est celui de la pharmacie et reste facultatif. La note libre n'est visible qu'aux administrateurs.
- La **note libre est effacée 90 jours après la soumission**, même si la revue n'est pas terminée. Une proposition rejetée et ses détails sont supprimés 90 jours après la décision. La trace de décision d'une proposition approuvée, sans note libre expirée, reste liée au brouillon ou à la pharmacie publiée.
- Un nettoyage périodique, explicite et testable effectue ces suppressions ; un simple texte d'interface ne suffit pas. Les contributions encore `PENDING` après 90 jours restent dans la file avec leur note effacée pour éviter une disparition silencieuse d'une proposition non revue.

Cette durée est une hypothèse produit prudente, déjà proposée en commentaire de #10. Elle doit être confirmée avec les critères de qualification #13 et la politique de données de l'exploitant avant publication publique. Elle n'est pas présentée comme une conclusion juridique.

## Lots et propriété des fichiers

| PR | Dépendance | Propriété principale | Preuve attendue |
| --- | --- | --- | --- |
| C1 — contrat, Prisma, domaine, API | Après intégration de #99 pour éviter deux migrations simultanées de `Pharmacy`/`Contribution` | `apps/api/prisma/**`, `apps/api/src/modules/contributions/**`, `packages/contracts/src/contributions.ts`, `packages/domain/src/contributions.ts`, tests correspondants. Un seul intégrateur modifie `apps/api/src/app.ts` et `packages/contracts/src/index.ts`. | Migration sur base MariaDB vierge et existante ; validation, idempotence, limites, doublons, conservation, permissions, concurrence, audit et publication différée. |
| C2 — interface publique #41 | Contrat C1 figé et API disponible | `apps/web/src/features/contribution-public/**`, tests navigateur propres au parcours. Raccordement isolé à `PublicShell.tsx` après le travail de routage #98. | Deux étapes, carte et adresse seule, refus de position, carte indisponible, validation, réseau, confirmation ; capture mobile et reflow 320/390/768/1440 px, clavier/focus/accessibilité. |
| C3 — modération admin #42 | Contrat C1 figé et file persistée | `apps/web/src/features/admin-contributions/**`, tests navigateur propres à la modération. Raccordement isolé à `AdminShell.tsx` et au compteur du dashboard. | File, filtres, fiche, correction, conflit, approbation/rejet et visibilité publique ; capture desktop et adaptation 320/390/768 px, clavier/focus/accessibilité. |

C2 et C3 peuvent être codées dans deux worktrees distincts en parallèle **après C1**, puis intégrées dans `dev` une par une avec remise à jour et CI verte. C1 peut progresser en parallèle de l'interface d'itinéraire #98 sur ses fichiers propres. La migration de données de fiche #99 précède la migration C1 ; l'API commune et les points de raccordement (`schema.prisma`, `app.ts`, exports de contrats, shells) n'ont qu'un propriétaire à chaque intégration. Chaque PR part du dernier `origin/dev`, cible `dev` et suit #37/#38 pour le layout.

## Scénarios d'acceptation minimaux

1. Sans carte ni autorisation de géolocalisation, une personne soumet une adresse valide et reçoit une confirmation ; la proposition apparaît `PENDING` en admin, sans pharmacie publique.
2. Des coordonnées invalides, champs manquants, corps trop long et rafale d'envois sont refusés par le serveur. Un nouvel essai avec le même identifiant ne crée pas de deuxième ligne.
3. Un rapprochement exact ou proche affiche les faits en admin. Une pharmacie existante exacte bloque une nouvelle création ; une proximité seule peut être acceptée après confirmation motivée.
4. Deux administrateurs revoyant la même version ne peuvent produire qu'une décision et au plus un brouillon. Une revue sans session, avec origine interdite, ou une seconde décision différente échoue.
5. Une proposition sans coordonnées ne peut pas être approuvée. Une proposition corrigée et approuvée crée un `DRAFT` lié et audité ; elle n'apparaît au public qu'après publication admin séparée. Le rejet ne crée rien.
6. Le nettoyage efface une note après 90 jours et les propositions rejetées 90 jours après décision, sans toucher aux décisions approuvées liées à une pharmacie.
