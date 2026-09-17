# #75 — édition d’une garde initialement en attente

Référence : [`admin-duty-edit.png`](../../mockups/admin-duty-edit.png). Capture représentative à 1440 px : [éditeur PENDING](pending-duty-edit-1440.png). Les données sont les réponses déterministes du test Playwright ; la carte utilise son fond de test neutre et les coordonnées retournées par l’API.

Le shell admin, le retour, le formulaire principal à gauche, la fiche pharmacie et la carte à droite, ainsi que les actions en bas du formulaire, suivent la hiérarchie de la référence. À 320, 390 et 768 px, ces régions s’empilent sans débordement horizontal. Le bouton principal reste accessible au clavier avec un focus visible.

Différences matérielles fondées sur le contrat produit : la pharmacie est recherchable et modifiable tant que la garde est initialement en attente ; elle reste fixe pour la révision d’une garde publiée. Son statut est « en attente » et la sauvegarde utilise le `PATCH` de la garde initiale. Le formulaire ne propose ni changement de statut ni motif de révision, car aucune `DutyRevision` n’est créée. L’historique de révisions n’est donc pas affiché. La garde demeure invisible au public jusqu’à l’approbation distincte. Aucune photo, identité d’auteur ou donnée de garde supplémentaire n’est simulée pour la maquette.

Les tests navigateur couvrent la navigation depuis la liste, les valeurs chargées, l’intervalle invalide, le `PATCH`, l’absence d’appel au registre des révisions, le conflit 409 avec rechargement serveur, les erreurs d’authentification, les largeurs 320/390/768/1440 et le focus du bouton de sauvegarde.
