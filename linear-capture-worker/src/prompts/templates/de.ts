import type { PromptTemplates } from './index.js';

export const de: PromptTemplates = {
  imageRef: (count: number) => (count > 1 ? `Analysieren Sie diese ${count} Screenshots` : 'Analysieren Sie diesen Screenshot'),
  analyzeInstruction: 'und generieren Sie Linear-Issueinformationen.',
  titleRules: `## Titelregeln (Sehr wichtig!)

**Interne Zusammenarbeit vs. externe Anfrage - Klassifizierung**:

1. **Interne Zusammenarbeit** (kein Präfix, nur Inhalt):
   - Slack, Teams oder andere interne Messaging-UI sichtbar
   - Interne Arbeitsterminologie wie "Team", "Projekt", "Besprechung", "Überprüfung", "Freigabe"
   - Geniefy-Teammitgliedernamen identifizierbar
   - Arbeitsanfrage ohne spezifischen externen Firmennamen

   Format: Spezifischer Anforderungsinhalt (max. 40 Zeichen, kein Präfix)
   Beispiele:
   - "Workshop-Lehrplan-Überprüfungsanfrage"
   - "Red-Team-Tools-Organisation und -Freigabe"
   - "20 Seiten zu Schulungsmaterialien hinzufügen"
   - "PPT-Überarbeitung und Lieferung bis morgen"

2. **Externe Kundenanfrage** (Firmennamen einschließen):
   - Externer Firmenname deutlich sichtbar
   - Firma durch E-Mail-Domain identifizierbar
   - Externe Anfrage-Schlüsselwörter wie "Angebot", "Vorschlag", "Vertrag", "Bestellung"

   Format: [Firmenname] Spezifischer Anforderungsinhalt (max. 40 Zeichen)
   Beispiele:
   - "[Hyundai] Workshop-Lehrplan und Schulungsleitfaden anfordern"
   - "[Samsung] KI-Schulungsangebot anfordern (bis 1/20)"
   - "[Kakao] Benutzerdefinierte Workshop-PPT 20 Seiten zusätzliche Anfrage"

3. **Unklar**:
   - Kein Firmenname und interne/externe Unterscheidung unklar
   - Nur Inhalt schreiben statt [Externe Anfrage] (Überklassifizierung vermeiden)

**Wichtige Hinweise**:
- "Geniefy" ist unser Unternehmen, niemals im Titel einschließen
- Im Zweifelsfall nur den Anforderungsinhalt ohne Präfix schreiben
- [Externe Anfrage] nur verwenden, wenn externer Kunde eindeutig identifiziert ist
- Mehrere Anfragen mit & verbinden
- Frist einschließen, falls vorhanden`,
  descriptionTemplate: `## Beschreibungsregeln (Aufzählungspunkte erforderlich!)
Schreiben Sie alle Inhalte im Aufzählungsformat (-).

### Vorlage
## Zusammenfassung
- (Kernforderung/-problem in einer Zeile)

## Details
- (Identifizierter Inhalt 1)
- (Identifizierter Inhalt 2)
- (Wichtiger Text im "Zitat"-Format, falls zutreffend)

## Aufgaben
- [ ] (Erforderliche Aktion 1)
- [ ] (Erforderliche Aktion 2)`,
  userInstructionSection: (instruction: string) => `
---
## Benutzeranweisungen
> ${instruction.trim()}
- **Beschreibung**: Sie MÜSSEN die obigen Anweisungen in der Beschreibung berücksichtigen.
- **Titel**: Verwenden Sie den obigen Text NICHT als Titel. Der Titel muss die tatsächliche Anfrage/Aufgabe aus dem Screenshot zusammenfassen.
---`,
  contextSection: {
    header: '## Zusätzliche Analyse\nWählen Sie die am besten geeigneten Werte basierend auf dem Inhalt aus.',
    projectsHeader: '### Verfügbare Projekte',
    priorityHeader: '### Prioritätsstufen',
    priorityLevels: `- 1 (Dringend): Fehler, Ausfälle, dringende Anfragen
- 2 (Hoch): Wichtige Fehler, schnelle Bearbeitung erforderlich
- 3 (Mittel): Allgemeine Anfragen, Verbesserungen (Standard)
- 4 (Niedrig): Kleinere Verbesserungen, können später erfolgen`,
    estimateHeader: '### Schätzpunkte (Arbeitsaufwand)',
    estimateLevels: `- 1: Sehr klein (Einstellungsänderungen, Textbearbeitungen)
- 2: Klein (einfache Fehlerbehebungen)
- 3: Mittel (Funktionsänderungen)
- 5: Groß (neue Funktionsentwicklung)
- 8: Sehr groß (umfangreiche Arbeiten)`,
    noProjects: '(Keine)',
  },
  jsonFormat: {
    title: 'Titel',
    description: 'Beschreibung (Markdown)',
  },
  slackAnalyze: 'Analysieren Sie das folgende Slack-Gespräch und generieren Sie Linear-Issueinformationen.',
  slackPermalink: 'Ursprüngliches Slack-Gespräch',
  jsonFormatHeader: 'JSON-Antwortformat (ohne Markdown-Codeblöcke):',
  outputLanguageInstruction: 'WICHTIG: Sie MÜSSEN Titel UND Beschreibung auf Deutsch schreiben. Auch wenn der Screenshot koreanischen oder anderssprachigen Text enthält, MÜSSEN Sie alles ins Deutsche übersetzen.',
};
