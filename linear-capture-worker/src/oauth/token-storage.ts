/**
 * OAuth Token Storage - AES-256-GCM encrypted token management
 * Key format: {device_id}:{service}
 */

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
  token_type?: string;
  [key: string]: unknown;
}

export interface TokenStorageEnv {
  OAUTH_TOKENS: KVNamespace;
  TOKEN_ENCRYPTION_KEY: string; // 256-bit key as 64-char hex
}

function buildKey(deviceId: string, service: string): string {
  return `${deviceId}:${service}`;
}

async function getEncryptionKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(hexKey);
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function encryptTokens(tokens: OAuthTokens, encryptionKey: string): Promise<string> {
  const key = await getEncryptionKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM requires 96-bit IV
  const plaintext = new TextEncoder().encode(JSON.stringify(tokens));
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );
  
  // Format: IV (12 bytes) || ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return bytesToHex(combined);
}

async function decryptTokens(encrypted: string, encryptionKey: string): Promise<OAuthTokens> {
  const key = await getEncryptionKey(encryptionKey);
  const combined = hexToBytes(encrypted);
  
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function storeTokens(
  env: TokenStorageEnv,
  deviceId: string,
  service: string,
  tokens: OAuthTokens
): Promise<void> {
  const key = buildKey(deviceId, service);
  const encrypted = await encryptTokens(tokens, env.TOKEN_ENCRYPTION_KEY);
  
  const expirationTtl = tokens.expires_at 
    ? Math.max(tokens.expires_at - Math.floor(Date.now() / 1000), 60)
    : undefined;
  
  await env.OAUTH_TOKENS.put(key, encrypted, {
    expirationTtl: expirationTtl ? Math.min(expirationTtl, 365 * 24 * 60 * 60) : undefined,
  });
}

export async function getTokens(
  env: TokenStorageEnv,
  deviceId: string,
  service: string
): Promise<OAuthTokens | null> {
  const key = buildKey(deviceId, service);
  const encrypted = await env.OAUTH_TOKENS.get(key);
  
  if (!encrypted) {
    return null;
  }
  
  try {
    return await decryptTokens(encrypted, env.TOKEN_ENCRYPTION_KEY);
  } catch (error) {
    console.error('Token decryption failed:', error);
    await env.OAUTH_TOKENS.delete(key);
    return null;
  }
}

export async function deleteTokens(
  env: TokenStorageEnv,
  deviceId: string,
  service: string
): Promise<void> {
  const key = buildKey(deviceId, service);
  await env.OAUTH_TOKENS.delete(key);
}

export async function listServices(
  env: TokenStorageEnv,
  deviceId: string
): Promise<string[]> {
  const prefix = `${deviceId}:`;
  const result = await env.OAUTH_TOKENS.list({ prefix });
  
  return result.keys.map(k => k.name.replace(prefix, ''));
}

export function validateParams(deviceId: unknown, service: unknown): { valid: true } | { valid: false; error: string } {
  if (!deviceId || typeof deviceId !== 'string') {
    return { valid: false, error: 'device_id is required' };
  }
  if (!service || typeof service !== 'string') {
    return { valid: false, error: 'service is required' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(service)) {
    return { valid: false, error: 'Invalid service name format' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
    return { valid: false, error: 'Invalid device_id format' };
  }
  return { valid: true };
}
