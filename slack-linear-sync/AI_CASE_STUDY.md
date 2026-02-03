# 에러 재발방지, AI가 Git Hook으로 스스로 개선하게 만들기

## 문제 상황

Slack에서 이모지 누르면 Linear 이슈를 자동 생성해주는 봇(뽀시래기)이 있는데요. 어느 날 갑자기 "이슈 생성 실패: Argument Validation Error"라는 에러가 뜨기 시작했어요.

분명 어제까지 잘 됐는데, 오늘 갑자기 안 되는 상황이었습니다.

## AI한테 원인 분석 요청

Claude Code한테 상황을 설명하고 원인을 찾아달라고 했어요.

```
뽀시래기가 고장났어. 이슈 생성 실패: Argument Validation Error
```

AI가 코드를 분석하더니 빌드 자체가 실패하고 있다는 걸 발견했어요:

```
❌ Could not resolve "../../services/project-cache.js"
```

`project-cache.ts` 파일이 통째로 없어진 거였습니다.

## 범인은 Git Stash

AI가 git 히스토리를 뒤져서 원인을 찾아냈어요:

1. 새 파일(`project-cache.ts`)을 만들고 **git add를 안 함** (untracked 상태)
2. 다른 브랜치로 전환할 때 자동 stash가 실행됨
3. Stash는 untracked 파일을 별도로 저장하는데, **복구할 때 같이 안 나옴**
4. 결국 파일이 유실된 채로 배포됨

파일은 stash 커밋에 잠들어 있었고, AI가 거기서 꺼내서 복구해줬습니다.

## "재발방지 대책 세워줘"

복구하고 나서 물어봤어요:

```
종종 이런 일들이 벌어지는데 왜 그런걸까? 
아예 재발방지 대책을 제대로 세우고 싶어.
```

AI가 제안한 대책:

| 단계 | 대책 | 효과 |
|------|------|------|
| 습관 | 새 파일 생성 후 즉시 `git add` | 근본 원인 차단 |
| 배포 전 | `wrangler deploy --dry-run` 먼저 | 빌드 에러 사전 발견 |
| **자동화** | **pre-push hook으로 빌드 검증** | 깨진 코드 push 방지 |

3번이 마음에 들어서 "해줘"라고 했더니, 바로 hook을 만들어서 설치해줬어요.

## AI가 설치해준 Hook

```bash
#!/bin/bash
echo "🔍 Pre-push: Verifying build..."

if ! npx wrangler deploy --dry-run > /dev/null 2>&1; then
  echo "❌ Build failed! Push aborted."
  exit 1
fi

echo "✅ Build OK"
```

이제 push할 때마다 자동으로 빌드 체크가 돌아가서, 깨진 코드는 애초에 올라가지 않습니다.

## 정리

- **문제**: 파일 유실 → 배포 실패 → 봇 사망
- **원인**: AI가 git 히스토리 분석해서 찾아냄
- **해결**: AI가 파일 복구 + hook 설치까지 자동으로

"재발방지 해줘"라고 했더니 진짜로 자동화 체계를 만들어주네요. 앞으로는 빌드 안 되는 코드가 push 자체가 안 되니까, 같은 실수를 반복할 일이 없어졌습니다.
