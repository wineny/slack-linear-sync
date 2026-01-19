# 계획적인 로나 - Cycle 기반 리마인더 시스템

## 현재 상태 (2026-01-19)

### ✅ 완료된 기능 (Phase 1-3)
- OAuth 플로우 (토큰 발급 및 KV 저장)
- Cycle 미등록 이슈 감지 및 댓글
- Cycle 지난 이슈 감지 및 댓글
- 귀여운 잔소리 메시지 템플릿
- Cron 스케줄 (평일 09:30 KST)
- 테스트 모드 (ny@gpters.org만 대상)
- 상태 필터링 (Done, Backlog, Canceled, Duplicate, Triage 제외)
- 배치 처리 (MAX_COMMENTS_PER_RUN = 15)
- 중복 방지 KV 로직
- 개인 빈도 설정 (`@로나 매일 알림` 등 명령어)
- Webhook 페이로드 파싱 (`payload.notification` 구조)
- slack-linear-sync 이슈 필터링

### ⏳ 검증 대기
1. **중복 방지 로직** - Cron 실행 시 실제 동작 검증
2. **개인 빈도 설정 적용** - Cron에서 빈도별 필터링 동작 확인

### 📋 향후 계획 (Phase 4)
- **전체 팀 확장** - `TEST_MODE = false`로 전환 (충분한 테스트 후)

---

## 파일 구조

```
linear-rona-bot/src/
├── index.ts                      # Hono 라우터 + Cron export
├── routes/
│   ├── oauth.ts                  # OAuth 플로우
│   └── webhook.ts                # Webhook 처리 (봇 멘션, 설정 명령)
├── services/
│   ├── linear-client.ts          # GraphQL 클라이언트
│   └── reminder-service.ts       # 리마인더 로직
├── cron/
│   └── cycle-reminder.ts         # Cron 핸들러
├── handlers/
│   └── user-config.ts            # 개인 설정 파싱
├── utils/
│   ├── issue-source.ts           # 이슈 출처 판별
│   └── message-templates.ts      # 잔소리 메시지
└── types/
    └── index.ts                  # 타입 + 팀/상태 상수
```

---

## 주요 설정

### Cron 스케줄
```
30 0 * * 1-5  # 평일 09:30 KST (UTC 00:30)
```

### 빈도 옵션
| 빈도 | 실행 요일 | 설정 명령 |
|------|----------|----------|
| daily | 월~금 | `@로나 매일 알림` |
| mon-wed-fri | 월, 수, 금 | `@로나 월수금 알림` |
| weekly | 월요일 (기본) | `@로나 주간 알림` |
| off | 없음 | `@로나 알림 끄기` |

### 배치 제한
- `MAX_COMMENTS_PER_RUN = 15`
- Cloudflare Workers subrequest 제한 (50개) 대응
- 15개 댓글 × 3 subrequest (KV get + API + KV put) = 45개

---

## 리마인더 대상 조건

### 포함 (Todo, In Progress, In Review 상태)
- Cycle 미등록 이슈 (`cycle === null`)
- Cycle 지난 이슈 (`cycle.endsAt < today`)

### 제외
| 조건 | 이유 |
|------|------|
| 상태: Done, Backlog, Canceled, Duplicate, Triage | 관리 불필요 |
| slack-linear-sync 이슈 | Slack 질문 기반이라 Cycle 개념 부적합 |
| 이번 주 이미 리마인드한 이슈 | 중복 방지 (KV 체크) |
| 담당자 없음 | 알림 대상 없음 |
| 사용자 빈도 설정 불일치 | 개인 설정 존중 |

---

## 중복 방지 KV

```
키: reminder:{issueId}:{type}:{weekNumber}
값: ISO timestamp
TTL: 7일
예: reminder:abc123:no-cycle:2026-W03
```

---

## 테스트 사용자 (Phase 1)

| 이름 | 이메일 | ID |
|------|--------|-----|
| 윤누리 | ny@gpters.org | 686312fd-f7a2-49d2-89cd-592f4600eb40 |

`reminder-service.ts`에서 `TEST_MODE = true` 설정됨.

---

## 개발 명령어

```bash
cd linear-rona-bot
npm run dev          # 로컬 개발
npm run deploy       # 배포

# Cron 수동 테스트 (로컬)
curl "http://localhost:8787/cron/trigger"
```

---

## 배포 정보

- **URL**: `https://linear-rona-bot.ny-4f1.workers.dev`
- **KV Namespace**: `LINEAR_TOKENS`
