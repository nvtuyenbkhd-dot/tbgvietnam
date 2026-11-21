'use strict';
// Tìm / tải ảnh miễn phí bản quyền từ Wikimedia Commons, kèm chú thích ghi nguồn.
//   node scripts/commons-image.js search "Taipei 101"            -> liệt kê ảnh phù hợp (CC/công cộng)
//   node scripts/commons-image.js get "File:Xxx.jpg" <slug>       -> tải về public/img/news/<slug>.jpg, in JSON image + image_credit
const fs = require('fs');
const path = require('path');

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'TBGroupWebsite/1.0 (content editorial; contact via website)' };
const OK_LICENSE = /^(CC0|CC BY(-SA)?( |-)|Public domain|PD|Attribution|GFDL)/i;

const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', origin: '*', ...params })) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: UA });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

async function info(titles, width = 1200) {
  const d = await api({
    action: 'query', titles, prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: width,
  });
  return Object.values(d.query?.pages || {}).map((p) => {
    const ii = p.imageinfo?.[0];
    if (!ii) return null;
    const m = ii.extmetadata || {};
    return {
      title: p.title, mime: ii.mime, w: ii.width, h: ii.height, thumb: ii.thumburl, url: ii.url, page: ii.descriptionurl,
      license: strip(m.LicenseShortName?.value), artist: strip(m.Artist?.value), licenseUrl: m.LicenseUrl?.value || '',
    };
  }).filter(Boolean);
}

async function search(q) {
  const d = await api({ action: 'query', list: 'search', srsearch: q, srnamespace: 6, srlimit: 12 });
  const titles = (d.query?.search || []).map((s) => s.title).join('|');
  if (!titles) return [];
  return (await info(titles)).filter((x) => /jpeg|png/.test(x.mime) && x.w >= 1000 && x.w >= x.h && OK_LICENSE.test(x.license));
}

async function get(title, slug) {
  const [x] = await info(title);
  if (!x) throw new Error('Không thấy ảnh');
  if (!OK_LICENSE.test(x.license)) throw new Error(`Giấy phép không phù hợp: ${x.license}`);
  const r = await fetch(x.thumb || x.url, { headers: UA });
  if (!r.ok) throw new Error(`Tải ảnh lỗi ${r.status}`);
  const ext = x.mime === 'image/png' ? 'png' : 'jpg';
  const dir = path.join(__dirname, '..', 'public', 'img', 'news');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${slug}.${ext}`), Buffer.from(await r.arrayBuffer()));
  const credit = `Ảnh: ${x.artist || 'Wikimedia Commons'} / ${x.license} / Wikimedia Commons (${x.page})`;
  return { image: `/img/news/${slug}.${ext}`, image_credit: credit };
}

(async () => {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'search') {
    for (const x of await search(a)) console.log(`${x.title} | ${x.w}x${x.h} | ${x.license} | ${x.artist.slice(0, 40)}`);
  } else if (cmd === 'get') {
    console.log(JSON.stringify(await get(a, b), null, 2));
  } else {
    console.log('Dùng: search "<từ khoá>"  |  get "File:..." <slug>');
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
