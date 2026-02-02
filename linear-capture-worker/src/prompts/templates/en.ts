import type { PromptTemplates } from './index.js';

export const en: PromptTemplates = {
  imageRef: (count: number) => (count > 1 ? `Analyze these ${count} screenshots` : 'Analyze this screenshot'),
  analyzeInstruction: 'and generate Linear issue information.',
  titleRules: `## Title Rules (Very Important!)

**Internal Collaboration vs External Inquiry Classification**:

1. **Internal Collaboration** (no prefix, content only):
   - Slack, Teams, or other internal messaging UI visible
   - Internal work terminology like "team", "project", "meeting", "review", "share"
   - Geniefy team member names identifiable
   - Work request without specific external company name

   Format: Specific request content (40 characters max, no prefix)
   Examples:
   - "Workshop curriculum review request"
   - "Red team tools organization & sharing"
   - "Add 20 pages to educational materials"
   - "PPT revision and delivery by tomorrow"

2. **External Client Inquiry** (include company name):
   - External company name clearly visible
   - Company identifiable by email domain
   - External inquiry keywords like "quote", "proposal", "contract", "order"

   Format: [Company Name] Specific request content (40 characters max)
   Examples:
   - "[Hyundai] Workshop curriculum and trainee guide request"
   - "[Samsung] AI training quote request (by 1/20)"
   - "[Kakao] Custom workshop PPT 20 pages additional request"

3. **Unclear Cases**:
   - No company name and internal/external distinction unclear
   - Write content only instead of [External Inquiry] (prevent over-classification)

**Important Notes**:
- "Geniefy" is our company, never include in title
- When uncertain, write only the request content without prefix
- Use [External Inquiry] only when external client is clearly identified
- Connect multiple requests with &
- Include deadline if applicable`,
  descriptionTemplate: `## Description Rules (Bullet Points Required!)
Write all content in bullet (-) format.

### Template
## Summary
- (Core request/issue in one line)

## Details
- (Identified content 1)
- (Identified content 2)
- (Important text in "quote" format if applicable)

## To Do
- [ ] (Required action 1)
- [ ] (Required action 2)`,
  userInstructionSection: (instruction: string) => `
---
## ⚠️ User Instructions (Must Apply First!)
You must reflect the following content in the title and description:

> ${instruction.trim()}

If user instructions are provided, prioritize them over screenshot content when creating the issue.
---`,
  contextSection: {
    header: '## Additional Analysis\nSelect the most appropriate values based on the content.',
    projectsHeader: '### Available Projects',
    priorityHeader: '### Priority Levels',
    priorityLevels: `- 1 (Urgent): Errors, outages, urgent requests
- 2 (High): Important bugs, quick handling needed
- 3 (Medium): General requests, improvements (default)
- 4 (Low): Minor improvements, can be done later`,
    estimateHeader: '### Estimate Points (Work Estimation)',
    estimateLevels: `- 1: Very small (setting changes, text edits)
- 2: Small (simple bug fixes)
- 3: Medium (feature modifications)
- 5: Large (new feature development)
- 8: Very large (major work)`,
    noProjects: '(None)',
  },
  jsonFormat: {
    title: 'Title',
    description: 'Description (markdown)',
  },
  slackAnalyze: 'Analyze the following Slack conversation and generate Linear issue information.',
  slackPermalink: 'Original Slack conversation',
  jsonFormatHeader: 'JSON response format (without markdown code blocks):',
  outputLanguageInstruction: 'CRITICAL: You MUST write the title AND description in English. Even if the screenshot contains Korean or other language text, you MUST translate everything to English.',
};
