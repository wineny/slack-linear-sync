# Slack → Linear 이슈 자동화 - 개발 로그

Claude Code와 함께 진행한 개발 작업 기록입니다.

---

## 2026-01-18 (Day 1)

### 1. Slack → Linear 자동화 시스템 설계

```
Slack 00-ai개발-질문 채널에 질문이 올라오면 자동으로 Linear 이슈를 생성하고 싶어.
어떤 방법이 있을까?
```

**Claude 작업:**
- 기존 linear-capture 프로젝트의 Linear API 패턴 분석
- 자동화 방법 3가지 제안: Slack Workflow, Serverless Function, 노코드 툴
- Cloudflare Workers + Hono 프레임워크 아키텍처 설계
- 사용자 매핑 방식 결정: 이메일 기반 자동 매핑

---

### 2. Cloudflare Worker 프로젝트 초기화

```
Serverless + AI 분석 방식으로 구현해줘.
이메일 기반 자동 매핑으로 하고.
```

**Claude 작업:**
- `slack-linear-sync/` 디렉토리에 Cloudflare Worker 프로젝트 생성
- `src/index.ts` - Hono 라우터, 메인 엔트리
- `src/handlers/slack-events.ts` - Slack 이벤트 핸들러
- `src/services/slack-client.ts` - Slack API 클라이언트
- `src/services/linear-client.ts` - Linear GraphQL 클라이언트
- `src/services/ai-analyzer.ts` - Claude Haiku 4.5 분석기
- `src/utils/signature.ts` - Slack 서명 검증
- `src/utils/user-mapper.ts` - 이메일 기반 사용자 매핑
- `wrangler.toml` - Worker 설정 (KV namespace, secrets)

---

### 3. Slack App 생성 및 배포

```
Worker 배포하고 Slack App 설정도 해줘
```

**Claude 작업:**
- `wrangler deploy`로 Cloudflare Worker 배포
- Slack App 생성 가이드 제공 (api.slack.com)
- Event Subscriptions 설정: `message.channels`, `reaction_added`, `reaction_removed`
- OAuth Scopes 설정: `channels:history`, `chat:write`, `users:read`, `users:read.email`
- Bot Token, Signing Secret 환경변수 설정

---

### 4. :해결: 이모지 → Done 기능 추가

```
:해결: 이모지 달면 Linear 이슈를 Done으로 변경해줘
```

**Claude 작업:**
- `src/handlers/slack-reactions.ts` - 리액션 이벤트 핸들러 생성
- `LINEAR_DONE_STATE_ID` 환경변수 추가
- 스레드 댓글에 리액션 달아도 원본 이슈 Done 처리 로직
- KV에서 Slack message ts → Linear issue ID 매핑 조회

---

### 5. Slack 스레드 → Linear 댓글 동기화

```
스레드에 달린 댓글도 Linear 이슈에 comment로 추가해줘
```

**Claude 작업:**
- `handleThreadReply()` 함수 추가
- 스레드 답글 감지 시 해당 Linear 이슈에 코멘트 자동 추가
- 봇 메시지 스킵 로직 (무한 루프 방지)
- 댓글 형식: `**작성자명** (Slack에서): 댓글 내용`

---

### 6. Linear 공식 앱과 중복 이슈 문제 해결

```
리니어 공식 Slack 앱이랑 뽀시래기 봇이 둘 다 이슈를 생성해서 중복이 생겨.
뽀시래기만 쓰고 싶은데 양방향 동기화는 필요 없어.
```

**Claude 작업:**
- Linear 공식 앱과 커스텀 봇 충돌 원인 분석
- `attachmentLinkSlack` API 호출 제거 (양방향 동기화 포기)
- 대신 Slack URL을 description에 직접 포함하는 방식 채택
- 사용자에게 Linear 공식 앱 채널 제거 안내

---

### 7. Slack URL 자동 추가 보장

```
근데 슬랙 url이 description에 포함되지는 않아.
```

