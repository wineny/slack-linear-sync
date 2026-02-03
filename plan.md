# Linear 프로젝트 통합 계획

## 개요

`linear-mcp-fast`(로컬 캐시 리더)를 활용하여 Linear Capture와 Linear Rona Bot의 성능을 개선하고, API 호출을 최소화하는 통합 아키텍처 구축.

---

## 현재 상태

### 프로젝트 구성

| 프로젝트 | 위치 | 역할 | 기술 스택 |
|---------|------|------|----------|
| **linear-mcp-fast** | `linear-mcp-fast/` | Linear 로컬 캐시 읽기 (MCP 서버) | Python, ccl_chromium_reader |
| **Linear Capture** | `linear_project/linear-capture/` | 스크린샷 → Linear 이슈 생성 | Electron, TypeScript |
| **Linear Rona Bot** | `linear_project/linear-rona-bot/` | Cycle 리마인더 봇 | Cloudflare Workers, Hono |

### 로컬 캐시 데이터 (linear-mcp-fast)

| 항목 | 수량 |
|------|------|
| Teams | 2개 (EDU, DEV) |
| Users | 34명 |
| Workflow States | 21개 |
| Issues | 5,166개 |
| Comments | 1,426개 |
| Projects | 188개 |

---

## 문제점 및 제약

### linear-mcp-fast 제약

| 조건 | 제약 |
|------|------|
| macOS 전용 | `~/Library/Application Support/Linear/` 경로 |
| Linear.app 필요 | 데스크톱 앱이 캐시 생성 |
| 읽기 전용 | 쓰기 작업은 Linear API 필요 |
| 로컬 실행만 | 서버리스 환경 불가 |

### 프로젝트별 현황

| 프로젝트 | 실행 환경 | 로컬 캐시 사용 가능? |
|---------|----------|---------------------|
| Linear Capture | 사용자 macOS | ⚠️ Linear.app 설치된 경우만 |
| Linear Rona Bot | Cloudflare Worker | ❌ 서버리스라 불가 |

---

## 통합 아키텍처

### 목표

1. **API 호출 최소화**: 읽기는 로컬 캐시, 쓰기만 API
2. **Fallback 전략**: 캐시 없으면 API로 graceful degradation
3. **로컬 우선**: 내 환경에서 먼저 검증 후 확장

### 전체 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Linear.app (Electron)                         │
│                              ↓ 동기화                                │
├─────────────────────────────────────────────────────────────────────┤
│                     IndexedDB 로컬 캐시                              │
│           ~/Library/Application Support/Linear/IndexedDB/            │
│                              ↓ 읽기                                  │
├─────────────────────────────────────────────────────────────────────┤
│                      linear-mcp-fast (Python)                        │
│                    LinearLocalReader 클래스                          │
│                              ↓                                       │
├──────────────────────┬──────────────────────┬───────────────────────┤
│   Linear Capture     │  Linear Rona Local   │    Claude Code        │
│   (Electron App)     │  (Python Script)     │    (MCP Server)       │
│                      │                      │                       │
│  - 팀/프로젝트 조회   │  - 이슈 분석/필터    │  - 대화형 조회        │
│  - 담당자 자동완성   │  - Cycle 체크        │  - 이슈 검색          │
│  - Fallback: API     │  - 리마인더 발송     │  - 통계 분석          │
└──────────────────────┴──────────────────────┴───────────────────────┘
                              ↓ 쓰기만
                    ┌─────────────────────┐
                    │    Linear API       │
                    │  (이슈 생성/댓글)    │
                    └─────────────────────┘
```

---

## Phase 1: linear-mcp-fast 라이브러리화

### 목표
MCP 서버 외에도 직접 import해서 사용할 수 있도록 정리

### 작업 내용

1. **패키지 구조 정리**
   ```
   linear-mcp-fast/
   └── src/linear_mcp_fast/
       ├── __init__.py      # LinearLocalReader export
       ├── reader.py        # 핵심 로직 (변경 없음)
       ├── store_detector.py
       └── server.py        # MCP 서버 (기존)
   ```

2. **사용법**
   ```python
   # MCP 서버로 사용
   uvx linear-mcp-fast
   
   # Python 라이브러리로 직접 사용
   from linear_mcp_fast import LinearLocalReader
   
   reader = LinearLocalReader()
   issues = reader.issues
   teams = reader.teams
   ```

### 완료 조건
- [ ] `from linear_mcp_fast import LinearLocalReader` 동작 확인
- [ ] 기존 MCP 서버 기능 유지

---

## Phase 2: Linear Capture 연동

### 목표
팀/프로젝트/담당자 조회 시 로컬 캐시 우선 사용

### 현재 흐름
```
사용자 캡처 → AI 분석 → Linear API로 팀 목록 조회 → 이슈 생성 폼 표시
```

### 개선 흐름
```
사용자 캡처 → AI 분석 → 로컬 캐시 조회 (없으면 API) → 이슈 생성 폼 표시
```

### 구현 방안

#### 옵션 A: Node.js에서 Python 호출
```typescript
// linear-capture/src/services/local-cache.ts
import { execSync } from 'child_process';

