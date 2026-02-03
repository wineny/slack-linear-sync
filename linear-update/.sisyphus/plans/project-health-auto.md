# 프로젝트 Health 업데이트 - Slack 명령어

## TL;DR

> **Quick Summary**: Slack에서 `/health-update` 명령어를 치면, 내가 리드하는 프로젝트들의 주간 현황(Done/In Review/In Progress/다음 Cycle)을 정리해서 Slack 메시지로 받기. 복사해서 Linear Project Update에 붙여넣기용.
> 
> **Deliverables**:
> - `slack-linear-sync/src/handlers/health-update.ts` - Slash Command 핸들러
> - `slack-linear-sync/src/index.ts` - 라우트 추가
> - `slack-linear-sync/src/services/linear-client.ts` - 프로젝트/이슈 조회 쿼리 추가
> - Slack App에서 Slash Command 등록
> 
> **Estimated Effort**: Medium (3-5시간)
> **Parallel Execution**: NO - 순차 실행
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
> 매주 프로젝트 health 업데이트를 해야 하는데, 만든 결과/만들 결과를 정리해서 올리고 있음.
> 금요일에 출근해서 이슈 상태를 업데이트하니까, 멤버가 원할 때 Slack 명령어로 정리된 문구를 받아보고 싶음.

### Interview Summary
**Key Discussions**:
- 결과물: Slack 메시지로 정리된 문구 (Linear 자동 게시 ❌)
- 트리거: `/health-update` Slack 명령어 (Cron ❌)
- 대상: **started 상태 + 내가 lead인 프로젝트들**
- 용도: 복사해서 Linear Project Update에 붙여넣기
- 프로젝트 링크 포함

**Research Findings**:
- `slack-linear-sync`에 Slash Command 핸들러 없음 (새로 추가)
- Slack → Linear User 매핑 로직 이미 있음 (`user-mapper.ts`)
- Linear API `project.lead` 필드로 리드 조회 가능

---

## Work Objectives

### Core Objective
Slack `/health-update` 명령어로 내가 리드하는 프로젝트들의 주간 현황을 Slack 메시지로 받기

### Concrete Deliverables
- Slash Command 핸들러 (`/health-update`)
- 프로젝트별 이슈 조회 쿼리 (state, completedAt, cycle 필터)
- Slack 메시지 포맷터

### Definition of Done
- [ ] Slack에서 `/health-update` 입력 시 메시지 수신
- [ ] 내가 리드하는 started 프로젝트들만 표시
- [ ] 이슈가 Done/In Review/In Progress/다음 Cycle로 분류됨
- [ ] 프로젝트별 Update 페이지 링크 포함
- [ ] 이슈 링크 클릭 시 Linear로 이동

### Must Have
- Slash Command 엔드포인트 (`POST /slack/command`)
- Slack 서명 검증
- Linear User 매핑 (Slack user → Linear user)
- 프로젝트 lead 필터링
- 이슈 상태/Cycle 분류

### Must NOT Have (Guardrails)
- ❌ Linear Project Update 자동 게시
- ❌ AI 요약 기능
- ❌ Cron 자동 실행
- ❌ 기존 `/slack/events` 핸들러 수정

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO
- **User wants tests**: Manual verification
- **Framework**: None

### Manual QA 절차

1. Slack App 설정에서 Slash Command 등록
2. 배포 후 Slack에서 `/health-update` 입력
3. 메시지 내용 검증:
   - 내가 리드하는 프로젝트만 표시되는지
   - 이슈 분류가 올바른지
   - 링크가 작동하는지

---

## Execution Strategy

### Sequential Execution

```
Task 1: LinearClient에 프로젝트/이슈 조회 쿼리 추가
    ↓
Task 2: Health Update 핸들러 구현
    ↓
Task 3: 라우트 등록 및 배포
    ↓
Task 4: Slack App에서 Slash Command 등록
    ↓
Task 5: 테스트 및 검증
```

---

## TODOs

