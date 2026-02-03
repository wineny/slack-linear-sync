/**
 * Project cache service - retrieves projects from KV cache or Linear API
 */

import type { Env, CachedProject, ProjectCache } from '../types/index.js';
import { PROJECT_CACHE_KEY } from '../types/index.js';
import { LinearClient } from './linear-client.js';

/**
 * Get projects from KV cache, fallback to Linear API
 */
export async function getProjectsFromCache(env: Env): Promise<CachedProject[]> {
  // Try KV cache first (shared with linear-rona-bot)
  try {
    const cached = await env.LINEAR_TOKENS.get<ProjectCache>(PROJECT_CACHE_KEY, 'json');
    if (cached?.projects && cached.projects.length > 0) {
      console.log(`[ProjectCache] Using cached projects: ${cached.projects.length} projects`);
      return cached.projects;
    }
  } catch (error) {
    console.error('[ProjectCache] KV read error:', error);
  }

  // Fallback to Linear API
  console.log('[ProjectCache] Cache miss, fetching from Linear API');
  const linearClient = new LinearClient(env.LINEAR_API_TOKEN);
  const projects = await linearClient.getProjects();

  // Convert to CachedProject format
  return projects.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    content: p.content,
    teamId: p.teams?.nodes[0]?.id || '',
    teamName: p.teams?.nodes[0]?.name || '',
    state: p.state || 'started',
    keywords: [],
    recentIssueTitles: [],
  }));
}