**Claude 작업:**
- AI 프롬프트만으로는 URL 포함이 보장되지 않는 문제 발견
- `ai-analyzer.ts` 수정: AI 응답 후 프로그래밍적으로 URL 추가
- 형식: `📎 [Slack 원본 메시지](permalink)` 를 description 하단에 항상 추가
- 중복 방지: `!finalDescription.includes(slackPermalink)` 체크

---

## 2026-01-22 (Day 2)

### 8. OAuth 토큰 자동 갱신 구현

```
뽀시래기가 오후에 갑자기 동작 안 해. 오전엔 잘 됐는데
```

**문제 원인:**
- Linear OAuth 토큰이 24시간 만료 정책으로 변경됨
- access_token이 만료되어 API 호출 실패

**Claude 작업:**
- `src/utils/token-manager.ts` 신규 생성
  - `isTokenValid()` - 현재 토큰 유효성 검사
  - `refreshAccessToken()` - refresh_token으로 새 토큰 발급
  - `getValidAccessToken()` - 만료 시 자동 갱신 후 반환
- KV에 갱신된 토큰 자동 저장으로 다음 요청에서 재사용
- 수동 재인증 없이 지속적 운영 가능

---

### 9. Emoji Issue Creator 구현

```
질문 채널 말고, 다른 채널에서도 이모지 눌러서 이슈 만들고 싶어.
:이슈: 이모지 누르면 Linear 이슈 생성되게
```

**Claude 작업:**
- 기존 뽀시래기 코드를 `src/handlers/pposiraegi/`로 분리
- `src/handlers/emoji-issue/` 신규 생성
  - `handler.ts` - :이슈: 리액션 → 이슈 생성 핸들러
  - `thread-collector.ts` - 스레드 전체 메시지 수집
- `src/services/ai-analyzer.ts` - 스레드 맥락 분석 함수 추가
  - Linear 프로젝트/사용자 목록 참조하여 자동 매칭
  - 스레드 전체 내용을 요약하여 제목/설명 생성
- `:issue:` 및 `:이슈:` 이모지 둘 다 지원
- 이모지 누른 사람이 Assignee로 자동 지정
- AI가 내용 분석하여 프로젝트 자동 추천

---

## 2026-01-27 (Day 3)

### 10. Linear 로컬 캐시 연동으로 프로젝트 추천 정확도 향상

```
linear-mcp-fast가 Linear Desktop App의 로컬 캐시를 읽어오는 기능이 있는데,
이걸 활용해서 프로젝트 + 최근 이슈 제목까지 AI에게 전달하면 추천 정확도가 높아지지 않을까?
```

**Claude 작업:**
- `scripts/linear-sync/` 디렉토리 생성
- `export_projects.py`: Linear Desktop IndexedDB에서 프로젝트 데이터 추출
  - 프로젝트 기본 정보 (id, name, teamId, teamName, state, keywords)
  - 프로젝트별 최근 10개 이슈 제목 (`recentIssueTitles`)
  - started/planned 상태 프로젝트만 필터링
- `sync_to_kv.sh`: Cloudflare KV에 JSON 업로드
- `com.linear-sync.plist`: macOS launchd 5분 주기 자동 동기화
- `install_launchd.sh`, `uninstall_launchd.sh`: 설치/제거 스크립트
- `test_sync.sh`: 로컬 테스트 스크립트

**TypeScript 수정:**
- `src/types/index.ts`: `CachedProject`에 `recentIssueTitles?: string[]` 추가
- `src/services/ai-analyzer.ts`: 
  - `ThreadAnalysisContext`에 `recentIssueTitles` 필드 추가
  - `buildContextSection()`에서 최근 이슈 제목 렌더링
- `src/handlers/emoji-issue/handler.ts`: `recentIssueTitles` 전달

**정확도 향상 효과:**
- 391개 추가 매칭 가능 키워드 (이슈 제목에만 있는 단어)
- "원티드 아웃바운드" → 채용 프로젝트 매칭 (기존엔 불가)
- "Linear MCP" → Linear 자동화 프로젝트 매칭 (기존엔 불가)
- "오픈채팅방" → n8n 워크플로우 프로젝트 매칭 (기존엔 불가)

