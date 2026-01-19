import { Hono } from 'hono';
import type { Bindings } from '../types/index.js';

const oauth = new Hono<{ Bindings: Bindings }>();

// OAuth 시작
oauth.get('/authorize', (c) => {
  const authUrl = new URL('https://linear.app/oauth/authorize');
  authUrl.searchParams.set('client_id', c.env.LINEAR_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', c.env.LINEAR_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set(
    'scope',
    'read,write,issues:create,comments:create,app:mentionable,app:assignable'
  );
  authUrl.searchParams.set('actor', 'app'); // 봇으로 동작

  return c.redirect(authUrl.toString());
});

// OAuth 콜백
oauth.get('/callback', async (c) => {
  const code = c.req.query('code');

  if (!code) {
    return c.json({ error: 'No code provided' }, 400);
  }

  const tokenResponse = await fetch('https://api.linear.app/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: c.env.LINEAR_REDIRECT_URI,
      client_id: c.env.LINEAR_CLIENT_ID,
      client_secret: c.env.LINEAR_CLIENT_SECRET,
    }),
  });

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (tokenData.access_token) {
    await c.env.LINEAR_TOKENS.put('access_token', tokenData.access_token);
    if (tokenData.refresh_token) {
      await c.env.LINEAR_TOKENS.put('refresh_token', tokenData.refresh_token);
    }
    return c.json({ success: true, message: '계획적인 로나 연결 완료! 🎉' });
  }

  return c.json({ error: 'Token exchange failed', details: tokenData }, 400);
});

// 토큰 폐기
oauth.get('/revoke', async (c) => {
  await c.env.LINEAR_TOKENS.delete('access_token');
  await c.env.LINEAR_TOKENS.delete('refresh_token');
  return c.json({ success: true, message: '토큰 삭제 완료' });
});

export default oauth;
