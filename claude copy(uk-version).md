# Claude

Linear 이슈 작업 시 Git처럼 진행: 먼저 linear pull <이슈ID>로 이슈 정보를 가져오고, 작업 완료 후 linear push <이슈ID>로 변경 내용을 댓글로 기록하고 상태를 업데이트한다.

**linear 리뷰 요청 시**: 허락 구하지 말고 바로 linear-comment subagent 실행한다.

## 업무 시작 시 확인 사항

대화를 시작할 때 다음을 함께 확인하며 업무를 관리합니다:
1. **Linear active issues**: 나에게 할당된 In Progress / Todo / Backlog 이슈 확인
2. **Daily note 업데이트**: Linear에서 확인한 이슈들을 daily note must-have에 반영

사용자가 "오늘 뭐하지?" 또는 업무 시작을 언급하면 Linear를 확인하고 daily note를 맞춰나갑니다.

## 이슈 우선순위 판단

이슈를 추천할 때 다음을 고려합니다:
- **기한 지난 이슈는 우선순위가 더 높을 수 있음** - 단순히 Priority 필드만 보지 말고, 기한이 지났는지도 확인
- Priority 필드 (Urgent > High > Medium > Low)
- 오늘/내일 기한인 이슈
- 블로커가 있는지 여부

## Linear 이슈 생성 규칙

이슈를 생성하기 전에 **기존에 동일한 이슈가 있는지 먼저 확인**합니다. 중복 생성 방지.

이슈를 생성할 때는 항상 다음을 설정합니다:
- **Assignee**: 김욱영 (me)
- **Priority**: 작업의 중요도에 따라 설정 (명확하지 않으면 확인 요청)
- **Project**: 적절한 프로젝트 선택 (명확하지 않으면 확인 요청)
- **Due Date**: 마감일이 있는 경우 설정
- **Estimate**: 예상 소요 시간 설정 (단위: 업무 시간)
- **Status**: 생성 시 기본값은 Backlog 또는 Todo. 대화하면서 바로 작업을 시작하면 "In Progress"로 변경할지 판단 (대화 자체가 업무의 시작이므로)

## Linear Estimate 규칙

Estimate는 업무 시간(hours) 단위로 설정합니다.

**값 의미:**
- **0**: 1시간 미만 (간단한 작업)
- **1+**: 예상 소요 시간 (hours)

**활용:**
- 이슈 생성 시 예상 소요 시간 설정
- 주간/일간 작업량 계획에 활용
- Cycle/Project 진행률 계산에 반영

## 문제 해결 프로세스

Linear 이슈를 해결할 때는 차근차근 함께 진행합니다:

1. **TODO 나열**: 문제를 해결하기 위해 필요한 작업을 TODO로 나열
2. **하나씩 실행**: TODO를 하나하나 함께 해결하면서 진행
3. **진행 상황 업데이트**: 각 TODO 완료 시 상태를 업데이트하며 추적
4. **완수 확인**: 모든 TODO 완료 후 이슈를 Done 처리

TodoWrite 도구를 활용하여 진행 상황을 실시간으로 추적합니다.

## Daily Notes 작업 규칙

업무를 진행할 때는 `00 Daily notes` 폴더의 오늘 날짜 파일에 접속하여 업무를 timeline 방식으로 정리합니다.

**폴더 위치:**
- 폴더 경로: `/Users/everythingchalna/Documents/AMA/Zettel/00 Daily notes`
- 폴더 이름: `00 Daily notes` (이름이 변경될 수 있음)
- Obsidian vault 구조 내에서 일일 작업 기록 공간

