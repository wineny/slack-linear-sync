/**
 * Slack request signature verification
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */

export async function verifySlackSignature(
  signingSecret: string,
  signature: string | null,
  timestamp: string | null,
  body: string
): Promise<boolean> {
  if (!signature || !timestamp) {
    return false;
  }

  // Check timestamp to prevent replay attacks (5 minutes tolerance)
  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);
  if (Math.abs(currentTime - requestTime) > 300) {
    console.log('Request timestamp too old');
    return false;
  }

  // Create the signature base string
  const sigBaseString = `v0:${timestamp}:${body}`;

  // Compute HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(sigBaseString)
  );

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const computedSignature = `v0=${hashHex}`;

  // Constant-time comparison
  return timingSafeEqual(computedSignature, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
