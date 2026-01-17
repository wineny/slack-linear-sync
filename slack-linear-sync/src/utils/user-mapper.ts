/**
 * User mapping between Slack and Linear based on email
 */

import type { SlackClient } from '../services/slack-client.js';
import type { LinearClient } from '../services/linear-client.js';

// Simple in-memory cache for user mappings (5 min TTL)
const userCache = new Map<string, { linearUserId: string | null; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function mapSlackUserToLinear(
  slackUserId: string,
  slackClient: SlackClient,
  linearClient: LinearClient
): Promise<{ linearUserId: string | null; userName: string; userEmail: string | null }> {
  // Check cache first
  const cached = userCache.get(slackUserId);
  if (cached && cached.expiry > Date.now()) {
    console.log(`Cache hit for Slack user ${slackUserId}`);
    // Still need to get user info for name
    const slackUser = await slackClient.getUserInfo(slackUserId);
    return {
      linearUserId: cached.linearUserId,
      userName: slackUser.user?.real_name || slackUser.user?.name || 'Unknown',
      userEmail: slackUser.user?.profile?.email || null,
    };
  }

  // Get Slack user email
  const slackUser = await slackClient.getUserInfo(slackUserId);
  if (!slackUser.ok || !slackUser.user) {
    console.error(`Failed to get Slack user info: ${slackUser.error}`);
    return { linearUserId: null, userName: 'Unknown', userEmail: null };
  }

  const userName = slackUser.user.real_name || slackUser.user.name;
  const userEmail = slackUser.user.profile?.email;

  if (!userEmail) {
    console.log(`No email found for Slack user ${slackUserId}`);
    userCache.set(slackUserId, { linearUserId: null, expiry: Date.now() + CACHE_TTL });
    return { linearUserId: null, userName, userEmail: null };
  }

  // Find Linear user by email
  const linearUser = await linearClient.findUserByEmail(userEmail);
  const linearUserId = linearUser?.id || null;

  // Cache the result
  userCache.set(slackUserId, { linearUserId, expiry: Date.now() + CACHE_TTL });

  if (linearUserId) {
    console.log(`Mapped Slack user ${userName} (${userEmail}) to Linear user ${linearUser?.name}`);
  } else {
    console.log(`No Linear user found for email ${userEmail}`);
  }

  return { linearUserId, userName, userEmail };
}
