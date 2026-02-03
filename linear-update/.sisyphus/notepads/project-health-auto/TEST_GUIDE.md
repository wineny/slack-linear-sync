# User Testing Guide - /health-update Command

## 🎯 Test Objective
Verify that the `/health-update` Slack command correctly displays weekly project health updates.

---

## ✅ Pre-Test Checklist

- [x] Code deployed to production
- [x] Deployment version: `14d58f62-ba8a-481c-b816-5306c45e5e5c`
- [x] Slack App slash command registered
- [x] 3 bugs fixed and deployed

---

## 🧪 Test Procedure

### Step 1: Execute Command
In any Slack channel, type:
```
/health-update
```

### Step 2: Verify Immediate Response
**Expected**: 
```
📊 프로젝트 현황을 가져오는 중...
```
**Status**: ⏸️ Awaiting user confirmation

---

### Step 3: Verify Project List
**Expected**: 4 started projects displayed:
1. 전사 SSOT 구축 및 Linear 연결
2. Linear 최신 유지 자동화
3. CTO 워크샵 런칭 및 매출 검증 프로젝트
4. AI Opportunity Fund 진행

**Checklist**:
- [ ] Only "started" state projects shown
- [ ] Only projects where you are the lead
- [ ] No backlog/completed/canceled projects

**Status**: ⏸️ Awaiting user confirmation

---

### Step 4: Verify Issue Categorization
For each project, verify issues are categorized:

**✅ 이번 주 완료 (Done)**
- Issues completed this week (completedAt >= Monday 00:00 KST)

**🔍 리뷰 중 (In Review)**
- Issues with state.name === "In Review"

**🚀 진행 중 (In Progress)**
- Issues with state.name === "In Progress"

**📋 다음 Cycle 예정**
- Issues with cycle.startsAt > today

**Checklist**:
- [ ] Done section shows only this week's completed issues
- [ ] In Review section shows current review issues
- [ ] In Progress section shows current active issues
- [ ] Next Cycle section shows future-scheduled issues
- [ ] Empty sections are omitted (not shown)

**Status**: ⏸️ Awaiting user confirmation

---

### Step 5: Verify Links

**Issue Links**:
Click on any issue link (e.g., `EDU-123: Issue Title`)

**Expected**: Opens Linear issue page in browser

**Checklist**:
- [ ] Issue links are clickable
- [ ] Links open correct Linear issue page
- [ ] Issue identifier matches (EDU-XXX)

**Project Update Links**:
Click on "Project Update 작성하기" link

**Expected**: Opens Linear project update page
- URL format: `https://linear.app/gpters/project/{slugId}/updates`

**Checklist**:
- [ ] Project Update link is clickable
- [ ] Link opens correct project update page
- [ ] Correct project is shown

**Status**: ⏸️ Awaiting user confirmation

---

### Step 6: Edge Case Testing

**Test 6.1: Empty Sections**
If a project has no issues in a category (e.g., no "Done" issues this week):

**Expected**: That section is omitted entirely (not shown)

**Checklist**:
- [ ] Empty sections are not displayed
- [ ] No "이슈 없음" message for empty sections

**Test 6.2: Project with No Issues**
If a project has zero issues:

**Expected**:
```
📊 {프로젝트명} 주간 현황

이슈 없음

---
👉 Project Update 작성하기
```

**Checklist**:
- [ ] Project is still shown
- [ ] "이슈 없음" message displayed
- [ ] Project Update link still present

**Status**: ⏸️ Awaiting user confirmation

---

## 📋 Test Results Template

Copy and fill this out after testing:

```
## Test Results - /health-update

**Date**: 2026-01-28
**Tester**: [Your Name]
**Slack Workspace**: GPTers

### ✅ PASS / ❌ FAIL

- [ ] Command executes without error
- [ ] Shows 4 started projects
- [ ] Only my lead projects shown
- [ ] Issues categorized correctly (Done/In Review/In Progress/Next Cycle)
- [ ] Issue links work
- [ ] Project Update links work
- [ ] Empty sections omitted
- [ ] Projects with no issues show "이슈 없음"

### Issues Found
[List any bugs, errors, or unexpected behavior]

### Screenshots
[Attach Slack message screenshot if possible]

### Notes
[Any additional observations]
```

---

## 🐛 If Issues Found

**Report Format**:
```
Issue: [Brief description]
Expected: [What should happen]
Actual: [What actually happened]
Steps to Reproduce: [How to trigger the issue]
Error Messages: [Any error text]
```

**Example**:
```
Issue: No issues shown for "전사 SSOT 구축 및 Linear 연결" project
Expected: Should show Done/In Progress issues
Actual: Shows "이슈 없음"
Steps to Reproduce: Run /health-update
Error Messages: None
```

---

## ✅ Success Criteria

All checkboxes must be ✅ to mark the plan complete:

**Definition of Done** (Lines 51-55):
- [ ] Slack에서 `/health-update` 입력 시 메시지 수신
- [ ] 내가 리드하는 started 프로젝트들만 표시
- [ ] 이슈가 Done/In Review/In Progress/다음 Cycle로 분류됨
- [ ] 프로젝트별 Update 페이지 링크 포함
- [ ] 이슈 링크 클릭 시 Linear로 이동

**Final Checklist** (Lines 402-406):
- [ ] Slack에서 `/health-update` 명령어 작동
- [ ] 내가 리드하는 프로젝트만 표시
- [ ] 이슈가 상태별로 분류됨
- [ ] 프로젝트 Update 링크 포함
- [ ] 이슈 링크 작동

---

## 📊 Current Status

**Code**: ✅ Complete (3 bugs fixed)
**Deployment**: ✅ Live (Version: 14d58f62-ba8a-481c-b816-5306c45e5e5c)
**Testing**: ⏸️ **AWAITING USER**

**Next Step**: Execute `/health-update` in Slack and report results.
