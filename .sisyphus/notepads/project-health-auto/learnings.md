# Project Health Auto - Learnings

## [2026-01-28] AI Summary Format Fix

### Changes Applied
1. **Line 31**: Updated AI prompt to prevent numbered lists
   - Old: `다음 작업들을 객관적으로 20자 이내로 요약해줘. 요약만 출력해: ${titles}`
   - New: `아래 작업 목록을 하나의 핵심 문장으로 요약해. 50자 이내, 번호나 나열 없이 핵심만. 예시: "인증 시스템 구축 및 테스트"\n\n${titles}`
   - **Reason**: Previous prompt was too vague, causing Claude to output numbered lists instead of concise summaries

2. **Line 117**: Fixed bold formatting for "만든 결과"
   - Old: `*만든 결과* - ${madeSummary}`
   - New: `*만든 결과 - ${madeSummary}*`
   - **Reason**: Slack mrkdwn requires entire phrase to be wrapped in asterisks for full bold

3. **Line 129**: Fixed bold formatting for "만들 결과"
   - Old: `sections.push(\`*만들 결과* - ${toMakeSummary}\`);`
   - New: `sections.push(\`*만들 결과 - ${toMakeSummary}*\`);`
   - **Reason**: Same as above - entire summary line should be bold

### Deployment
- TypeScript Check: ✅ No errors (`npx tsc --noEmit`)
- Deploy: ✅ Success
- URL: https://slack-linear-sync.ny-4f1.workers.dev
- Version ID: 153d9f02-4106-40f8-988b-2af69e92e8c5

### Key Learnings
- **AI Prompt Clarity**: Explicit examples and constraints (e.g., "번호나 나열 없이") are critical for preventing unwanted output formats
- **Slack mrkdwn Bold**: `*text*` wraps the entire phrase, not individual words
- **Cloudflare Workers**: No separate build step needed - wrangler handles TypeScript compilation during deploy

### Next Steps
- User should test `/health-update` in Slack to verify:
  - AI summary is one concise sentence (~50 chars)
  - No numbered lists in output
  - Entire summary line is bold (both "만든 결과" and "만들 결과" sections)
