/**
 * Linear API client using GraphQL
 * Lightweight implementation without @linear/sdk for Workers compatibility
 */

import type { LinearUser, LinearIssueResult } from '../types/index.js';

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
   */
  async createIssue(params: {
    title: string;
    description: string;
    teamId: string;
    stateId?: string;
    assigneeId?: string;
    subscriberIds?: string[];
    priority?: number;
  }): Promise<LinearIssueResult> {
    try {
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
            }
          }
        }
      `,
        {
          input: {
            title: params.title,
            description: params.description,
            teamId: params.teamId,
            stateId: params.stateId,
            assigneeId: params.assigneeId,
            subscriberIds: params.subscriberIds,
            priority: params.priority,
          },
        }
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
}
