# slack-linear-sync 프로젝트 가이드

> ⚠️ **AI를 위한 중요 안내**: 이 프로젝트에는 **두 가지 독립적인 기능**이 있습니다. 코드 수정 시 반드시 올바른 폴더에서 작업하세요!

---

## 🎯 기능 구분 (매우 중요!)

### 1. 🐣 뽀시래기 (Pposiraegi)

**목적**: 특정 채널에 질문 올리면 자동으로 이슈 생성

| 항목 | 값 |
|------|-----|
| **코드 위치** | `src/handlers/pposiraegi/` |
| **트리거** | `00-ai개발-질문` 채널에 메시지 작성 |
| **Assignee** | 메시지에서 멘션된 사람 |
| **팀** | 고정 (`LINEAR_TEAM_ID` = Education) |
| **완료 처리** | `:해결:` 이모지 (`DONE_EMOJI`) |

**관련 파일**:
```
src/handlers/pposiraegi/
├── index.ts              # export
├── question-handler.ts   # 질문 → 이슈 생성
└── done-handler.ts       # :해결: → Done 처리
```

### 2. 🎫 Emoji Issue Creator

**목적**: 어디서든 이모지로 이슈 생성

| 항목 | 값 |
|------|-----|
| **코드 위치** | `src/handlers/emoji-issue/` |
| **트리거** | `:이슈:` 커스텀 이모지 클릭 |
| **범위** | 봇이 초대된 모든 채널 |
| **Assignee** | 이모지 누른 사람 |
| **팀** | AI가 프로젝트 추천 → 팀 자동 결정 |

**관련 파일**:
```
src/handlers/emoji-issue/
├── index.ts              # export
├── handler.ts            # :이슈: → 이슈 생성
├── thread-collector.ts   # 스레드 메시지 수집 + 타겟 메시지 구분
└── constants.ts          # 상수
```

#### 🎯 타겟 메시지 구분 기능

스레드에 여러 메시지가 있을 때, **이모지가 달린 특정 메시지**를 중심으로 이슈가 생성됨.

**동작 방식**:
```
스레드 예시:
1. A: "이거 어떻게 하면 좋을까?"
2. B: "API 수정하면 될 것 같아"
3. A: "좋은 아이디어! 근데 인증 문제가 있어"  ← :이슈: 이모지 달림
4. B: "토큰 갱신 로직 추가하면 해결돼"

결과:
- 3번 메시지 = 이슈의 핵심 (🎯 이슈 대상으로 표시)
- 1, 2, 4번 = 맥락(context)으로 활용
```

**구현 위치**:
- `thread-collector.ts`: `CollectedMessage.isTarget` 필드로 타겟 메시지 표시
- `ai-analyzer.ts`: AI 프롬프트에서 `[🎯 이슈 대상]` 마커 + 가이드 추가

#### 🎯 프로젝트 자동 추천 기능

AI가 대화 내용을 분석하여 적절한 프로젝트를 자동 추천하고 Linear 이슈에 할당합니다.

**동작 방식**:
1. Linear API에서 `started` + `planned` 상태 프로젝트 조회
2. AI에게 팀별로 그룹핑된 프로젝트 목록 전달
3. AI가 키워드/맥락 기반으로 프로젝트 ID 선택
4. `createIssue` 시 `projectId` 전달하여 할당

**프로젝트 선택 기준** (AI 프롬프트):
- 키워드 매칭: "Linear" → Linear 프로젝트, "교육" → 교육 프로젝트
- 팀 컨텍스트: 개발/API → Product 팀, 교육/운영 → Education 팀
- 불확실하면 가장 포괄적인 프로젝트 선택

**관련 코드**:
- `ai-analyzer.ts`: `buildContextSection()` - 팀별 프로젝트 그룹핑 + 선택 규칙
- `linear-client.ts`: `getProjects()` - started/planned 프로젝트 조회, team name 포함
- `handler.ts`: `createIssue({ projectId })` - 프로젝트 할당

---

## 📁 전체 프로젝트 구조

