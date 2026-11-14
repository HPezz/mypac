---
description: "Démarrer la Vague 7 du pilote ACEN réel depuis picto-audit#101"
argument-hint: "[focus ou contraintes supplémentaires]"
---

Démarre un nouveau contexte de travail pour exécuter la Vague 7 — Pilote réel, pilotée par `picto-audit#101`.

1. Lis l’issue `https://gitlab.com/picto-access/picto-audit/-/issues/101` et ses dépendances avec `glab`.
2. Vérifie l’état réellement mergé des dépôts concernés avant toute modification.
3. Démarre simultanément les deux seules issues immédiatement exécutables sans prédécesseur restant :
   - `https://gitlab.com/picto-access/picto-referential/-/issues/145` ;
   - `https://gitlab.com/picto-access/picto-api/-/issues/498`.
4. Cartographie les contrats existants pour couvrir, dans cet ordre :
   - feature flag et allowlist ;
   - audit terrain réel ;
   - import GPX et photos ;
   - rapprochement et décisions humaines ;
   - validation Admin ;
   - publication ;
   - PDF ;
   - ZIP CNIG ;
   - validation Frictionless ;
   - fixtures anonymisées de régression.
5. Distingue clairement ce qui peut être automatisé localement de ce qui nécessite une action terrain, des données réelles, une mutation cloud, un déploiement ou une autorisation explicite.
6. Pour chaque issue :
   1. pars de la branche par défaut à jour ;
   2. crée une branche et un worktree dédiés ;
   3. écris le test de la tranche verticale ;
   4. implémente uniquement le scope de l’issue ;
   5. vérifie les audits non ACEN ;
   6. crée une MR liée à l’issue ;
   7. ne lance l’issue dépendante qu’après stabilisation du contrat précédent.
7. Procède par tranches TDD verticales, avec diagnostics déterministes et sans création, publication ou confirmation implicite de données métier.
8. Conserve provenance, méthode, score, distance, opérateur et décision humaine.
9. Vérifie les tests ciblés, les builds de production et les validateurs de paquet avant de proposer un commit ou une MR.
10. Ne pousse, merge, déploie, ne lance un audit réel et ne mute aucune ressource cloud sans autorisation explicite pour l’opération courante.

Commence par présenter un plan bref et parallèle pour `picto-referential#145` et `picto-api#498`, avec critères de succès vérifiables. Exécute ensuite leurs premières tranches locales non destructives dans deux worktrees dédiés. Si une information ou une autorisation manque, arrête-toi au point exact concerné et demande-la.

**Focus ou contraintes supplémentaires** : $@
