import type { Bindings, CachedProject, ProjectCache } from '../types/index.js';
import { PROJECT_CACHE_KEY } from '../types/index.js';
import { LinearGraphQLClient } from '../services/linear-client.js';
import { getValidAccessToken } from '../utils/token-manager.js';

// Project Webhook Payload
interface ProjectWebhookPayload {
  type: 'Project';
  action: 'create' | 'update' | 'remove';
  data: {
    id: string;
    name: string;
    description?: string;
    state: string;
    teams?: { nodes: Array<{ id: string; name: string }> };
  };
}

// 알려진 키워드 목록
const KNOWN_KEYWORDS = [
  'Linear', 'Rona', '로나', '교육', 'B2B', '워크샵', 'AI', '자동화',
  '개발', '마케팅', '스터디', '기업', '출강', '콘텐츠', '강의',
  '인프라', 'API', '챗봇', '커뮤니티', '랜딩', '코딩', '바이브',
  '제안서', '견적', '고객사', '파트너'
];

/**
 * 프로젝트명/설명에서 키워드 추출
 */
function extractKeywords(project: { name: string; description?: string }): string[] {
  const text = `${project.name} ${project.description || ''}`;

  // 프로젝트명에서 단어 추출 (2자 이상)
  const nameWords = project.name
    .split(/[\s\-_&\[\]()]+/)
    .filter(w => w.length >= 2 && !/^(상시|및|을|를|의|에|에서|으로|로|과|와)$/.test(w));

  // 알려진 키워드 매칭
  const matched = KNOWN_KEYWORDS.filter(kw =>
    text.toLowerCase().includes(kw.toLowerCase())
  );

  return [...new Set([...nameWords, ...matched])].slice(0, 8);
}

/**
 * KV에서 프로젝트 캐시 조회
 */
async function getProjectCache(env: Bindings): Promise<ProjectCache> {
  const cached = await env.LINEAR_TOKENS.get<ProjectCache>(PROJECT_CACHE_KEY, 'json');
  return cached || { version: 1, updatedAt: '', projects: [] };
}

/**
 * KV에 프로젝트 캐시 저장
 */
async function saveProjectCache(cache: ProjectCache, env: Bindings): Promise<void> {
  cache.updatedAt = new Date().toISOString();
  await env.LINEAR_TOKENS.put(PROJECT_CACHE_KEY, JSON.stringify(cache));
}

/**
 * 프로젝트 데이터를 CachedProject로 변환
 */
function toCachedProject(data: ProjectWebhookPayload['data']): CachedProject {
  return {
    id: data.id,
    name: data.name,
    teamId: data.teams?.nodes[0]?.id || '',
    teamName: data.teams?.nodes[0]?.name || '',
    state: data.state,
    keywords: extractKeywords(data),
  };
}

/**
 * 캐시에 프로젝트 추가
 */
async function addProjectToCache(data: ProjectWebhookPayload['data'], env: Bindings): Promise<void> {
  const cache = await getProjectCache(env);
  const newProject = toCachedProject(data);

  // 중복 체크
  if (!cache.projects.some(p => p.id === data.id)) {
    cache.projects.push(newProject);
    await saveProjectCache(cache, env);
    console.log(`✓ Added to cache: ${data.name} (keywords: ${newProject.keywords.join(', ')})`);
  }
}

/**
 * 캐시에서 프로젝트 업데이트
 */
async function updateProjectInCache(data: ProjectWebhookPayload['data'], env: Bindings): Promise<void> {
  const cache = await getProjectCache(env);
  const index = cache.projects.findIndex(p => p.id === data.id);

  if (index >= 0) {
    cache.projects[index] = toCachedProject(data);
    await saveProjectCache(cache, env);
    console.log(`✓ Updated in cache: ${data.name}`);
  } else {
    // 없으면 추가
    await addProjectToCache(data, env);
  }
}

/**
 * 캐시에서 프로젝트 제거
 */
async function removeProjectFromCache(id: string, env: Bindings): Promise<void> {
  const cache = await getProjectCache(env);
  const index = cache.projects.findIndex(p => p.id === id);

  if (index >= 0) {
    const removed = cache.projects.splice(index, 1)[0];
    await saveProjectCache(cache, env);
    console.log(`✓ Removed from cache: ${removed.name}`);
  }
}

/**
 * Project Webhook 이벤트 처리
 */
export async function handleProjectEvent(
  payload: ProjectWebhookPayload,
  env: Bindings
): Promise<void> {
  const { action, data } = payload;

  console.log(`=== Project ${action} Event ===`);
  console.log(`Project: ${data.name} (${data.id})`);
  console.log(`State: ${data.state}`);

  // started/planned 상태만 활성 프로젝트로 간주
  const isActive = data.state === 'started' || data.state === 'planned';

  if (action === 'create' && isActive) {
    await addProjectToCache(data, env);
  } else if (action === 'update') {
    if (isActive) {
      await updateProjectInCache(data, env);
    } else {
      // 상태가 completed/canceled 등으로 변경되면 캐시에서 제거
      await removeProjectFromCache(data.id, env);
    }
  } else if (action === 'remove') {
    await removeProjectFromCache(data.id, env);
  }
}

/**
 * Linear API에서 전체 프로젝트 조회하여 캐시 재구축
 */
export async function rebuildProjectCache(env: Bindings): Promise<CachedProject[]> {
  console.log('=== Rebuilding Project Cache ===');

  // 토큰 조회
  const tokenResult = await getValidAccessToken(
    env.LINEAR_TOKENS,
    env.LINEAR_CLIENT_ID,
    env.LINEAR_CLIENT_SECRET
  );
  if (!tokenResult.token) {
    throw new Error(`Failed to get access token: ${tokenResult.error}`);
  }

  // Linear API에서 프로젝트 조회
  const linearClient = new LinearGraphQLClient(tokenResult.token);
  const projects = await linearClient.getActiveProjects();

  console.log(`Fetched ${projects.length} active projects from Linear`);

  // 캐시 데이터 구성
  type ProjectData = {
    id: string;
    name: string;
    description?: string;
    state: string;
    teams?: { nodes: Array<{ id: string; name: string }> };
  };
  const cachedProjects: CachedProject[] = projects.map((p: ProjectData) => ({
    id: p.id,
    name: p.name,
    teamId: p.teams?.nodes[0]?.id || '',
    teamName: p.teams?.nodes[0]?.name || '',
    state: p.state || 'started',
    keywords: extractKeywords({ name: p.name, description: p.description }),
  }));

  const cache: ProjectCache = {
    version: 1,
    updatedAt: new Date().toISOString(),
    projects: cachedProjects,
  };

  await env.LINEAR_TOKENS.put(PROJECT_CACHE_KEY, JSON.stringify(cache));

  console.log(`✓ Cache rebuilt with ${cachedProjects.length} projects`);

  return cachedProjects;
}
