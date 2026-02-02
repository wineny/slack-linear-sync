import type { PromptTemplates } from './index.js';

export const fr: PromptTemplates = {
  imageRef: (count: number) => (count > 1 ? `Analysez ces ${count} captures d'écran` : 'Analysez cette capture d\'écran'),
  analyzeInstruction: 'et générez les informations du problème Linear.',
  titleRules: `## Règles du titre (Très important!)

**Classification collaboration interne vs demande externe**:

1. **Collaboration interne** (pas de préfixe, contenu uniquement):
   - Interface de messagerie interne Slack, Teams ou autre visible
   - Terminologie de travail interne comme "équipe", "projet", "réunion", "examen", "partage"
   - Noms des membres de l'équipe Geniefy identifiables
   - Demande de travail sans nom d'entreprise externe spécifique

   Format: Contenu de demande spécifique (40 caractères max, pas de préfixe)
   Exemples:
   - "Demande d'examen du programme d'atelier"
   - "Organisation et partage des outils Red Team"
   - "Ajouter 20 pages aux matériels pédagogiques"
   - "Révision PPT et livraison d'ici demain"

2. **Demande de client externe** (inclure le nom de l'entreprise):
   - Nom d'entreprise externe clairement visible
   - Entreprise identifiable par domaine de courrier électronique
   - Mots-clés de demande externe comme "devis", "proposition", "contrat", "commande"

   Format: [Nom de l'entreprise] Contenu de demande spécifique (40 caractères max)
   Exemples:
   - "[Hyundai] Demande de programme d'atelier et guide de formation"
   - "[Samsung] Demande de devis de formation IA (avant le 1/20)"
   - "[Kakao] Demande supplémentaire de 20 pages PPT d'atelier personnalisé"

3. **Cas peu clairs**:
   - Pas de nom d'entreprise et distinction interne/externe peu claire
   - Écrire uniquement le contenu au lieu de [Demande externe] (éviter la surclassification)

**Remarques importantes**:
- "Geniefy" est notre entreprise, ne jamais inclure dans le titre
- En cas de doute, écrire uniquement le contenu de la demande sans préfixe
- Utiliser [Demande externe] uniquement lorsque le client externe est clairement identifié
- Connecter plusieurs demandes avec &
- Inclure la date limite si applicable`,
  descriptionTemplate: `## Règles de description (Points à puces obligatoires!)
Écrivez tout le contenu au format à puces (-).

### Modèle
## Résumé
- (Demande/problème principal en une ligne)

## Détails
- (Contenu identifié 1)
- (Contenu identifié 2)
- (Texte important au format "citation" le cas échéant)

## À faire
- [ ] (Action requise 1)
- [ ] (Action requise 2)`,
  userInstructionSection: (instruction: string) => `
---
## ⚠️ Instructions de l'utilisateur (Doit être appliqué en premier!)
Vous devez refléter le contenu suivant dans le titre et la description:

> ${instruction.trim()}

Si des instructions utilisateur sont fournies, priorisez-les par rapport au contenu de la capture d'écran lors de la création du problème.
---`,
  contextSection: {
    header: '## Analyse supplémentaire\nSélectionnez les valeurs les plus appropriées en fonction du contenu.',
    projectsHeader: '### Projets disponibles',
    priorityHeader: '### Niveaux de priorité',
    priorityLevels: `- 1 (Urgent): Erreurs, pannes, demandes urgentes
- 2 (Élevé): Bugs importants, traitement rapide nécessaire
- 3 (Moyen): Demandes générales, améliorations (par défaut)
- 4 (Bas): Améliorations mineures, peuvent être faites plus tard`,
    estimateHeader: '### Points d\'estimation (Estimation du travail)',
    estimateLevels: `- 1: Très petit (modifications de paramètres, éditions de texte)
- 2: Petit (corrections de bugs simples)
- 3: Moyen (modifications de fonctionnalités)
- 5: Grand (développement de nouvelles fonctionnalités)
- 8: Très grand (travaux majeurs)`,
    noProjects: '(Aucun)',
  },
  jsonFormat: {
    title: 'Titre',
    description: 'Description (markdown)',
  },
  slackAnalyze: 'Analysez la conversation Slack suivante et générez les informations du problème Linear.',
  slackPermalink: 'Conversation Slack originale',
  jsonFormatHeader: 'Format de réponse JSON (sans blocs de code markdown):',
  outputLanguageInstruction: "IMPORTANT: Vous DEVEZ écrire le titre ET la description en français. Même si la capture d'écran contient du texte coréen ou dans une autre langue, vous DEVEZ tout traduire en français.",
};
