export function parseEvidenceLink(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Вставте коректне HTTPS-посилання з ImgBB.'); }
  if (url.protocol !== 'https:' || !['i.ibb.co', 'ibb.co'].includes(url.hostname) || url.username || url.password || url.port || url.pathname === '/') {
    throw new Error('Дозволені посилання https://i.ibb.co/… або https://ibb.co/…');
  }
  url.hash = '';
  return { url: url.href, name: url.hostname === 'i.ibb.co' ? 'Зображення ImgBB' : 'Переглянути доказ на ImgBB' };
}
