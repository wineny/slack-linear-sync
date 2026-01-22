import type { Env, SlackReactionEvent } from '../types/index.js';
import { handleDone } from './pposiraegi/index.js';
import { handleEmojiIssue } from './emoji-issue/index.js';

export async function handleSlackReaction(
  event: SlackReactionEvent,
  env: Env
): Promise<Response> {
  if (event.type !== 'reaction_added') {
    return new Response('OK');
  }

  const issueEmojis = [env.ISSUE_EMOJI, '이슈'];
  if (issueEmojis.includes(event.reaction)) {
    await handleEmojiIssue(event, env);
    return new Response('OK');
  }

  if (event.reaction === env.DONE_EMOJI) {
    await handleDone(event, env);
    return new Response('OK');
  }

  return new Response('OK');
}