**작업 방식:**
- 파일명: 오늘 날짜 (예: `2026-01-07.md`)
- 업무 진행 내용을 시간순으로 timeline 형식으로 기록
- Linear 이슈 작업 내용도 Daily notes에 함께 기록
- **Linear 링크 포함**: 이슈 언급 시 전체 이슈 이름을 하이퍼링크로 추가 (예: `[UK-60 이슈 제목](https://linear.app/commits/issue/UK-60/...)`)
- **작업 시작 시 업데이트**: 새로운 작업을 시작할 때마다 daily note에 바로 기록. TodoWrite와 daily note를 함께 업데이트.
- **실시간 기록**: 사용자가 요청하지 않아도 대화 중 의미 있는 발견/결정이 있으면 바로 기록. 나중에 몰아서 쓰지 말고 흐름에 따라 자연스럽게 추가.
- **수정 시 주의**: 파일 전체를 먼저 읽고, 맨 마지막에 새 내용 추가 (시간 순서 유지)
- **가독성**: 각 항목의 첫 시작은 bullet 없이 제목처럼 작성. 나중에 읽어도 쉽게 이해할 수 있도록 맥락을 포함해서 기록
- **회의/미팅 기록**: 회의 내용을 10 Notes에 정리했으면 daily note에도 요약 + 링크 추가 (예: `상세 내용: [[파일명]]`)
- **10 Notes 연동**: 10 Notes 파일 생성 시 daily note에 해당 작업 기록 추가. 상세 메모와 일일 기록이 연결되도록 함

## 정보성 메모 정리 규칙

정보성 메모를 정리할 때는 `10 Notes` 폴더에 새로운 md 파일을 추가하는 방식으로 진행합니다.

**폴더 위치:**
- 폴더 경로: `/Users/everythingchalna/Documents/AMA/Zettel/10 Notes`

**작업 방식:**
- 새로운 정보나 메모가 생길 때마다 별도의 md 파일로 생성
- 파일명: 메모 주제나 내용을 나타내는 이름 사용
- Daily notes와 달리 주제별로 독립적인 파일 관리

**Daily notes와의 구분:**
- Daily notes: 업무 진행 기록 (이슈 생성/완료, 결정사항, 진행 상황 등)
- 10 Notes: 정보성 콘텐츠 (아티클 정리, 학습 내용, 참고 자료 등)

**콘텐츠 정리 규칙 (아티클, 책, 영상 등):**
1. 구조: 앞단 핵심 (문단 형식, 2-3문장) + 뒷단 상세 (개조식, 누락 없이)
2. 개조식 어미 사용: ~함, ~음, ~임 등 (핵심/상세 모두 적용)
3. 기존 알려진 정보와 Diff를 구분해서 알려줌 (본문 정리 후 마지막에 별도 섹션으로)
4. a) 전문가 관점 b) 일반인 관점에서 해당 콘텐츠가 왜 흥미로운지 설명 포함 (본문 정리 후 마지막에 별도 섹션으로)
5. Bulletpoint를 제외한 Markdown 사용 금지. 특히 h1, strong tag 사용하지 않음
6. 사용자와 같이 정리함. 바로 작성하지 말고, 먼저 사용자에게 강조할 부분 확인 후 진행
7. 코딩처럼 기계적으로 정리하지 말 것. 이야기처럼 자연스럽게 흐르도록 작성. 각 문장이 완전한 의미를 전달하고, 맥락과 논리 흐름이 살아있어야 함

## 20 Inbox 원본 소스 관리

원본 소스(이미지, 링크 등)는 `20 Inbox` 폴더에 저장하고, `10 Notes`에서는 이를 참조합니다.

**폴더 위치:**
- 폴더 경로: `/Users/everythingchalna/Documents/AMA/Zettel/20 Inbox`

**작업 방식:**
- 이미지 파일: 20 Inbox에 직접 저장 (예: `sunset-lamp.jpeg`)
- 10 Notes에서는 `![[파일명]]` 형태로 참조
- 원본 링크(트위터, 웹페이지 등)는 10 Notes 메모 상단에 `source:` 로 기록

**폴더 구조 예시:**
```
20 Inbox/
  └── sunset-lamp.jpeg        # 원본 이미지
10 Notes/
  └── Sunset Lamp.md          # 정리된 메모 (source 링크 + 이미지 참조)
```

