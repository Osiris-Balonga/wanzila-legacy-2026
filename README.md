# Wanzila

MVP de recherche de pharmacies à Brazzaville, repris du frontend Iroy `dev` (commit `24ee093`). L'interface conserve sa structure et ses interactions Leaflet. Le service de données est JSON Server.

## Démarrage local

```bash
npm ci
npm run dev
```

Next.js écoute sur le port **3100** et JSON Server sur **3101** en boucle locale. Ouvrez `http://localhost:3100` sur l'ordinateur. Le navigateur appelle toujours `/data/pharmacies` sur l'origine du site ; Next relaie les lectures vers JSON Server. Pour un service JSON Server distant, définir `JSON_SERVER_URL` côté serveur Next.

Sur un smartphone, ouvrez l'adresse réseau du serveur Next, avec **HTTPS** pour que la géolocalisation soit autorisée. Le téléphone ne doit pas accéder directement à `localhost:3101`. Le serveur JSON Server doit rester privé ; seules les requêtes GET passent par `/data`. Aucune interface d'administration modifiable n'est exposée.

## Données

`db.json` contient 11 entrées `amenity=pharmacy` de Brazzaville issues d'OpenStreetMap, récupérées via la [couche OSM_AF_Medical ArcGIS](https://services-eu1.arcgis.com/zci5bUiJ8olAal7N/arcgis/rest/services/OSM_AF_Medical/FeatureServer/0) le 17 septembre 2026. Leur commune a été contrôlée avec le [géocodage inverse Nominatim](https://nominatim.org/release-docs/latest/api/Reverse/) ; une entrée située à Kinshasa a été écartée. Chaque fiche renvoie à son objet OSM. Les noms et coordonnées sont traçables à cette source collaborative ; leur exactitude sur place n'a pas été contrôlée. Numéros, photos, horaires et gardes ne sont pas ajoutés sans vérification.

`category=night_pharmacy` signifie seulement que le nom OSM contient « de nuit ». `duty_status` et `duty_periods` sont séparés de la catégorie. Une garde confirmée exige une période datée et une source ; aucune n'est fournie dans la démo.

L'itinéraire intégré utilise le profil voiture du service de démonstration OSRM. Si OSRM ou la géolocalisation échoue, l'application affiche une erreur sans tracer de ligne droite ni inventer de durée.

## Suite

L'admin Iroy dépendait de Supabase pour la lecture, l'écriture, l'authentification et les statistiques. Ces écrans sont retirés du MVP pour éviter d'annoncer un CRUD non testé ou d'exposer des modifications sans protection. Une reprise de l'admin nécessitera une protection réelle des écritures JSON Server et des essais manuels de chaque opération.
