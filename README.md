# Overload — carnet de musculation (PWA)

Application web progressive, installable sur iPhone, pour suivre ses séances et sa **surcharge progressive**.
Fonctionne entièrement hors connexion ; les données restent sur l'appareil (IndexedDB).

## Fonctionnalités
- **Dashboard** : séances, exercices pratiqués, dernière séance, progression globale (1RM estimé sur 8 semaines), records récents, courbes charge / volume, démarrage rapide.
- **Séance en cours** : programmes ou séance libre, séries pré-remplies avec les charges de la dernière fois, validation d'une série en un geste (enregistrée immédiatement), minuteur de repos, détection des records en direct, difficulté ressentie, technique, commentaires, modification / duplication / suppression de séries.
- **Surcharge progressive** (double progression) : comparaison avec la séance précédente, suggestion indicative (+1 rép., +X kg quand toutes les séries atteignent le haut de fourchette, consolidation si ressenti dur ou technique à revoir, allègement si baisse sur deux séances). Rien n'est imposé.
- **Fiche exercice** : toutes les performances, records (charge, 1RM estimé, répétitions), graphiques charge / rép. / 1RM / volume sur 1M, 3M, 6M, 1A, tout.
- **Bibliothèque** : environ 50 exercices sur 10 groupes musculaires, exercices personnalisés, favoris, fourchette de répétitions et incrément réglables.
- **Programmes — semaine type** : calendrier des 7 jours (par défaut : lundi Pectoraux, mardi Bras / Épaules, mercredi et jeudi repos, vendredi Dos, samedi Bras / Épaules, dimanche Jambes). Chaque jour a une séance modèle **permanente** (exercices, ordre, séries, répétitions ciblées, charge), avec « Commencer la séance » et « Modifier ».
  - Démarrer une séance en crée une **copie** pré-remplie avec les dernières performances réelles. Les modèles et l'historique sont séparés : modifier un modèle ne change jamais les séances passées, et une séance réalisée ne modifie le modèle que si l'on choisit « Mettre à jour le modèle ».
  - Comparaison automatique avec la séance précédente du même programme (volume, séries, répétitions) et avec le dernier passage sur chaque exercice.
- **Statistiques** : séances et volume par semaine, comparaison avec la période précédente, charges par exercice, séries par muscle, records.
- **Historique** : toutes les séances, « Refaire cette séance » (duplication).
- **Sauvegarde** : enregistrement automatique, stockage persistant, points de restauration automatiques, export JSON (restaurable) / CSV, import avec fusion ou remplacement.

## Stack
React 18 + TypeScript + Vite · Dexie (IndexedDB) · Recharts · vite-plugin-pwa (Workbox) · Vitest.

```
src/
  db/          schéma (database.ts), types, données initiales (seed.ts), écritures (actions.ts)
  lib/         analysis.ts (moteur de progression, pur et testé), backup.ts, format.ts
  hooks/       requêtes réactives (useLiveQuery)
  components/  UI réutilisable (Sheet, Charts, ExercisePicker…)
  pages/       un fichier par écran
```
Pour faire évoluer le schéma : ajouter `this.version(2).stores({...}).upgrade(...)` dans `db/database.ts`.

## Développement
```bash
npm install
npm run dev      # http://localhost:5173 (et sur le réseau local)
npm test
npm run build    # → dist/
```

## Déploiement (HTTPS requis pour la PWA)
- **GitHub Pages** : pousser sur `main` ; le workflow `.github/workflows/deploy.yml` construit et publie l'app. Dans le dépôt, choisir Settings → Pages → Source : *GitHub Actions*.
- **Netlify** : importer le dépôt (`netlify.toml` fourni) ou glisser-déposer le dossier `dist/` sur app.netlify.com/drop.
- Tout hébergement statique fonctionne (chemins relatifs + routage par hash).

## Installer sur iPhone
1. Ouvrir l'URL dans **Safari**.
2. Toucher **Partager**, puis **Sur l'écran d'accueil**.
3. Lancer Overload depuis l'icône : plein écran, hors connexion.

> Sur iOS, les données de l'app installée sont séparées de celles de Safari. Utilisez toujours l'icône de l'écran d'accueil.
> Exportez régulièrement une sauvegarde JSON vers iCloud Drive (Réglages → Sauvegarde complète → Enregistrer dans Fichiers) : c'est votre copie de sécurité hors de l'appareil, et le moyen de transférer vos données vers un autre appareil.
