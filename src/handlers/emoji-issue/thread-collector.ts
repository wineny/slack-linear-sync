import { SlackClient } from '../../services/slack-client.js';

export interface CollectedMessage {
  author: string;
  text: string;
}

export async function collectThreadMessages(
  slackClient: SlackClient,
  channel: string,
  messageTs: string,
  threadTs?: string
): Promise<CollectedMessage[]> {
  const messages: CollectedMessage[] = [];
  const userNameCache = new Map<string, string>();

  async function getUserName(userId: string): Promise<string> {
    if (userNameCache.has(userId)) {
      return userNameCache.get(userId)!;
    }
    const userInfo = await slackClient.getUserInfo(userId);
    const name = userInfo.user?.real_name || userInfo.user?.name || 'Unknown';
    userNameCache.set(userId, name);
    return name;
  }

  const targetThreadTs = threadTs || messageTs;

  const threadResult = await slackClient.getThreadMessages(channel, targetThreadTs);

  if (threadResult.ok && threadResult.messages) {
    for (const msg of threadResult.messages) {
      if (msg.text && msg.user) {
        const authorName = await getUserName(msg.user);
        messages.push({
          author: authorName,
          text: msg.text,
        });
      }
    }
  }

  if (messages.length === 0) {
    const singleResult = await slackClient.getMessage(channel, messageTs);
    if (singleResult.ok && singleResult.messages?.[0]) {
      const msg = singleResult.messages[0];
      if (msg.text && msg.user) {
        const authorName = await getUserName(msg.user);
        messages.push({
          author: authorName,
          text: msg.text,
        });
      }
    }
  }

  return messages;
}
