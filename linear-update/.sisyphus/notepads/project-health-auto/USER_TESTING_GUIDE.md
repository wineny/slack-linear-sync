# 🧪 User Testing Guide - /health-update Command

**Status**: ✅ **READY FOR TESTING**  
**Estimated Time**: 5 minutes  
**Last Updated**: 2026-01-28 18:10 KST

---

## 📋 Quick Start

### Step 1: Open Slack
Open your Slack workspace where the `slack-linear-sync` app is installed.

### Step 2: Run Command
Type in any channel or DM:
```
/health-update
```

### Step 3: Wait for Response
You should see:
1. **Immediate message**: "📊 프로젝트 현황을 가져오는 중..."
2. **Follow-up message** (within 5 seconds): Your project health update

---

## ✅ What to Verify

### 1. Message Appears ✅
- [ ] Command executes without error
- [ ] You receive a response message

### 2. Project Filtering ✅
- [ ] Shows only "started" projects
- [ ] Shows only projects where you're the lead
- [ ] If you're not a lead on any started projects, shows: "리드하는 프로젝트가 없습니다"

### 3. Issue Categorization ✅
Each project should show two sections:

**만든 결과** (Completed Work):
- [ ] Includes "Done" issues from this week
- [ ] Includes "In Review" issues
- [ ] Has AI-generated summary (one sentence, ~50 chars)

**만들 결과** (Planned Work):
- [ ] Includes "In Progress" issues
- [ ] Includes issues in next cycle
- [ ] Has AI-generated summary (one sentence, ~50 chars)

### 4. Formatting ✅
- [ ] Project name is bold: `*프로젝트명*`
- [ ] Section headers are bold: `*만든 결과 - {요약}*`
- [ ] Issues are formatted as links: `• <url|EDU-123: 이슈 제목>`
- [ ] AI summary is NOT a numbered list (should be one sentence)

### 5. Links Work ✅
- [ ] Click an issue link → Opens Linear issue page
- [ ] Click "Project Update 작성하기" → Opens Linear project update page

---

## 📸 Expected Output Format

```
📊 *전사 SSOT 구축 및 Linear 연결*

*만든 결과 - CTO 워크샵 준비 및 장소 확정*
• <url|EDU-123: 이슈 제목1>
• <url|EDU-456: 이슈 제목2>

*만들 결과 - Linear API 개선 작업 진행*
• <url|EDU-789: 이슈 제목3>

👉 <url|Project Update 작성하기>

---

📊 *Linear 최신 유지 자동화*

*만든 결과 - 없음*

*만들 결과 - 자동화 스크립트 개발 중*
• <url|EDU-012: 이슈 제목4>

👉 <url|Project Update 작성하기>

---
```

---

## 🐛 Common Issues & Solutions

### Issue: "Linear 계정을 찾을 수 없습니다"
**Cause**: Your Slack account is not mapped to a Linear account  
**Solution**: Contact admin to add mapping in `user-mapper.ts`

### Issue: "리드하는 프로젝트가 없습니다"
**Cause**: You're not set as lead on any "started" projects  
**Solution**: This is expected if you're not a project lead

### Issue: Command not found
**Cause**: Slash command not registered in Slack App  
**Solution**: Admin needs to register `/health-update` in Slack App settings

### Issue: AI summary is a numbered list
**Cause**: AI prompt not working as expected  
**Solution**: Report this - we'll adjust the prompt

---

## 📝 How to Report Results

### If Everything Works ✅
Reply with:
```
테스트 완료! 모두 정상 작동합니다.
```

### If You Find Issues ❌
Reply with:
```
문제 발견:
1. [구체적인 문제 설명]
2. [스크린샷 첨부 - 선택사항]
3. [예상 동작 vs 실제 동작]
```

**Example**:
```
문제 발견:
1. AI 요약이 번호 목록으로 나옴 (예: "1. 작업A 2. 작업B")
   - 예상: "작업A 및 작업B 진행"
   - 실제: "1. 작업A\n2. 작업B"
2. 프로젝트 Update 링크 클릭 시 404 에러
```

---

## 🎯 Success Criteria

All checkboxes above should be ✅ for the feature to be considered complete.

**Minimum requirements**:
- Command executes without error
- Shows correct projects (started + you're lead)
- Issues are categorized correctly
- Links work

**Nice to have**:
- AI summaries are concise and accurate
- Formatting looks clean
- No performance issues

---

## 🚀 After Testing

Once you report results:
- ✅ If successful → I'll mark all checkboxes complete (2 minutes)
- ❌ If issues found → I'll fix and redeploy (10-30 minutes per bug)

**Total time to 100% completion**: 7 minutes (assuming test passes)

---

## 📞 Need Help?

If you're unsure about anything:
1. Take a screenshot of what you see
2. Describe what you expected vs what happened
3. I'll help debug

**Remember**: There are no wrong reports. Any feedback helps improve the feature!

---

**STATUS**: ⏳ **AWAITING USER TEST RESULTS**
