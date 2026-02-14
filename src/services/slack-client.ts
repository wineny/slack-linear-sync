/**
 * Slack API client for user info and messaging
 */

import type { SlackUserInfo, SlackChannelInfo, SlackFile } from '../types/index.js';

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
      files?: SlackFile[];
    }>;
    error?: string;
  }> {
    return this.request('conversations.replies', {
      channel,
      ts,
      limit: '1',
    });
  }

  async getThreadMessages(
    channel: string,
    threadTs: string
  ): Promise<{
    ok: boolean;
    messages?: Array<{
      ts: string;
      thread_ts?: string;
      text: string;
      user: string;
      files?: SlackFile[];
    }>;
    error?: string;
  }> {
    return this.request('conversations.replies', {
      channel,
      ts: threadTs,
      limit: '100',
    });
  }

  async getMessage(
    channel: string,
    ts: string
  ): Promise<{
    ok: boolean;
    messages?: Array<{
      ts: string;
      thread_ts?: string;
      text: string;
      user: string;
      files?: SlackFile[];
    }>;
    error?: string;
  }> {
    return this.request('conversations.history', {
      channel,
      latest: ts,
      limit: '1',
      inclusive: 'true',
    });
  }

  /**
   * Download a file from Slack using bot token auth.
   * 
   * Strategy:
   * 1. Try url_private with redirect:manual → follow CDN redirect without auth
   * 2. If that returns HTML, retry with url_private_download (if provided)
   * 3. Comprehensive logging at each step for debugging
   */
  async downloadFile(urlPrivate: string, urlPrivateDownload?: string): Promise<ArrayBuffer> {
    // Attempt 1: redirect:manual approach
    const result = await this.attemptDownload(urlPrivate, 'url_private');
    if (result) return result;

    // Attempt 2: try url_private_download if available
    if (urlPrivateDownload) {
      console.log('[download] Retrying with url_private_download...');
      const result2 = await this.attemptDownload(urlPrivateDownload, 'url_private_download');
      if (result2) return result2;
    }

    // Attempt 3: direct fetch with auth (let runtime handle redirects)
    console.log('[download] Retrying with direct fetch (follow redirects)...');
    const directResponse = await fetch(urlPrivate, {
      headers: { 'Authorization': `Bearer ${this.token}` },
    });
    console.log(`[download] Direct: status=${directResponse.status}, content-type=${directResponse.headers.get('content-type')}`);

    if (directResponse.ok) {
      const buf = await directResponse.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes[0] !== 60) { // not '<' (HTML)
        console.log(`[download] Direct fetch succeeded: ${bytes.length}B`);
        return buf;
      }
      console.error('[download] Direct fetch returned HTML');
    }

    throw new Error('All download attempts failed — check bot token files:read scope');
  }

  private async attemptDownload(url: string, label: string): Promise<ArrayBuffer | null> {
    console.log(`[download:${label}] Requesting: ${url.slice(0, 80)}...`);

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.token}` },
      redirect: 'manual',
    });

    console.log(`[download:${label}] Response: status=${response.status}, location=${response.headers.get('location')?.slice(0, 100) || 'none'}`);

    // Handle redirect: follow to CDN WITHOUT auth
    if (response.status >= 300 && response.status < 400) {
      const cdnUrl = response.headers.get('Location');
      if (!cdnUrl) {
        console.error(`[download:${label}] Redirect without Location header`);
        return null;
      }

      console.log(`[download:${label}] Following redirect to CDN...`);
      const cdnResponse = await fetch(cdnUrl);
      const contentType = cdnResponse.headers.get('content-type') || '';
      console.log(`[download:${label}] CDN: status=${cdnResponse.status}, content-type=${contentType}`);

      if (!cdnResponse.ok) {
        console.error(`[download:${label}] CDN failed: ${cdnResponse.status}`);
        return null;
      }

      if (contentType.includes('text/html')) {
        const html = await cdnResponse.text();
        console.error(`[download:${label}] CDN returned HTML: ${html.slice(0, 200)}`);
        return null;
      }

      const buf = await cdnResponse.arrayBuffer();
      console.log(`[download:${label}] Success via redirect: ${buf.byteLength}B`);
      return buf;
    }

    // Direct response (no redirect)
    if (!response.ok) {
      const body = await response.text();
      console.error(`[download:${label}] Failed ${response.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      console.error(`[download:${label}] Got HTML (200): ${html.slice(0, 200)}`);
      return null;
    }

    const buf = await response.arrayBuffer();
    console.log(`[download:${label}] Success direct: ${buf.byteLength}B`);
    return buf;
  }
}
