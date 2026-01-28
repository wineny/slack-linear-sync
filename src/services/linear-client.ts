/**
 * Linear API client using GraphQL
 * Lightweight implementation without @linear/sdk for Workers compatibility
 */

import type { LinearUser, LinearIssueResult, LinearProject } from '../types/index.js';

export class LinearClient {
  private token: string;
  private baseUrl = 'https://api.linear.app/graphql';

  constructor(token: string) {
    this.token = token;
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': this.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json() as { data?: T; errors?: Array<{ message: string }> };

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return result.data as T;
  }

  /**
   * Get all users in the organization
   */
  async getUsers(): Promise<LinearUser[]> {
    const result = await this.query<{
      users: { nodes: LinearUser[] };
    }>(`
      query {
        users {
          nodes {
            id
            name
            email
          }
        }
      }
    `);

    return result.users.nodes;
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email: string): Promise<LinearUser | null> {
    const users = await this.getUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  /**
   * Create a new issue
   * @param params.createAsUser - Display name for the creator (OAuth actor=app mode only)
   * @param params.displayIconUrl - Avatar URL for the creator (OAuth actor=app mode only)
   */
  async createIssue(params: {
    title: string;
    description: string;
    teamId: string;
    stateId?: string;
    assigneeId?: string;
    subscriberIds?: string[];
    priority?: number;
    projectId?: string;
    estimate?: number;
    // OAuth actor=app mode: display as "User (via App)"
    createAsUser?: string;
    displayIconUrl?: string;
  }): Promise<LinearIssueResult> {
    try {
      const input: Record<string, unknown> = {
        title: params.title,
        description: params.description,
        teamId: params.teamId,
        stateId: params.stateId,
        assigneeId: params.assigneeId,
        subscriberIds: params.subscriberIds,
        priority: params.priority,
        projectId: params.projectId,
      };

      // estimate는 1 이상일 때만 포함 (Linear API는 0을 거부함)
      if (params.estimate && params.estimate > 0) {
        input.estimate = params.estimate;
      }

      // OAuth actor=app mode: add createAsUser and displayIconUrl
      if (params.createAsUser) {
        input.createAsUser = params.createAsUser;
      }
      if (params.displayIconUrl) {
        input.displayIconUrl = params.displayIconUrl;
      }

      const result = await this.query<{
        issueCreate: {
          success: boolean;
          issue?: {
            id: string;
            identifier: string;
            url: string;
          };
        };
      }>(
        `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              url
              state { name }
            }
          }
        }
      `,
        { input }
      );

      if (result.issueCreate.success && result.issueCreate.issue) {
        return {
          success: true,
          issueId: result.issueCreate.issue.id,
          issueIdentifier: result.issueCreate.issue.identifier,
          issueUrl: result.issueCreate.issue.url,
        };
      }

      return { success: false, error: 'Issue creation failed' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update issue state (e.g., mark as Done)
   */
  async updateIssueState(issueId: string, stateId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.query<{
        issueUpdate: {
          success: boolean;
          issue?: {
            id: string;
            identifier: string;
            state: { name: string };
          };
        };
      }>(
        `
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
              identifier
              state { name }
            }
          }
        }
      `,
        {
          id: issueId,
          input: { stateId },
        }
      );

      if (result.issueUpdate.success) {
        console.log(`Issue ${result.issueUpdate.issue?.identifier} marked as ${result.issueUpdate.issue?.state.name}`);
        return { success: true };
      }

      return { success: false, error: 'Issue update failed' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueId: string, body: string): Promise<{ success: boolean; commentId?: string; error?: string }> {
    try {
      const result = await this.query<{
        commentCreate: {
          success: boolean;
          comment?: {
            id: string;
          };
        };
      }>(
        `
        mutation CreateComment($input: CommentCreateInput!) {
          commentCreate(input: $input) {
            success
            comment {
              id
            }
          }
        }
      `,
        {
          input: {
            issueId,
            body,
          },
        }
      );

      if (result.commentCreate.success && result.commentCreate.comment) {
        return { success: true, commentId: result.commentCreate.comment.id };
      }

      return { success: false, error: 'Comment creation failed' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getProjects(): Promise<LinearProject[]> {
    const result = await this.query<{
      projects: { nodes: LinearProject[] };
    }>(`
      query {
        projects(
          filter: {
            or: [
              { state: { eq: "started" } },
              { state: { eq: "planned" } }
            ]
          }
        ) {
          nodes {
            id
            name
            description
            content
            state
            teams {
              nodes {
                id
                name
              }
            }
          }
        }
      }
    `);

    return result.projects.nodes.filter(p => p.state === 'started');
  }

  /**
   * Get started projects where the user is the lead
   */
  async getMyLeadProjects(linearUserId: string): Promise<Array<{
    id: string;
    name: string;
    slugId: string;
    url: string;
  }>> {
    try {
      const result = await this.query<{
        projects: {
          nodes: Array<{
            id: string;
            name: string;
            slugId: string;
            url: string;
            state: string;
          }>;
        };
      }>(`
        query GetMyLeadProjects($userId: ID!) {
          projects(filter: {
            state: { eq: "started" }
            lead: { id: { eq: $userId } }
          }) {
            nodes {
              id
              name
              slugId
              url
              state
            }
          }
        }
      `, { userId: linearUserId });

      return result.projects.nodes.filter(p => p.state === 'started');
    } catch (error) {
      console.error('Error fetching lead projects:', error);
      return [];
    }
  }

  /**
   * Get project issues categorized by status
   */
  async getProjectIssuesForUpdate(projectId: string, weekStart: Date): Promise<{
    done: Array<{ id: string; identifier: string; title: string; url: string }>;
    inReview: Array<{ id: string; identifier: string; title: string; url: string }>;
    inProgress: Array<{ id: string; identifier: string; title: string; url: string }>;
    nextCycle: Array<{ id: string; identifier: string; title: string; url: string; cycle: { number: number } }>;
  }> {
    try {
      const result = await this.query<{
        project: {
          issues: {
            nodes: Array<{
              id: string;
              identifier: string;
              title: string;
              url: string;
              completedAt: string | null;
              state: { name: string; type: string };
              cycle: { number: number; startsAt: string; endsAt: string } | null;
            }>;
          };
        };
      }>(`
        query GetProjectIssues($projectId: String!) {
          project(id: $projectId) {
            issues(first: 100) {
              nodes {
                id
                identifier
                title
                url
                completedAt
                state { name type }
                cycle { number startsAt endsAt }
              }
            }
          }
        }
      `, { projectId });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const done: Array<{ id: string; identifier: string; title: string; url: string }> = [];
      const inReview: Array<{ id: string; identifier: string; title: string; url: string }> = [];
      const inProgress: Array<{ id: string; identifier: string; title: string; url: string }> = [];
      const nextCycle: Array<{ id: string; identifier: string; title: string; url: string; cycle: { number: number } }> = [];

      for (const issue of result.project.issues.nodes) {
        const issueInfo = {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          url: issue.url,
        };

        // Done: completed this week
        if (issue.completedAt) {
          const completedDate = new Date(issue.completedAt);
          completedDate.setHours(0, 0, 0, 0);
          if (completedDate >= weekStart) {
            done.push(issueInfo);
            continue;
          }
        }

        // In Review
        if (issue.state.type === 'started' && issue.state.name === 'In Review') {
          inReview.push(issueInfo);
          continue;
        }

        // In Progress
        if (issue.state.type === 'started' && issue.state.name === 'In Progress') {
          inProgress.push(issueInfo);
          continue;
        }

        // Next Cycle
        if (issue.cycle) {
          const cycleStartDate = new Date(issue.cycle.startsAt);
          cycleStartDate.setHours(0, 0, 0, 0);
          if (cycleStartDate > today) {
            nextCycle.push({
              ...issueInfo,
              cycle: { number: issue.cycle.number },
            });
          }
        }
      }

      return { done, inReview, inProgress, nextCycle };
    } catch (error) {
      console.error('Error fetching project issues:', error);
      return { done: [], inReview: [], inProgress: [], nextCycle: [] };
    }
  }

  async linkSlackThread(
    issueId: string,
    slackUrl: string,
    syncToCommentThread: boolean = true
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.query<{
        attachmentLinkSlack: {
          success: boolean;
          attachment?: {
            id: string;
          };
        };
      }>(
        `
        mutation AttachmentLinkSlack($issueId: String!, $url: String!, $syncToCommentThread: Boolean) {
          attachmentLinkSlack(issueId: $issueId, url: $url, syncToCommentThread: $syncToCommentThread) {
            success
            attachment {
              id
            }
          }
        }
      `,
        {
          issueId,
          url: slackUrl,
          syncToCommentThread,
        }
      );

      if (result.attachmentLinkSlack.success) {
        console.log(`Linked Slack thread to issue ${issueId}`);
        return { success: true };
      }

      return { success: false, error: 'Slack link failed' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
