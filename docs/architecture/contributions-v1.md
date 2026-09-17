# Décision d'architecture proposée : contributions V1

La proposition publique traverse les frontières web, API, domaine et Prisma décrites dans le [README d'architecture](README.md). Le contrat produit est [contributions-v1.md](../product/contributions-v1.md). Cette note encadre l'implémentation sans introduire de service supplémentaire.

## Choix

- Une contribution est distincte de `Pharmacy`. `PENDING` n'alimente ni la découverte ni les fiches publiques. Les coordonnées de la contribution sont nullables pour permettre la saisie d'adresse sans carte ; celles d'une pharmacie créée restent obligatoires.
- Les schémas HTTP résident dans `packages/contracts`, les règles déterministes de normalisation, de rapprochement et de transition dans `packages/domain`, les opérations atomiques, l'autorisation et la persistance dans `apps/api`. Le web n'effectue aucune décision de publication ni de doublon définitif.
- La création d'un brouillon et la décision `APPROVED` s'effectuent dans une seule transaction avec contrôle de version et vérification des doublons. Un identifiant de soumission unique évite les doubles insertions dues aux reprises réseau. Les corrections et décisions conservent un auteur admin et une date ; un original immuable permet d'expliquer les modifications.
- Les écritures admin réutilisent l'authentification et la vérification d'origine existantes. L'envoi public a sa propre limite, plus stricte que la limite API générale ; l'IP n'est pas une colonne de `Contribution`. Le déploiement doit vérifier que le limiteur identifie le bon client derrière le proxy, sans accepter arbitrairement `X-Forwarded-For`.
- Un traitement de nettoyage retire les notes à 90 jours après soumission et les propositions rejetées à 90 jours après rejet. Les décisions approuvées restent traçables avec la pharmacie. Les tests MariaDB vérifient une exécution répétée sans effet additionnel.

## Non-objectifs V1

Compte public, messagerie de suivi, téléversement, preuve photographique, géocodage automatique, fusion automatique avec une pharmacie existante, score de risque statistique et publication directe sont exclus. Les signalements #43 restent séparés et reportés.

## Risques à vérifier avant #13

Le schéma initial `Contribution` impose des coordonnées, n'enregistre ni réviseur ni historique et partage `ReviewStatus` avec les gardes. La migration C1 doit évoluer sans casser les données existantes. Le doublon de l'administration des pharmacies est aujourd'hui vérifié par une lecture applicative ; la revue des contributions doit éviter qu'une approbation concurrente crée deux brouillons. Les hypothèses de seuil anti-abus et de conservation sont indiquées dans le contrat produit et doivent être vérifiées sur l'environnement de démonstration.