**아키텍처:**
```
┌─────────────────┐     5분마다      ┌─────────────────┐
│ Linear Desktop  │ ──────────────→ │ Cloudflare KV   │
│ (IndexedDB)     │  launchd 동기화  │ PROJECT_CACHE   │
└─────────────────┘                  └────────┬────────┘
                                              │
                                              ▼
┌─────────────────┐     KV 읽기      ┌─────────────────┐
│ Slack :이슈:    │ ──────────────→ │ Worker          │
│ 이모지 클릭     │                  │ AI 프롬프트에   │
└─────────────────┘                  │ 이슈 제목 포함  │
                                     └─────────────────┘
```

---

### 11. 프로젝트 description + content 필드 추가로 AI 매칭 정확도 향상

```
지금 리니어 이슈 생성할 때 프로젝트명, 최신 이슈 10개 말고
프로젝트의 description도 활용하고 있어?
```

**현황 분석:**
- Linear 프로젝트에는 두 가지 설명 필드가 존재
  - `description`: 한 줄 요약 (평균 35자)
  - `content`: 전체 계획 문서 (## 0. 이슈 ~ ## 4. 관련 링크, 평균 1,000~2,000자)
- 기존에는 둘 다 AI 프롬프트에 전달하지 않음
- `keywords`는 `description`에서 추출했지만 원문은 버리고 있었음

**Claude 작업:**
- `linear-client.ts`: GraphQL에 `content` 필드 추가
- `types/index.ts`: `LinearProject`, `CachedProject`에 `description`, `content` 추가
- `export_projects.py`: 캐시에 `description`, `content[:400]` 저장
- `ai-analyzer.ts`: 
  - `ThreadAnalysisContext`에 `description`, `content` 추가
  - `buildContextSection()`에서 프로젝트 정보 렌더링 개선
- `handler.ts`: AI context에 `description`, `content` 전달

**토큰 비용 분석:**
- started + planned 프로젝트 = 25개
- description: 평균 35자, 최대 91자
- content: 첫 400자만 사용
- 25개 × 450자 = ~11,000자 (토큰 ~3,000) → Haiku 기준 무리 없음

**미해결 이슈:**
- Linear Desktop App의 로컬 IndexedDB 캐시에는 `content` 필드가 없음
- 옵션 1: Linear API 직접 호출로 전환
- 옵션 2: 하이브리드 (캐시 + API fallback)
- → 다음 세션에서 결정 예정

**AI 프롬프트 포맷 개선:**
```
- "Linear 업무 분석 자동화" (id) [키워드들]
    Linear 이슈 기반 업무 패턴 분석... | ## 0. 이슈 * Linear에 이슈가 쌓여도...
    최근 이슈: "이슈1", "이슈2"...
```

---

## 커밋 히스토리

| 날짜 | 커밋 | 설명 |
|------|------|------|
| 01/18 | `0642b74` | feat: Slack → Linear 이슈 자동화 시스템 초기 커밋 |
| 01/18 | `f2e9702` | feat: Slack-Linear 양방향 동기화 및 Slack 링크 자동 추가 |
| 01/22 | `797e80b` | feat: OAuth 토큰 자동 갱신 (refresh token) 구현 |
| 01/22 | `8763dfd` | feat: Emoji Issue Creator - :이슈: 이모지로 Linear 이슈 생성 |
| 01/27 | `8bfcac6` | feat: Linear 로컬 캐시 연동으로 프로젝트 추천 정확도 향상 |
| 01/28 | `6f8831a` | feat: /health-update 슬래시 커맨드 추가 |
| 01/28 | `cc20679` | feat: health-update AI 요약 포맷 개선 |
| 01/29 | `46ffe38` | feat: 뽀시래기 프로젝트/마일스톤 자동 할당 |
| 01/29 | `d1644de` | feat: 이모지 누른 사용자로 이슈 작성자 표시 |
| 01/29 | `9e305f4` | feat: /initiative-update 핸들러 추가 |
| 01/29 | `f8fae11` | feat: initiative-update AI 요약 출력 |
| 02/09 | `5c2b396` | feat: :x: 이모지 Linear 이슈 삭제 기능 |
| 02/10 | `bb512f6` | fix: 이슈 생성 자동 재시도 로직 추가 |
| 02/12 | `5838b71` | improve: 긴 스레드 트리밍 + AI 분석 fallback |
| 02/12 | `a07a118` | feat: IssueIt 데일리 리포트 자동 발송 |
| 02/14 | `c0ca071` | feat: 이미지 감지 + Vision 분석 추가 |
| 02/14 | `77769d2` | fix: Slack 파일 다운로드 + Worker-to-Worker 통신 수정 |

---

## 기술 스택

- **Runtime**: Cloudflare Workers (V8 isolates, 0 cold start)
- **Framework**: Hono (경량 웹 프레임워크)
- **AI**: Anthropic Claude Haiku 4.5
- **Storage**: Cloudflare KV (이슈 매핑, 중복 방지)
- **APIs**: Slack Web API, Linear GraphQL API

---

## 주요 기능

### 🐣 뽀시래기 (질문 채널 자동 이슈화)

1. **Slack → Linear 이슈 자동 생성**
   - `00-ai개발-질문` 채널 메시지 감지
   - Claude Haiku로 제목/설명 자동 생성
   - @멘션된 사용자를 Assignee로 매핑

2. **:해결: 이모지 → Done 처리**
   - 커스텀 이모지 :해결: 달면 Linear 이슈 Done 상태로 변경
   - 스레드 댓글에 달아도 원본 이슈 처리

3. **Slack 스레드 → Linear 댓글 동기화**
   - Linear 공식 Slack 앱의 synced thread 기능 활용
   - 봇 메시지는 스킵

### 🎫 Emoji Issue Creator (어디서든 이슈 생성)

4. **:이슈: 이모지 → Linear 이슈 생성**
   - 봇이 초대된 모든 채널에서 동작
   - 스레드 전체 맥락을 AI가 분석하여 요약
   - 이모지 누른 사람이 Assignee로 자동 지정
   - AI가 프로젝트 자동 추천

### 🔧 인프라

5. **OAuth 토큰 자동 갱신**
   - Linear 24시간 토큰 만료 정책 대응
   - refresh_token으로 자동 갱신
   - 수동 재인증 없이 지속 운영

6. **Slack URL 자동 포함**
   - Linear 이슈 description에 Slack 원본 메시지 링크 항상 포함
   - AI 응답과 무관하게 프로그래밍적으로 보장

7. **Linear 로컬 캐시 동기화**
   - Linear Desktop App의 IndexedDB 캐시 활용
   - 프로젝트별 최근 10개 이슈 제목을 KV에 동기화
   - macOS launchd로 5분마다 자동 동기화
   - AI 프로젝트 추천 정확도 대폭 향상

### 📸 이미지 분석 (Vision)

8. **이미지 자동 감지 + Vision 분석**
   - 스레드 이미지 자동 감지 (PNG, JPEG, GIF, WebP)
   - Claude Haiku Vision API로 이미지 내용 분석
   - R2에 이미지 업로드 → Linear 이슈에 첨부
   - 텍스트 + 이미지 분석 결과 자동 병합

### 🔌 슬래시 커맨드

9. **/project-update** - 프로젝트별 이슈 현황 AI 요약
10. **/initiative-update** - 이니셔티브별 프로젝트 업데이트 현황

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker (Hono)                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Slack Event API                                             │
│       │                                                      │
│       ├── message.channels                                   │
│       │        │                                             │
│       │        └─→ 채널 필터링                               │
│       │             ├─ 00-ai개발-질문 → 🐣 뽀시래기          │
│       │             └─ 기타 채널 → 무시                      │
│       │                                                      │
│       └── reaction_added                                     │
│                │                                             │
│                ├─ :해결: → 뽀시래기 Done 처리                │
│                └─ :이슈:/:issue: → 🎫 Emoji Issue Creator    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  🐣 뽀시래기 (pposiraegi/)                                   │
│  ├─ question-handler.ts                                      │
│  │   ├─ 메시지 → Claude Haiku 분석                          │
│  │   ├─ @멘션 → Assignee 매핑                               │
│  │   └─ Linear 이슈 생성 + Slack synced thread              │
│  └─ done-handler.ts                                          │
│      └─ :해결: → Linear 이슈 Done 상태                      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  🎫 Emoji Issue Creator (emoji-issue/)                       │
│  ├─ thread-collector.ts                                      │
│  │   └─ 스레드 전체 메시지 수집                             │
│  └─ handler.ts                                               │
│      ├─ Claude로 스레드 맥락 분석                           │
│      ├─ 프로젝트 자동 추천                                   │
│      ├─ 이모지 누른 사람 → Assignee                         │
│      └─ Linear 이슈 생성                                    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  🔧 Utils (utils/)                                           │
│  ├─ token-manager.ts                                         │
│  │   └─ OAuth 토큰 자동 갱신 (24h 만료 대응)                │
│  ├─ user-mapper.ts                                           │
│  │   └─ Slack ↔ Linear 사용자 이메일 매핑                   │
│  └─ signature.ts                                             │
│      └─ Slack 서명 검증                                      │
└─────────────────────────────────────────────────────────────┘
```

## 2026-01-28 (Day 4)

### 12. /project-update 슬래시 커맨드 추가

```
프로젝트별 현황을 슬랙에서 바로 확인할 수 있는 슬래시 커맨드가 있었으면 좋겠어.
```

**Claude 작업:**
- `/health-update` 슬래시 커맨드 구현 (이후 `/project-update`로 rename)
- Linear API에서 프로젝트별 이슈 현황 조회
- AI 요약으로 프로젝트별 핵심 불릿 포인트 생성
- 현재/과거 Cycle의 planned 이슈 포함, canceled 제외

---

## 2026-01-29 (Day 5)

### 13. /initiative-update 이니셔티브 현황 커맨드

```
이니셔티브별로 프로젝트 업데이트를 한눈에 보고 싶어.
```

**Claude 작업:**
- `src/services/linear-client.ts` - 이니셔티브 GraphQL 쿼리 추가
- `src/handlers/initiative-update.ts` - 이니셔티브별 프로젝트 업데이트 핸들러
- AI 요약으로 프로젝트별 핵심 2-3개 불릿 출력
- `/initiative-update` 슬래시 커맨드 라우터 등록

### 14. 뽀시래기 프로젝트/마일스톤 자동 할당 + 이슈 작성자 표시

```
뽀시래기가 만드는 이슈에 프로젝트랑 마일스톤도 자동으로 붙여줘.
이모지 누른 사람의 아바타로 이슈 작성자가 표시되면 좋겠어.
```

**Claude 작업:**
- `createAsUser`, `displayIconUrl` 필드로 이모지 누른 사용자로 이슈 작성자 표시
- 뽀시래기 전용 프로젝트/마일스톤 ID를 환경변수로 설정
- 프로젝트 `description` + `content` 필드를 AI 프롬프트에 추가

---

## 2026-02-09 (Day 6)

### 15. :x: 이모지 → Linear 이슈 삭제 기능

```
잘못 만든 이슈 삭제도 이모지로 하고 싶어. :x: 이모지 누르면 삭제되게.
```

**Claude 작업:**
- `CANCEL_EMOJI` 환경변수 추가 ("x")
- KV에서 Slack message - Linear issue 매핑으로 삭제 대상 식별
- 다른 팀 이슈도 `stateId`를 동적으로 처리하여 validation error 방지

---

## 2026-02-10 (Day 7)

### 16. Linear API Validation Error 자동 재시도

```
가끔 이슈 생성이 실패하는데, Argument Validation Error가 뜨는 경우가 있어.
```

**Claude 작업:**
- `projectId`/`estimate` 값 사전 검증 로직 추가
- Linear `createIssue` API 실패 시 자동 재시도 (invalid 필드 제거 후 재시도)
- 실패 알림 메시지에 에러 상세 정보 포함

---

## 2026-02-12 (Day 8)

### 17. 긴 스레드 트리밍 + Done 핸들러 개선

```
스레드가 너무 길면 AI 분석이 느려지고 정확도도 떨어지는 것 같아.
```

**Claude 작업:**
- `thread-collector.ts` - 타겟 메시지 중심 트리밍 로직
  - 최대 15개 메시지, 타겟 앞 5개 + 뒤 3개 컨텍스트
  - 메시지당 최대 1,500자 제한
- Done 핸들러: OAuth 토큰으로 이모지 클릭한 실제 사용자로 표시

### 18. IssueIt 데일리 리포트 자동 발송

```
매일 아침에 이슈 현황 리포트를 자동으로 받고 싶어.
```

**Claude 작업:**
- `src/services/issueit-report.ts` - 데일리 리포트 생성 로직
- Cron trigger (매일 09:40 KST) → Slack DM으로 리포트 자동 발송
- (이후 02/13 비활성화: 리포트 내용 개선 필요)

---

## 2026-02-14 (Day 9)

### 19. 이미지 자동 감지 + Vision 분석 기능 추가

```
:이슈: 이모지 핸들러에 이미지 자동 감지 + Vision 분석 추가.
메시지에 이미지가 첨부되어 있으면 기존 linear-capture-ai Worker의 Vision API로 분석 후 이슈에 포함.
```

**Claude 작업:**
- `src/types/index.ts` - `SlackFile`, `ImageData`, `ImageAnalysisResult` 인터페이스 추가
- `src/handlers/emoji-issue/thread-collector.ts` - `collectThreadImages()` 함수
  - 스레드에서 이미지 파일만 필터링 (PNG, JPEG, GIF, WebP)
  - 타겟 메시지 이미지 우선 배치, 최대 10개 수집
- `src/services/image-processor.ts` - `ImageProcessor` 클래스
  - Slack 파일 다운로드, Base64 인코딩
  - 5MB 초과 시 Slack 썸네일 자동 폴백
  - magic bytes 검증으로 이미지 무결성 확인
  - Vision API(Haiku) 분석 + R2 업로드
- `src/handlers/emoji-issue/handler.ts` - 이미지 파이프라인 통합
  - 텍스트 + 이미지 병렬 수집, Vision 분석 + R2 업로드 병렬 실행
  - `mergeAnalysisResults()` - 텍스트 우선, 이미지 보강 병합

### 20. Slack 파일 다운로드 실패 디버깅 + 해결

```
downloadFile()이 이미지 대신 Slack HTML 로그인 페이지를 받고 있음.
Downloaded 53269B, magic:[60,33,68,79] ← "<!DO" = HTML
```

**문제 진단 과정:**
1. 기본 `fetch(url, { Authorization })` → CDN redirect 시 Auth 헤더 drop
2. `redirect: manual` + CDN은 Auth 없이 → 여전히 HTML
3. 디버그 엔드포인트(`/debug/scopes`)로 봇 토큰 스코프 확인
4. **근본 원인: 봇 토큰에 `files:read` 스코프 누락**

**해결:**
- Slack App(linear-issue-bot)에 `files:read` 스코프 추가 + Reinstall
- `downloadFile()` 3단계 폴백 전략: redirect:manual → url_private_download → direct fetch
- 각 단계 진단 로그 추가

### 21. Worker-to-Worker 통신 실패 해결 (Service Binding)

```
이미지 다운로드는 성공했는데 Vision API에서 404 error code: 1042
curl로 직접 호출하면 정상 — Worker-to-Worker 호출 문제
```

**문제:** Cloudflare 같은 계정 Worker 간 `workers.dev` 도메인 fetch 시 라우팅 제한

**해결:**
- `wrangler.toml`에 Service Binding 추가: `[[services]] binding = "AI_WORKER" service = "linear-capture-ai"`
- `ImageProcessor`에서 `workerFetch()` 메서드로 Service Binding 우선 사용
- Vision 분석 + R2 업로드 모두 성공 확인
