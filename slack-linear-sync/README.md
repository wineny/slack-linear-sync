# Slack → Linear 이슈 자동화

Slack `00-ai개발-질문` 채널에 질문이 올라오면 자동으로 Linear 이슈를 생성합니다.

## 기능

- **AI 분석**: Claude Haiku로 질문을 분석하여 제목/설명 자동 생성
- **사용자 매핑**: Slack 이메일 → Linear 이메일로 Assignee 자동 설정
- **알림**: Slack 스레드에 생성된 이슈 링크 자동 답글
- **중복 방지**: KV 기반 메시지 처리 추적

## 설정 방법

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

#### Event Subscriptions 설정
1. Enable Events: On
2. Request URL: `https://slack-linear-sync.<account>.workers.dev/slack/events`
3. Subscribe to bot events:
   - `message.channels`

### 2. 환경 변수 설정

```bash
# .dev.vars 파일 생성 (로컬 개발용)
cp .dev.vars.example .dev.vars

# 값 채우기
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
LINEAR_API_TOKEN=lin_api_...
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. KV Namespace 생성

```bash
# KV namespace 생성
wrangler kv:namespace create "PROCESSED_MESSAGES"

# 출력된 id를 wrangler.toml에 추가
```

`wrangler.toml` 수정:
```toml
[[kv_namespaces]]
binding = "PROCESSED_MESSAGES"
id = "<your-kv-namespace-id>"
```

### 4. 로컬 개발

```bash
npm run dev
```

ngrok으로 터널링:
```bash
ngrok http 8787
```

Slack App의 Request URL을 ngrok URL로 변경.

### 5. 배포

```bash
# Secrets 설정
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put LINEAR_API_TOKEN
wrangler secret put ANTHROPIC_API_KEY

# 배포
npm run deploy
```

### 6. 채널에 봇 초대

```
/invite @Linear Issue Creator
```

## 파일 구조

```
src/
├── index.ts              # Hono 라우터
├── handlers/
│   └── slack-events.ts   # Slack 이벤트 처리
├── services/
│   ├── slack-client.ts   # Slack API
│   ├── linear-client.ts  # Linear GraphQL
│   └── ai-analyzer.ts    # Claude Haiku
├── utils/
│   ├── signature.ts      # 서명 검증
│   └── user-mapper.ts    # 이메일 매핑
└── types/
    └── index.ts          # TypeScript 타입
```

## 트러블슈팅

### "Invalid signature" 에러
- `SLACK_SIGNING_SECRET`이 올바른지 확인
- Slack App의 Basic Information에서 복사

### 이슈가 생성되지 않음
- 봇이 채널에 초대되었는지 확인
- Linear API 토큰 권한 확인
- `wrangler tail`로 로그 확인

### Assignee가 설정되지 않음
- Slack과 Linear에서 같은 이메일 사용 확인
- `users:read.email` 권한 확인