**10 Notes와의 관계:**
- 20 Inbox: 원본 자료 보관소 (이미지, 스크린샷 등)
- 10 Notes: 정리된 메모 (20 Inbox 자료를 참조)

## Linear 이슈 작업 워크플로우

### 개념
Linear 이슈를 local markdown 파일로 작업하여 Claude Code의 context-window 압축 시 데이터 손실을 방지합니다.

### 작업 프로세스
1. **Pull**: Linear에서 이슈 정보를 가져와 local md 파일 생성
   - 파일명: `UK-{이슈번호}.md` (예: UK-28.md)
   - 내용: 이슈 제목, 설명, 작업 내용

2. **Work**: Local md 파일에서 작업 진행
   - 생각, 진행 상황, 결과 등을 markdown으로 기록
   - Context가 보존되어 AI와의 대화가 압축되어도 데이터 유지

3. **Push**: 작업 완료 후 Linear에 업데이트
   - md 파일의 작업 내용을 Linear 이슈 **description**에 업데이트
   - 작업 요약을 댓글로도 추가 (선택적)
   - 이슈 상태 업데이트 (Todo → In Progress → Done)
   - **Daily notes 업데이트**: 기계적으로 하지 말고, 기록할 만한 진전이 있을 때 판단하여 업데이트 (예: 의미 있는 발견, 중요한 결정, 작업 완료 등)

### 장점
- Context-window 압축에도 작업 내용 보존
- Daily note와 통합 가능
- Git처럼 버전 관리 개념 적용

## Linear Polling 자동 실행

AMA 폴더에서 `claude` 명령어를 실행하면 Linear polling script가 자동으로 함께 실행됩니다.

**동작 방식:**
- AMA 폴더 내에서 `claude` 실행 → polling script 백그라운드 실행 + Claude Code 시작
- 다른 폴더에서 `claude` 실행 → Claude Code만 시작

**설정 위치:** `~/.zshrc`
```bash
claude() {
  if [[ "$PWD" == "$HOME/Documents/AMA"* ]]; then
    ./scripts/start_linear_polling.sh &
    sleep 2
  fi
  command claude "$@"
}
```

**Polling 기능:**
- commits AI의 Linear 코멘트 답글을 감지
- 답글 감지 시 자동으로 Claude Code 실행하여 작업 수행

## Linear MCP 및 OAuth 설정

### MCP vs OAuth API 구분 (중요)

| 구분 | MCP 도구 | OAuth API (curl) |
|------|----------|------------------|
| 용도 | 읽기 전용 (조회, 검색) | 쓰기 작업 |
| 작업 예시 | 이슈/프로젝트 조회, 상태 확인 | 코멘트, 이슈 생성, Project Updates |
| 표시 이름 | 김욱영 (사용자) | Commits AI (앱) |
| inbox 알림 | X | O |

### 설정 파일

**`.mcp.json`** - MCP 서버용 (읽기 전용)
```json
{
  "mcpServers": {
    "linear-server": {
      "command": "npx",
      "args": ["linear-mcp"],
      "env": {
        "LINEAR_ACCESS_TOKEN": "lin_oauth_..."
      }
    }
  }
}
```

**`.env`** - OAuth API용 (쓰기 작업, Commits AI 명의)
```
```

### 토큰 발급 (actor=app 필수)

**⚠️ 중요: `actor=app` 파라미터가 있어야 Commits AI 명의로 작업됨**

1. localhost:3000 서버 띄우기 (redirect 받기 위해)
2. 인증 URL 접속:

**scope 설명:**
- `read,write`: 기본 읽기/쓰기
- `issues:create,comments:create`: 이슈/코멘트 생성
- `app:assignable,app:mentionable`: 앱에 이슈 배정, 앱 멘션 가능
- `initiative:read,initiative:write`: Initiative 읽기/쓰기

