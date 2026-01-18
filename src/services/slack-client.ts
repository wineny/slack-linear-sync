/**
 * Slack API client for user info and messaging
 */

import type { SlackUserInfo, SlackChannelInfo } from '../types/index.js';

export class SlackClient {
  private token: string;
  private baseUrl = 'https://slack.com/api';

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.json() as Promise<T>;
  }

  private async postRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return response.json() as Promise<T>;
  }

  /**
   * Get user information including email
   */
  async getUserInfo(userId: string): Promise<SlackUserInfo> {
    return this.request<SlackUserInfo>('users.info', { user: userId });
  }

  /**
   * Get channel information
   */
  async getChannelInfo(channelId: string): Promise<SlackChannelInfo> {
    return this.request<SlackChannelInfo>('conversations.info', { channel: channelId });
  }

  /**
   * Post a message to a channel (as thread reply)
   */
  async postMessage(
    channel: string,
    text: string,
    threadTs?: string
  ): Promise<{ ok: boolean; error?: string }> {
    return this.postRequest('chat.postMessage', {
      channel,
      text,
      thread_ts: threadTs,
      unfurl_links: false,
    });
  }

  /**
   * Get permalink for a message
   */
  async getPermalink(
    channel: string,
    messageTs: string
  ): Promise<{ ok: boolean; permalink?: string; error?: string }> {
    return this.request('chat.getPermalink', {
      channel,
      message_ts: messageTs,
    });
  }

  /**
   * Get conversation replies (thread messages)
   */
  async getConversationReplies(
    channel: string,
    ts: string
  ): Promise<{
    ok: boolean;
    messages?: Array<{
      ts: string;
      thread_ts?: string;
      text: string;
      user: string;
    }>;
    error?: string;
  }> {
    return this.request('conversations.replies', {
      channel,
      ts,
      limit: '1',
    });
  }
}