- [x] 1. LinearClient에 프로젝트/이슈 조회 쿼리 추가

  **What to do**:
  1. `getMyLeadProjects(linearUserId)` 메서드 추가
     - started 상태 프로젝트 중 lead가 나인 것들
     - 프로젝트 ID, 이름, slugId 반환
  2. `getProjectIssuesForUpdate(projectId, weekStart)` 메서드 추가
     - Done (completedAt >= weekStart)
     - In Review (state.type === 'started', state.name === 'In Review')
     - In Progress (state.type === 'started', state.name === 'In Progress')
     - 다음 Cycle (cycle.startsAt > today)

  **Must NOT do**:
  - 기존 메서드 수정 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `slack-linear-sync/src/services/linear-client.ts` - 기존 GraphQL 클라이언트
  - `slack-linear-sync/src/types/index.ts` - LinearUser 타입

  **GraphQL 쿼리 예시**:
  ```graphql
  # 내가 리드하는 started 프로젝트들
  query GetMyLeadProjects($userId: String!) {
    projects(filter: {
      state: { eq: "started" }
      lead: { id: { eq: $userId } }
    }) {
      nodes {
        id
        name
        slugId
        url
      }
    }
  }
  
  # 프로젝트별 이슈 (상태 필터)
  query GetProjectIssues($projectId: String!) {
    project(id: $projectId) {
      issues(first: 100) {
        nodes {
          id
          identifier
          title
          url
          completedAt
          state { name, type }
          cycle { number, startsAt, endsAt }
        }
      }
    }
  }
  ```

  **Acceptance Criteria**:
  - [x] `getMyLeadProjects()` 호출 시 프로젝트 배열 반환
  - [x] `getProjectIssuesForUpdate()` 호출 시 분류된 이슈 반환
  - [x] TypeScript 컴파일 에러 없음

  **Commit**: NO (Task 3에서 일괄)

---

- [x] 2. Health Update 핸들러 구현

  **What to do**:
  - `slack-linear-sync/src/handlers/health-update.ts` 파일 생성
  - `handleHealthUpdate(payload, env)` 함수 구현
  - 로직:
    1. Slack user → Linear user 매핑
    2. 내가 리드하는 프로젝트 조회
    3. 각 프로젝트별 이슈 조회 및 분류
    4. Slack 메시지 포맷팅
    5. `response_url`로 응답 전송

  **"이번 주" 기준**:
  - 이번 주 월요일 00:00 KST ~ 현재

  **Slack 메시지 템플릿**:
  ```
  📊 *{프로젝트명}* 주간 현황
  
  *✅ 이번 주 완료 (Done)*
  • <{url}|{identifier}: {title}>
  
  *🔍 리뷰 중 (In Review)*
  • <{url}|{identifier}: {title}>
  
  *🚀 진행 중 (In Progress)*
  • <{url}|{identifier}: {title}>
  
  *📋 다음 Cycle 예정*
  • <{url}|{identifier}: {title}> - Cycle {number}
  
  ---
  👉 <{project_update_url}|Project Update 작성하기>
  ```

  **Must NOT do**:
  - Linear에 자동 게시 금지
  - 기존 핸들러 수정 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `slack-linear-sync/src/handlers/emoji-issue/handler.ts` - 핸들러 패턴
  - `slack-linear-sync/src/utils/user-mapper.ts` - Slack→Linear 매핑
  - `slack-linear-sync/src/services/slack-client.ts` - postMessage 패턴

  **Acceptance Criteria**:
  - [x] 핸들러 함수가 Slack 메시지 포맷 반환
  - [x] 프로젝트가 없으면 "리드하는 프로젝트가 없습니다" 메시지
  - [x] 이슈가 없는 섹션은 생략
  - [x] TypeScript 컴파일 에러 없음

  **Commit**: NO (Task 3에서 일괄)

---

