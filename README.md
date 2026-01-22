# Slack → Linear 자동화

Slack과 Linear를 연동하는 Cloudflare Worker 프로젝트입니다.

---

## 🎯 두 가지 독립적인 기능

이 프로젝트에는 **완전히 분리된 두 가지 기능**이 있습니다:

### 1. 🐣 뽀시래기 (Pposiraegi) - 자동 질문 이슈화

> **특정 채널**에 질문을 올리면 **자동으로** Linear 이슈가 생성됩니다.

| 항목 | 내용 |
|------|------|
| 트리거 | `00-ai개발-질문` 채널에 메시지 작성 |
| 동작 | 메시지 작성 = 자동 이슈 생성 |
| AI 분석 | Claude Haiku로 제목/설명 자동 생성 |
| Assignee | 메시지에서 멘션된 사람 |
| 완료 처리 | `:해결:` 이모지로 Done 처리 |
| 코드 위치 | `src/handlers/pposiraegi/` |

### 2. 🎫 Emoji Issue Creator - 이모지로 이슈 생성 (개발 예정)

> **어떤 채널에서든** `:이슈:` 이모지를 누르면 Linear 이슈가 생성됩니다.

| 항목 | 내용 |
|------|------|
| 트리거 | `:이슈:` 커스텀 이모지 클릭 |
| 범위 | 봇이 초대된 모든 채널 |
| AI 분석 | 스레드 전체 맥락을 분석하여 요약 |
| Assignee | 이모지 누른 사람 |
| 팀/프로젝트 | AI가 내용을 보고 자동 추천 |
| 코드 위치 | `src/handlers/emoji-issue/` |

> 📋 상세 계획: [PLAN_EMOJI_ISSUE_CREATOR.md](./PLAN_EMOJI_ISSUE_CREATOR.md)

---

## 📁 프로젝트 구조

```
src/
├── index.ts                      # Hono 라우터
│
├── handlers/
│   ├── slack-events.ts           # Slack 이벤트 라우터
│   ├── slack-reactions.ts        # 리액션 이벤트 라우터
│   │
│   ├── pposiraegi/               # 🐣 뽀시래기 전용
│   │   ├── index.ts
│   │   ├── question-handler.ts   # 질문 → 이슈 생성
│   │   └── done-handler.ts       # :해결: → Done 처리
│   │
│   └── emoji-issue/              # 🎫 Emoji Issue Creator 전용
│       ├── index.ts
│       ├── handler.ts            # :이슈: → 이슈 생성
│       └── thread-collector.ts   # 스레드 메시지 수집
│
├── services/
│   ├── slack-client.ts           # Slack API 클라이언트
│   ├── linear-client.ts          # Linear GraphQL 클라이언트
│   ├── ai-analyzer.ts            # Claude AI 분석 (뽀시래기용)
│   └── ai-worker-client.ts       # Worker API 호출 (Emoji Issue용)
│
├── types/
│   ├── index.ts                  # 공통 타입
│   ├── pposiraegi.ts             # 뽀시래기 전용 타입
│   └── emoji-issue.ts            # Emoji Issue 전용 타입
│
└── utils/
    ├── signature.ts              # Slack 서명 검증
    ├── token-manager.ts          # OAuth 토큰 관리
    └── user-mapper.ts            # Slack ↔ Linear 사용자 매핑
```

---

## ⚙️ 환경 변수

### wrangler.toml

```toml
[vars]
# 🐣 뽀시래기 설정
TARGET_CHANNEL_NAME = "00-ai개발-질문"    # 감시할 채널
LINEAR_TEAM_ID = "..."                    # 기본 팀 ID
LINEAR_DEFAULT_STATE_ID = "..."           # 기본 상태 (Triage 등)
LINEAR_DONE_STATE_ID = "..."              # 완료 상태 ID
DONE_EMOJI = "해결"                       # 완료 이모지

# 🎫 Emoji Issue Creator 설정
ISSUE_EMOJI = "이슈"                      # 이슈 생성 이모지
AI_WORKER_URL = "https://linear-capture-ai.ny-4f1.workers.dev"
```

### Secrets (wrangler secret)

```bash
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put LINEAR_API_TOKEN
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put LINEAR_CLIENT_ID
wrangler secret put LINEAR_CLIENT_SECRET
```

---

## 🚀 설정 방법

### 1. Slack App 생성

1. [api.slack.com/apps](https://api.slack.com/apps) 접속
2. "Create New App" → "From scratch"
3. App Name: `Linear Issue Creator`

#### OAuth Scopes 설정
Bot Token Scopes에서 다음 추가:
- `channels:history` - 채널 메시지 읽기
- `channels:read` - 채널 정보 조회
- `chat:write` - 답글 전송
- `users:read` - 사용자 정보 조회
- `users:read.email` - 사용자 이메일 조회
- `reactions:read` - 리액션 읽기

#### Event Subscriptions 설정
1. Enable Events: On
2. Request URL: `https://slack-linear-sync.<account>.workers.dev/slack/events`
3. Subscribe to bot events:
   - `message.channels`
   - `reaction_added`

### 2. KV Namespace 생성

```bash
# 이슈 매핑 저장용
wrangler kv:namespace create "ISSUE_MAPPINGS"

# OAuth 토큰 저장용 (linear-rona-bot과 공유)
wrangler kv:namespace create "LINEAR_TOKENS"
```

### 3. 로컬 개발

```bash
npm install
npm run dev

# ngrok으로 터널링
ngrok http 8787
```

### 4. 배포

```bash
npm run deploy
```

---

## 🔗 관련 프로젝트

| 프로젝트 | 설명 |
|---------|------|
| [linear-capture](../linear-capture/) | 스크린샷 → Linear 이슈 (Desktop App) |
| [linear-capture-worker](../linear-capture-worker/) | AI 분석 Worker (프롬프트 공유) |
| [linear-rona-bot](../linear-rona-bot/) | OAuth 인증 서버 |

---

## 📝 문서

- [Emoji Issue Creator 구현 계획](./PLAN_EMOJI_ISSUE_CREATOR.md)
- [개발 로그](./DEVLOG.md)
