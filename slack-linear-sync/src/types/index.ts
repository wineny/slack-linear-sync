// Cloudflare Worker environment bindings
export interface Env {
  // Environment variables
  TARGET_CHANNEL_NAME: string;
  LINEAR_TEAM_ID: string;
  LINEAR_DEFAULT_STATE_ID: string;

  // Secrets
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  LINEAR_API_TOKEN: string;
  ANTHROPIC_API_KEY: string;

  // KV namespace for deduplication
  PROCESSED_MESSAGES?: KVNamespace;
}

// Slack Event API types
export interface SlackEventPayload {
  token: string;
  team_id: string;
  api_app_id: string;
  type: 'url_verification' | 'event_callback';
  challenge?: string;
  event?: SlackMessageEvent;
  event_id?: string;
  event_time?: number;
}

export interface SlackMessageEvent {
  type: 'message';
  subtype?: string;
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  channel_type: string;
}

// Slack API response types
export interface SlackUserInfo {
  ok: boolean;
  user?: {
    id: string;
    name: string;
    real_name: string;
    profile: {
      email?: string;
      display_name: string;
    };
  };
  error?: string;
}

export interface SlackChannelInfo {
  ok: boolean;
  channel?: {
    id: string;
    name: string;
  };
  error?: string;
}

// Linear API types
export interface LinearUser {
  id: string;
  name: string;
  email: string;
}

export interface LinearIssueResult {
  success: boolean;
  issueId?: string;
  issueIdentifier?: string;
  issueUrl?: string;
  error?: string;
}

// AI analysis result
export interface AnalysisResult {
  title: string;
  description: string;
  success: boolean;
  error?: string;
}