- [x] 3. 라우트 등록 및 배포

  **What to do**:
  1. `slack-linear-sync/src/index.ts`에 Slash Command 라우트 추가
     - `POST /slack/command`
     - Slack 서명 검증
     - URL-encoded body 파싱
  2. `npm run build` 확인
  3. `npm run deploy` 배포

  **Slash Command 요청 특징**:
  - Content-Type: `application/x-www-form-urlencoded`
  - 3초 내 응답 필요 (길면 `response_url`로 후속 응답)

  **라우트 코드 예시**:
  ```typescript
  app.post('/slack/command', async (c) => {
    const env = c.env;
    const rawBody = await c.req.text();
    
    // 서명 검증
    const isValid = await verifySlackSignature(...);
    if (!isValid) return c.json({ error: 'Invalid signature' }, 401);
    
    // URL-encoded 파싱
    const params = new URLSearchParams(rawBody);
    const command = params.get('command');
    const userId = params.get('user_id');
    const responseUrl = params.get('response_url');
    
    if (command === '/health-update') {
      // 즉시 응답 (3초 제한)
      c.executionCtx.waitUntil(
        handleHealthUpdate({ userId, responseUrl }, env)
      );
      return c.json({ response_type: 'ephemeral', text: '📊 프로젝트 현황을 가져오는 중...' });
    }
    
    return c.json({ error: 'Unknown command' }, 400);
  });
  ```

  **Must NOT do**:
  - 기존 `/slack/events` 라우트 수정 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `slack-linear-sync/src/index.ts` - 기존 라우트 패턴
  - `slack-linear-sync/src/utils/signature.ts` - 서명 검증

  **Acceptance Criteria**:
  - [x] `npm run build` 성공
  - [x] `npm run deploy` 성공
  - [x] 배포된 Worker URL 확인

  **Commit**: YES
  - Message: `feat(slack-linear-sync): add /health-update slash command`
  - Files:
    - `src/services/linear-client.ts`
    - `src/handlers/health-update.ts`
    - `src/index.ts`
  - Pre-commit: `npm run build`

---

- [x] 4. Slack App에서 Slash Command 등록

  **What to do**:
  1. Slack App 설정 페이지 접속
     - https://api.slack.com/apps → slack-linear-sync 앱 선택
  2. "Slash Commands" 메뉴에서 "Create New Command"
     - Command: `/health-update`
     - Request URL: `https://slack-linear-sync.{your-domain}.workers.dev/slack/command`
     - Short Description: "내 프로젝트 주간 현황 보기"
     - Usage Hint: (비워두기)
  3. 앱 재설치 (권한 변경 시)

  **Must NOT do**:
  - 기존 명령어 수정 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
  - **Note**: 이 작업은 수동으로 Slack 웹에서 진행

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **Acceptance Criteria**:
  - [x] Slack App에서 `/health-update` 명령어 등록됨
  - [x] Request URL이 배포된 Worker URL로 설정됨

  **Commit**: NO (설정 작업)

---

- [ ] 5. 테스트 및 검증

  **What to do**:
  1. Slack에서 `/health-update` 입력
  2. 응답 메시지 확인:
     - 내가 리드하는 프로젝트만 표시되는지
     - 이슈 분류가 올바른지 (Done/In Review/In Progress/다음 Cycle)
     - 링크가 작동하는지
  3. 엣지 케이스 테스트:
     - 리드하는 프로젝트가 없는 사용자
     - 이슈가 없는 프로젝트
     - 특정 섹션만 있는 경우

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
  - **Note**: 수동 테스트

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None
  - **Blocked By**: Task 4

  **Acceptance Criteria**:
  - [ ] Slack에서 `/health-update` → 메시지 수신
  - [ ] 내가 리드하는 started 프로젝트들만 표시
  - [ ] 이슈 링크 클릭 → Linear 이슈 페이지 이동
  - [ ] Project Update 링크 클릭 → Linear Update 페이지 이동

  **Commit**: NO (테스트)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 3 | `feat(slack-linear-sync): add /health-update slash command` | 3 files | `npm run build` |

---

## Success Criteria

### Verification Commands
```bash
cd /Users/wine_ny/side-project/linear_project/slack-linear-sync
npm run build
npm run deploy
```

### Final Checklist
- [ ] Slack에서 `/health-update` 명령어 작동
- [ ] 내가 리드하는 프로젝트만 표시
- [ ] 이슈가 상태별로 분류됨
- [ ] 프로젝트 Update 링크 포함
- [ ] 이슈 링크 작동

---

## Edge Cases

| Case | Handling |
|------|----------|
| Linear User 매핑 실패 | "Linear 계정을 찾을 수 없습니다" 메시지 |
| 리드하는 프로젝트 없음 | "리드하는 프로젝트가 없습니다" 메시지 |
| 프로젝트에 이슈 없음 | 해당 프로젝트는 "이슈 없음" 표시 |
| 특정 섹션 이슈 없음 | 해당 섹션 생략 |
| 3초 타임아웃 | 즉시 "가져오는 중" 응답 + response_url로 후속 응답 |

---

## Phase 2 (향후)

1. **"Linear에 게시" 버튼**: Slack 메시지에 버튼 추가, 클릭 시 Linear에 자동 게시
2. **AI 요약**: 이슈 description → 한줄 요약
3. **프로젝트 선택**: `/health-update [project-name]` 형식으로 특정 프로젝트만
