// Cloudflare Worker 바인딩
export type Bindings = {
  LINEAR_TOKENS: KVNamespace;
  LINEAR_CLIENT_ID: string;
  LINEAR_CLIENT_SECRET: string;
  LINEAR_WEBHOOK_SECRET: string;
  LINEAR_REDIRECT_URI: string;
};

// Linear 이슈
export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  createdAt: string;
  cycle: CycleInfo | null;
  state: {
    id: string;
    name: string;
    type: string; // 'completed', 'started', 'unstarted', 'backlog', 'canceled'
  };
  assignee: {
    id: string;
    name: string;
  } | null;
  team: {
    id: string;
    name: string;
  };
  integrationSourceType?: string;
}

// Cycle 정보
export interface CycleInfo {
  id: string;
  number: number;
  name: string | null;
  startsAt: string;
  endsAt: string;
}

// 리마인더 유형
export type ReminderType = 'no-cycle' | 'overdue-cycle';

// 이슈 출처
export type IssueSource = 'direct' | 'slack-linear-sync' | 'linear-slack-app';

// 사용자 알림 설정
export type ReminderFrequency = 'daily' | 'mon-wed-fri' | 'weekly' | 'off';

export interface UserConfig {
  frequency: ReminderFrequency;
  updatedAt: string;
}

// 프로젝트 캐시
export interface CachedProject {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  state: string;
  keywords: string[];
}

export interface ProjectCache {
  version: number;
  updatedAt: string;
  projects: CachedProject[];
}

export const PROJECT_CACHE_KEY = 'PROJECT_CACHE:all';

// 팀 정보
export interface TeamInfo {
  id: string;
  name: string;
  doneStateId: string;
  backlogStateId: string;
  canceledStateId: string;
  duplicateStateId: string;
  triageStateId: string;
}

// 테스트 사용자 (Phase 1: 제한된 테스트용)
export const TEST_USER_ID = '686312fd-f7a2-49d2-89cd-592f4600eb40'; // ny@gpters.org

// 팀 상수 (CLAUDE.md 캐시 + plan.md 참조)
export const TEAMS: TeamInfo[] = [
  {
    id: 'e108ae14-a354-4c09-86ac-6c1186bc6132',
    name: 'Education',
    doneStateId: '8af3af6f-d60f-4d57-bac2-fcd557488d93',
    backlogStateId: '51733663-9daa-4b7b-9614-69ee5055c2a3',
    canceledStateId: '34457b78-5e48-4368-b9aa-f0ae38cea2ca',
    duplicateStateId: 'eefbbc02-b940-4176-9d31-c448cc53f64e',
    triageStateId: '2014ff48-051b-45e9-a46c-241a52b86331',
  },
  {
    id: '432fe835-1dee-4921-8728-ce74fc74b370',
    name: 'Product',
    doneStateId: '9d6a479a-c003-4e62-b46c-b403c2de5f88',
    backlogStateId: '129a0111-352e-4d10-814e-821940382d67',
    canceledStateId: '732dbc1b-9f2f-41ea-a668-6d9947728f5a',
    duplicateStateId: 'f61f07b6-6ebc-4c94-991d-4051b409a8f0',
    triageStateId: '8ff1a544-316e-4e48-a0fa-1c247b191d01',
  },
];