export async function getTeamsFromCache(): Promise<Team[] | null> {
  try {
    const result = execSync('python3 -c "from linear_mcp_fast import LinearLocalReader; import json; r = LinearLocalReader(); print(json.dumps(list(r.teams.values())))"');
    return JSON.parse(result.toString());
  } catch {
    return null; // Fallback to API
  }
}
```

#### 옵션 B: 캐시 파일 직접 읽기 (순수 TypeScript)
ccl_chromium_reader를 TypeScript로 포팅 (복잡함, 비추천)

#### 옵션 C: 로컬 HTTP 서버
linear-mcp-fast를 HTTP API로도 노출 (추가 프로세스 필요)

**추천: 옵션 A** - 가장 단순하고 빠름

### 작업 내용

1. **로컬 캐시 서비스 추가**
   ```
   linear-capture/src/services/
   ├── linear-client.ts      # 기존 API 클라이언트
   └── local-cache.ts        # 새로 추가 (Python 호출)
   ```

2. **Fallback 로직 구현**
   ```typescript
   // linear-capture/src/services/linear-client.ts
   export async function getTeams(): Promise<Team[]> {
     // 1. 로컬 캐시 시도
     const cached = await getTeamsFromCache();
     if (cached && cached.length > 0) {
       console.log('[LinearClient] Using local cache');
       return cached;
     }
     
     // 2. Fallback: API
     console.log('[LinearClient] Cache miss, using API');
     return await this.client.teams();
   }
   ```

3. **적용 대상**
   - `getTeams()` - 팀 목록
   - `getProjects()` - 프로젝트 목록
   - `getUsers()` - 담당자 목록
   - `getCycles()` - 사이클 목록

### 완료 조건
- [ ] Linear.app 있으면 API 호출 없이 팀/프로젝트 표시
- [ ] Linear.app 없어도 정상 동작 (API fallback)
- [ ] 기존 기능 모두 유지

---

## Phase 3: Linear Rona Local (로컬 리마인더)

### 목표
Cloudflare Worker 대신 로컬에서 실행하는 리마인더 스크립트

### 아키텍처

```
[기존 - Cloudflare Worker]
Cron (UTC 00:30) → Worker → Linear API 조회 → Linear API 댓글 → Slack DM

[로컬 모드]
macOS launchd → Python → 로컬 캐시 조회 → Linear API 댓글 → Slack DM
                              ↓
                        API 호출 최소화
                        (읽기 0, 쓰기만)
```

### 디렉토리 구조

```
linear_project/
├── linear-rona-bot/          # 기존 (Cloudflare Worker, 유지)
└── linear-rona-local/        # 새로 추가
    ├── __init__.py
    ├── reminder.py           # 메인 리마인더 로직
    ├── slack_notifier.py     # Slack DM 발송
    ├── linear_writer.py      # Linear API 댓글 작성
    ├── config.py             # 설정 (토큰, 사용자 등)
    ├── run.py                # CLI 엔트리포인트
    └── com.gpters.linear-rona-local.plist  # macOS launchd
```

### 핵심 로직

```python
# linear-rona-local/reminder.py
from linear_mcp_fast import LinearLocalReader

class LocalReminder:
    def __init__(self):
        self.reader = LinearLocalReader()
    
    def get_issues_needing_reminder(self, user_email: str) -> list[dict]:
        """리마인더 대상 이슈 조회 (로컬 캐시)"""
        user = self.reader.find_user(user_email)
        if not user:
            return []
        
        issues = []
        for issue in self.reader.issues.values():
            if issue.get('assigneeId') != user['id']:
                continue
            
            state_type = self.reader.get_state_type(issue.get('stateId', ''))
            
            # 제외 조건
            if state_type in ('completed', 'canceled', 'backlog', 'triage'):
                continue
            
            # Cycle 체크
            # TODO: cycle 정보는 현재 캐시에 없음 → 추가 필요
            
            issues.append(issue)
        
        return issues
    
    def send_reminders(self, issues: list[dict]):
        """리마인더 발송 (API 사용)"""
        for issue in issues:
            # Linear 댓글 작성 (API)
            self.linear_writer.add_comment(issue['id'], self._generate_message())
            
            # Slack DM (API)
            self.slack_notifier.send_dm(issue)