```
slack-linear-sync/
├── src/
│   ├── index.ts                      # Hono 라우터
│   │
│   ├── handlers/
│   │   ├── slack-events.ts           # 이벤트 라우터 (분기만)
│   │   ├── slack-reactions.ts        # 리액션 라우터 (분기만)
│   │   │
│   │   ├── pposiraegi/               # 🐣 뽀시래기 전용
│   │   │   ├── index.ts
│   │   │   ├── question-handler.ts
│   │   │   └── done-handler.ts
│   │   │
│   │   └── emoji-issue/              # 🎫 Emoji Issue Creator 전용
│   │       ├── index.ts
│   │       ├── handler.ts
│   │       ├── thread-collector.ts
│   │       └── constants.ts
│   │
│   ├── services/
│   │   ├── slack-client.ts           # Slack API
│   │   ├── linear-client.ts          # Linear GraphQL
│   │   ├── ai-analyzer.ts            # Claude (뽀시래기용)
│   │   └── ai-worker-client.ts       # Worker API (Emoji Issue용)
│   │
│   ├── types/
│   │   ├── index.ts                  # 공통 타입
│   │   ├── pposiraegi.ts             # 뽀시래기 타입
│   │   └── emoji-issue.ts            # Emoji Issue 타입
│   │
│   └── utils/
│       ├── signature.ts
│       ├── token-manager.ts
│       └── user-mapper.ts
│
├── wrangler.toml
├── package.json
├── README.md
├── CLAUDE.md                         # 이 파일
├── PLAN_EMOJI_ISSUE_CREATOR.md       # Emoji Issue 상세 계획
└── DEVLOG.md
```

---

## ⚙️ 환경 변수

### wrangler.toml

```toml
[vars]
# 🐣 뽀시래기 설정
TARGET_CHANNEL_NAME = "00-ai개발-질문"
LINEAR_TEAM_ID = "e108ae14-a354-4c09-86ac-6c1186bc6132"
LINEAR_DEFAULT_STATE_ID = "6dc4154e-3a35-43d2-ac44-e3d66df85c9b"
LINEAR_DONE_STATE_ID = "8af3af6f-d60f-4d57-bac2-fcd557488d93"
DONE_EMOJI = "해결"

# 🎫 Emoji Issue Creator 설정
ISSUE_EMOJI = "이슈"
AI_WORKER_URL = "https://linear-capture-ai.ny-4f1.workers.dev"
```

---

## 🔀 이벤트 흐름

### 메시지 이벤트 (slack-events.ts)

```
message 이벤트 수신
    │
    ├── 채널이 TARGET_CHANNEL_NAME 인가?
    │   └── YES → 뽀시래기: question-handler.ts
    │
    └── NO → 무시
```

### 리액션 이벤트 (slack-reactions.ts)

```
reaction_added 이벤트 수신
    │
    ├── 이모지가 ISSUE_EMOJI (이슈) 인가?
    │   └── YES → Emoji Issue: handler.ts
    │
    ├── 이모지가 DONE_EMOJI (해결) 인가?
    │   └── YES → 뽀시래기: done-handler.ts
    │
    └── 그 외 → 무시
```

---

## 🛠️ 개발 가이드

### 뽀시래기 수정 시

```bash
# 관련 파일만 수정
src/handlers/pposiraegi/*.ts
src/services/ai-analyzer.ts      # 뽀시래기 전용 AI
```

### Emoji Issue Creator 수정 시

```bash
# 관련 파일만 수정
src/handlers/emoji-issue/*.ts
src/services/ai-worker-client.ts  # Worker API 호출
```

### 공통 로직 수정 시

```bash
# 양쪽에서 사용
src/services/slack-client.ts
src/services/linear-client.ts
src/utils/*.ts
```

---

## 📋 참고 문서

- [Emoji Issue Creator 구현 계획](./PLAN_EMOJI_ISSUE_CREATOR.md)
- [Linear API 캐시](../CLAUDE.md) - 프로젝트 ID, 팀 ID 등
- [linear-capture-worker](../linear-capture-worker/) - AI 프롬프트 공유

---

## ⚠️ 주의사항

1. **코드 분리 유지**: 뽀시래기와 Emoji Issue Creator 코드를 섞지 마세요
2. **환경 변수 구분**: `DONE_EMOJI`는 뽀시래기, `ISSUE_EMOJI`는 Emoji Issue Creator
3. **AI 분석기 구분**: 
   - `ai-analyzer.ts` → 뽀시래기 전용 (직접 Claude 호출)
   - `ai-worker-client.ts` → Emoji Issue Creator 전용 (Worker API 호출)
