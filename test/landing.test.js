'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lp-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const { all, setSetting } = require('../lib/db');

let server; let base;
before(async () => { await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());
const http = require('node:http');
// fetch không cho đổi header Host nên dùng http.request để thử subdomain
const get = (p, h) => new Promise((resolve, reject) => {
  const u = new URL(base);
  const req = http.request({ hostname: u.hostname, port: u.port, path: p, headers: h || {} }, (res) => {
    let b = ''; res.setEncoding('utf8'); res.on('data', (c) => (b += c));
    res.on('end', () => resolve({ status: res.statusCode, text: async () => b }));
  });
  req.on('error', reject); req.end();
});

const PAGES = [['du-hoc', 'Du học Đài Loan', 'study'], ['ky-su', 'Kỹ sư', 'engineer'], ['xuat-khau-lao-dong', 'Đi làm việc tại', 'labor']];

for (const [slug, text] of PAGES) {
  test(`landing /lp/${slug} hiển thị`, async () => {
    const r = await get(`/lp/${slug}`);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes(text));
    assert.ok(html.includes('id="dang-ky"'));
    assert.ok(!/connect.facebook.net|googletagmanager.com|analytics.tiktok.com/.test(html), 'chưa nhập ID thì không nạp mã bên thứ ba');
    assert.ok(/data-meta=""/.test(html));
  });
}

test('landing theo subdomain', async () => {
  const r = await get('/', { host: 'ky-su.example.com' });
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes('<link rel="canonical" href="https://ky-su.example.com/">'));
  const r2 = await get('/khong-co-trang', { host: 'xkld.example.com' });
  assert.equal(r2.status, 302);
});

test('trang chính không bị ảnh hưởng', async () => {
  assert.equal((await get('/vi/')).status, 200);
});

test('ID theo dõi được nạp vào thuộc tính của trang', async () => {
  setSetting('pixel_meta', '1234567890123456');
  setSetting('ga4_id', 'G-ABCD1234');
  const html = await (await get('/lp/du-hoc')).text();
  assert.ok(html.includes('data-meta="1234567890123456"'));
  assert.ok(html.includes('data-ga4="G-ABCD1234"'));
  setSetting('pixel_meta', '<script>x</script>');
  assert.ok((await (await get('/lp/du-hoc')).text()).includes('data-meta=""'), 'ID sai định dạng bị bỏ');
});

test('đăng ký từ landing lưu đúng chương trình', async () => {
  const body = new URLSearchParams({ name: 'Nguyễn Văn A', phone: '0912345678', ref_title: 'Hệ 1+4', source: 'https://x/lp/du-hoc?utm_source=fb' });
  const r = await fetch(`${base}/lp/du-hoc/dang-ky`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  const row = all('SELECT * FROM leads ORDER BY id DESC LIMIT 1')[0];
  assert.equal(row.program, 'study');
  assert.equal(row.ref_title, 'Hệ 1+4');
  assert.ok(row.source.includes('utm_source=fb'));
});

test('đăng ký thiếu số điện thoại bị từ chối', async () => {
  const r = await fetch(`${base}/lp/ky-su/dang-ky`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ name: 'An', phone: '12' }) });
  assert.equal(r.status, 422);
  assert.ok((await r.json()).errors.phone);
});
