export async function authorize(request: Request, env: { UDO_ADMIN_USER?: string; UDO_ADMIN_PASSWORD?: string }): Promise<Response | null> {
  const password = env.UDO_ADMIN_PASSWORD;
  if (!password || password.length < 16) {
    return new Response('Панель ще налаштовується. Додайте секрет UDO_ADMIN_PASSWORD (від 16 символів) у Cloudflare.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const value = request.headers.get('Authorization') || '';
  let actual = '';
  try { if (value.startsWith('Basic ')) actual = atob(value.slice(6)); } catch {}
  const expected = `${env.UDO_ADMIN_USER || 'admin'}:${password}`;
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a,b] = await Promise.all([hash(actual), hash(expected)]);
  let difference = 0;
  for (let i=0;i<a.length;i++) difference |= a[i]^b[i];
  if (difference !== 0) return new Response('Увійдіть до панелі УДО.', {status:401,headers:{'WWW-Authenticate':'Basic realm="UDO", charset="UTF-8"','Cache-Control':'no-store'}});
  return null;
}
