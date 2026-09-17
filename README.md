# Wanzila

Carte des pharmacies de Brazzaville, adaptée du frontend Iroy `dev` (commit `24ee093`). L’accueil ouvre directement la carte. Sur ordinateur, une barre latérale et un panneau affichent la recherche, les pharmacies enregistrées et les fiches. Sur mobile, les onglets ouvrent des sheets au-dessus de la carte. L’onglet Contribuer annonce la suite du produit.

## Démarrage local

```bash
npm ci
npm run dev
```

Next.js écoute sur **3100** et JSON Server sur **3101**, en boucle locale. Ouvrez `http://localhost:3100`. Le navigateur lit `/data/pharmacies` sur la même origine ; Next relaie les lectures vers JSON Server. Pour un service JSON Server distant, définir `JSON_SERVER_URL` côté serveur Next.

Sur smartphone, ouvrez l’adresse réseau du serveur Next avec **HTTPS** pour autoriser la géolocalisation. Le téléphone n’accède jamais à son propre `localhost:3101`. Le port JSON Server doit rester privé : son API native permet les écritures sans authentification. Le middleware Next n’accepte que GET et HEAD sur `/data`.

## Données et limites

`db.json` contient **28 pharmacies** : 11 points OpenStreetMap dont la commune a été contrôlée par géocodage inverse, et 17 fiches issues du fichier `pharmacies_v2.json` fourni pour ce travail. Une fiche du fichier porte le même nom qu’un point OSM ; elle n’a pas été fusionnée sans preuve que les deux sources désignent le même emplacement. Les 17 fiches n’ont pas de coordonnées GPS : elles peuvent être recherchées, consultées et enregistrées, mais n’ont pas de pointeur ni de trajet intégré. Aucun lien Google Maps n’est affiché.

Le nom et les coordonnées des 11 points proviennent de la [couche OSM_AF_Medical ArcGIS](https://services-eu1.arcgis.com/zci5bUiJ8olAal7N/arcgis/rest/services/OSM_AF_Medical/FeatureServer/0), récupérée le 17 septembre 2026 ; la commune a été vérifiée avec [Nominatim](https://nominatim.org/release-docs/latest/api/Reverse/). Chaque point renvoie vers sa fiche OSM. Les adresses, quartiers et numéros des 17 autres fiches sont ceux du fichier fourni et n’ont pas été vérifiés sur place.

Les horaires `07:00–20:00` du fichier fourni sont identiques pour toutes les pharmacies et n’ont pas de source vérifiable. Ses périodes de garde concernent le 11–12 septembre 2026 et indiquent une source « à compléter ». Ni ces horaires ni ces gardes ne sont affichés comme actuels. La carte montre par défaut les trois pharmacies de nuit connues. Le filtre de disponibilité distingue les horaires publiés des horaires inconnus ; une pharmacie fermée selon un horaire publié est grisée. « De nuit » décrit le type de pharmacie et ne confirme pas une garde en cours.

La fiche Jagger comprend une [photo et des horaires publiés](https://www.congo-info.com/company/2453) (18 h–8 h), ainsi qu’un téléphone. Le contact d’Ebina vient de [Go Africa Online](https://www.goafricaonline.com/cg/1180204-pharmacie-de-nuit-ebina). Ces horaires doivent être confirmés avant un déplacement. Les autres images de façade sont des illustrations génériques générées pour l’interface, sans prétendre représenter l’établissement réel. Les champs de paiement et d’accès rapide restent absents faute de données fiables. La météo de Brazzaville utilise [Open-Meteo](https://open-meteo.com/en/docs) ; la ville reste affichée si le service ne répond pas.

L’onglet **Enregistrés** conserve les identifiants dans `localStorage` (`wanzila:saved:v1`) sur cet appareil, sans compte. Les données de pharmacie continuent de venir de JSON Server. La position GPS n’est demandée qu’après l’action **Itinéraire**. Le trajet en voiture vient du service public de démonstration OSRM ; si la position ou OSRM échoue, l’application affiche une erreur sans tracer de ligne droite ni inventer de durée. La fermeture d’une fiche restaure la vue de carte précédente ; la réinitialisation des filtres revient à la carte des pharmacies de nuit.

Pour réimporter le fichier fourni dans une base contenant les 11 points OSM :

```bash
node scripts/import-pharmacies.mjs chemin/vers/pharmacies_v2.json
```

## Déploiement

Pour un hébergement séparé, installez les dépendances de production des deux services. Lancez JSON Server sur un réseau privé avec `npx json-server db.json --host 0.0.0.0 --port 3101`, puis donnez son URL interne à `JSON_SERVER_URL` lors du build Next.js. N’exposez pas directement le port JSON Server.
