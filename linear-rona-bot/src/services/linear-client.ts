import type { LinearIssue, CycleInfo, TeamInfo } from '../types/index.js';

const LINEAR_API = 'https://api.linear.app/graphql';

/**
 * Linear GraphQL 클라이언트
 * @linear/sdk 대신 직접 GraphQL 쿼리 사용 (더 세밀한 필터링 가능)
 */
export class LinearGraphQLClient {
  constructor(private accessToken: string) {}

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(LINEAR_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = (await response.json()) as { data?: T; errors?: unknown[] };

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error('GraphQL query failed');
    }

    return result.data as T;
  }

  /**
   * 팀의 현재 활성 Cycle 조회
   */
  async getActiveCycle(teamId: string): Promise<CycleInfo | null> {
    const data = await this.query<{
      team: { activeCycle: CycleInfo | null };
    }>(
      `
      query GetActiveCycle($teamId: String!) {
        team(id: $teamId) {
          activeCycle {
            id
            number
            name
            startsAt
            endsAt
          }
        }
      }
    `,
      { teamId }
    );

    return data.team?.activeCycle ?? null;
  }

  /**
   * 팀의 진행 중인 이슈 조회 (Backlog, Done, Canceled, Duplicate, Triage 제외)
   */
  async getActiveIssues(team: TeamInfo): Promise<LinearIssue[]> {
    // Linear API는 filter에서 ID 타입을 요구하지만 변수로 전달하면 타입 불일치 발생
    // 직접 쿼리 문자열에 값을 삽입
    const excludedStates = [
      team.doneStateId,
      team.backlogStateId,
      team.canceledStateId,
      team.duplicateStateId,
      team.triageStateId,
    ];
    const query = `
      query GetActiveIssues {
        issues(
          filter: {
            team: { id: { eq: "${team.id}" } }
            state: { id: { nin: ${JSON.stringify(excludedStates)} } }
          }
          first: 250
          orderBy: createdAt
        ) {
          nodes {
            id
            identifier
            title
            description
            url
            createdAt
            cycle {
              id
              number
              name
              startsAt
              endsAt
            }
            state {
              id
              name
              type
            }
            assignee {
              id
              name
            }
            team {
              id
              name
            }
          }
        }
      }
    `;

    const data = await this.query<{
      issues: { nodes: LinearIssue[] };
    }>(query);

    return data.issues?.nodes ?? [];
  }

  /**
   * 이슈에 댓글 생성
   */
  async createComment(issueId: string, body: string): Promise<void> {
    await this.query(
      `
      mutation CreateComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment {
            id
          }
        }
      }
    `,
      { issueId, body }
    );
  }

  /**
   * 과거 Cycle 목록 조회 (endsAt이 지난 것들)
   */
  async getPastCycles(teamId: string, limit = 5): Promise<CycleInfo[]> {
    const now = new Date().toISOString();

    const data = await this.query<{
      cycles: { nodes: CycleInfo[] };
    }>(
      `
      query GetPastCycles($teamId: String!, $now: DateTime!, $limit: Int!) {
        cycles(
          filter: {
            team: { id: { eq: $teamId } }
            endsAt: { lt: $now }
          }
          first: $limit
          orderBy: endsAt
        ) {
          nodes {
            id
            number
            name
            startsAt
            endsAt
          }
        }
      }
    `,
      { teamId, now, limit }
    );

    return data.cycles?.nodes ?? [];
  }
}