```

### 스케줄러 설정 (macOS launchd)

```xml
<!-- ~/Library/LaunchAgents/com.gpters.linear-rona-local.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.gpters.linear-rona-local</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>/Users/wine_ny/side-project/linear_project/linear-rona-local/run.py</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>30</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/linear-rona-local.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/linear-rona-local.err</string>
</dict>
</plist>
```

### 설치/실행

```bash
# 설치
cp com.gpters.linear-rona-local.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.gpters.linear-rona-local.plist

# 수동 실행 (테스트)
cd linear_project/linear-rona-local
python run.py

# 로그 확인
tail -f /tmp/linear-rona-local.log
```

### 추가 필요 작업

1. **Cycle 정보 캐시 추가**
   - 현재 `linear-mcp-fast`에 Cycle 스토어 감지 없음
   - `store_detector.py`에 `_is_cycle_record()` 추가 필요

2. **환경 변수 / 설정**
   ```python
   # config.py
   LINEAR_API_KEY = "lin_api_..."  # 댓글 작성용
   SLACK_BOT_TOKEN = "xoxb-..."    # DM 발송용
   TARGET_USER_EMAIL = "ny@gpters.org"  # 테스트 대상
   ```

### 완료 조건
- [ ] `python run.py`로 리마인더 대상 이슈 조회
- [ ] Linear 댓글 작성 동작
- [ ] Slack DM 발송 동작
- [ ] launchd로 매일 09:30 자동 실행

---

## Phase 4: Cycle 캐시 추가

### 목표
linear-mcp-fast에 Cycle 정보 추가

### 작업 내용

1. **store_detector.py 수정**
   ```python
   def _is_cycle_record(record: dict[str, Any]) -> bool:
       """Check if a record looks like a cycle."""
       required = {"number", "teamId", "startsAt", "endsAt"}
       return required.issubset(record.keys())
   ```

2. **reader.py 수정**
   ```python
   @dataclass
   class CachedData:
       # ... 기존 필드
       cycles: dict[str, dict[str, Any]] = field(default_factory=dict)
   ```

3. **서버에 도구 추가**
   ```python
   @mcp.tool()
   def list_cycles(team: str) -> list[dict]:
       """List cycles for a team."""
   ```

### 완료 조건
- [ ] `reader.cycles`로 Cycle 데이터 접근 가능
- [ ] `list_cycles` MCP 도구 동작

---

## 우선순위 및 일정

| Phase | 작업 | 예상 소요 | 의존성 |
|-------|------|----------|--------|
| **1** | linear-mcp-fast 라이브러리화 | 30분 | 없음 |
| **2** | Linear Capture 연동 | 2시간 | Phase 1 |
| **3** | Linear Rona Local 기본 | 3시간 | Phase 1 |
| **4** | Cycle 캐시 추가 | 1시간 | Phase 1 |
| **3+4** | Rona Local + Cycle 통합 | 1시간 | Phase 3, 4 |

### 추천 진행 순서

```
Phase 1 → Phase 4 → Phase 3 → Phase 2
```

이유:
1. Phase 1은 모든 작업의 기반
2. Phase 4 (Cycle)는 Rona에 필수
3. Phase 3 (Rona Local)이 핵심 목표
4. Phase 2 (Capture)는 부가 개선

---

## 향후 확장 가능성

### 통합 대시보드 CLI

```bash
# 팀 현황
linear-local status --team EDU

# 내 이슈
linear-local my-issues --state started

# Cycle 진행률
linear-local cycle --current
```

### 다른 도구 연동

- **Alfred Workflow**: 빠른 이슈 검색
- **Raycast Extension**: 이슈 미리보기
- **Obsidian Plugin**: 노트에 이슈 임베드

---

## 참고 자료

- [linear-mcp-fast README](../linear-mcp-fast/README.md)
- [Linear Capture README](./linear-capture/README.md)
- [Linear Rona Bot 설정](./CLAUDE.md#linear-rona-bot-cloudflare-workers)