2. 승인 후 redirect URL에서 `code=` 값 복사

3. 토큰 교환:

4. 응답의 `access_token`과 `refresh_token`을 `.env`에 저장

### 토큰 갱신 (24시간마다 만료)

```

### 참고
- npm 패키지 `linear-mcp` 사용 (공식 Linear MCP 플러그인 아님)
- Claude Code 재시작 필요 시 `/mcp` 명령어로 MCP 서버 상태 확인
- **actor=app 없이 발급한 토큰은 사용자 명의로 작업됨 → inbox 알림 안 감**

## Google Calendar 구조

캘린더를 Sync / Solo 두 가지로 분리하여 관리합니다.

**캘린더 목록:**
- **Solo** (Primary): 혼자 하는 작업
  - 이메일/뉴스레터 읽기, 주간 회고, 집중 작업 등
  - 시간 조정이 자유로움
- **Sync**: 다른 사람과의 약속
  - 미팅, 독서모임, 협업 세션 등
  - 상대방이 있어 시간 협의 필요

**분류 기준:**
"이 시간에 다른 사람이 나를 기다리는가?"로 판단

**일정 추가 시:**
사용자가 캘린더 지정하지 않으면 내용 보고 Sync/Solo 판단하여 적절한 캘린더에 추가

**Calendar MCP 주의사항:**
- 이벤트 수정 시 `start_time`과 `end_time`을 항상 함께 제공 (제목만 바꿔도)
- 시간 필드 없이 수정하면 "Missing end time" 에러 발생

## 업무 캘린더 자동 배정

Linear 이슈를 Google Calendar에 자동 배치하여 일정 관리와 작업 기록을 통합합니다.

**업무 시간:**
- 새벽 3시까지 업무 (다음날 03:00까지가 "오늘")
- 일정 배치 시 `date` 명령어로 현재 시간 먼저 확인

**업무 시작 시 ("오늘 뭐하지?" / "오늘 일정 배치해줘"):**
1. Linear에서 오늘 할 이슈 조회:
   - 오늘 due date인 이슈
   - In Progress 상태 이슈
   - 높은 priority (기한 지난 이슈 포함)
2. estimate 기반으로 **Solo 캘린더**에 시간 블록 생성 (개인 업무이므로)
3. 이벤트 형식:
   - 제목: `UK-XX 이슈제목`
   - 설명: Linear 링크 포함
   - 길이: estimate 시간 (0이면 30분)
4. 기존 Sync 일정 피해서 빈 시간에 배치
5. **업무 분할 가능**: 중간에 Sync 일정 등으로 연속 진행이 어려우면 업무를 나눠서 배치

**이슈 작업 시작 시 ("UK-XX 시작" / "UK-XX 작업하자"):**
1. 해당 캘린더 이벤트 찾기
2. 시작 시간을 **현재 시간**으로 조정
3. 없으면 새 이벤트 생성

**이슈 완료 시 (Done 처리할 때):**
1. 해당 캘린더 이벤트 찾기
2. 종료 시간을 **현재 시간**으로 조정
3. 제목에 ✓ 추가: `✓ UK-XX 이슈제목`
4. 이벤트는 삭제하지 않음 → 작업 기록으로 남김
5. Daily notes에도 기록 (기존 규칙대로)
6. **남은 일정 재배치**: 완료 후 다음 이슈들을 앞당겨 배치하고, 사용자에게 업데이트된 일정 안내

**미완료 이슈 자동 재배치:**
- 계획된 시간이 지났는데 ✓가 없는 이벤트 → 자동으로 다음 빈 시간으로 이동
- 재배치 시 기존 Sync 일정과 다른 Solo 이벤트 피해서 배치
- 일정 업데이트/daily note 작성 시 함께 처리

**결과:** 캘린더에 실제 작업한 시간이 기록됨

**캘린더를 보면:**
- 미래: 오늘/이번 주 해야 할 일
- 과거: 완료한 작업 기록 (✓ 표시)

