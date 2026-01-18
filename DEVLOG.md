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

## 커밋 히스토리

| 날짜 | 커밋 | 설명 |
|------|------|------|
| 01/18 | `0642b74` | feat: Slack → Linear 이슈 자동화 시스템 초기 커밋 |
| 01/18 | `f2e9702` | feat: Slack-Linear 양방향 동기화 및 Slack 링크 자동 추가 |

---

## 기술 스택

- **Runtime**: Cloudflare Workers (V8 isolates, 0 cold start)
- **Framework**: Hono (경량 웹 프레임워크)
- **AI**: Anthropic Claude Haiku 4.5
- **Storage**: Cloudflare KV (이슈 매핑, 중복 방지)
- **APIs**: Slack Web API, Linear GraphQL API

---

## 주요 기능

1. **Slack → Linear 이슈 자동 생성**
   - `00-ai개발-질문` 채널 메시지 감지
   - Claude Haiku로 제목/설명 자동 생성
   - @멘션된 사용자를 Assignee로 매핑

2. **:해결: 이모지 → Done 처리**
   - 커스텀 이모지 :해결: 달면 Linear 이슈 Done 상태로 변경
   - 스레드 댓글에 달아도 원본 이슈 처리

3. **Slack 스레드 → Linear 댓글 동기화**
   - 스레드에 달린 댓글이 Linear 이슈 코멘트로 자동 추가
   - 봇 메시지는 스킵

4. **Slack URL 자동 포함**
   - Linear 이슈 description에 Slack 원본 메시지 링크 항상 포함
   - AI 응답과 무관하게 프로그래밍적으로 보장

---

## 아키텍처

```
Slack 채널 메시지
       ↓
Slack Event API (message.channels)
       ↓
Cloudflare Worker (Hono)
       ├─ 1. 서명 검증
       ├─ 2. 채널 필터링 (00-ai개발-질문만)
       ├─ 3. 스레드 응답 → Linear 댓글
       ├─ 4. Claude Haiku로 제목/설명 생성
       ├─ 5. @멘션 → Assignee 매핑
       └─ 6. Linear 이슈 생성
       ↓
Slack 스레드에 이슈 링크 자동 답글

:해결: 이모지 추가
       ↓
Linear 이슈 → Done 상태
```
