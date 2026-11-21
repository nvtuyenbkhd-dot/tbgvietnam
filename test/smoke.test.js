'use strict';
// Chạy: npm test   (dùng CSDL tạm, không đụng dữ liệu thật)
const os = require('os');
const path = require('path');
const fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const { run, all } = require('../lib/db');

let server; let base;
before(async () => {
  run("INSERT INTO schools(slug,name_vi,name_en,city) VALUES('s1','Trường Một','School One','Đài Bắc')");
  run("INSERT INTO jobs(slug,category,title_vi,title_en,location,salary) VALUES('j1','engineer','Kỹ sư Một','Engineer One','Đài Trung','48.000')");
  run("INSERT INTO jobs(slug,category,title_vi,location) VALUES('j2','labor','Công nhân Hai','Đài Nam')");
  run("INSERT INTO jobs(slug,category,title_vi,location,published) VALUES('hidden','labor','Ẩn','X',0)");
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = (p, opts) => fetch(base + p, { redirect: 'manual', ...opts });

test('trang công khai trả 200 ở cả 3 ngôn ngữ', async () => {
  for (const l of ['vi', 'zh', 'en']) {
    for (const p of ['/', '/du-hoc', '/xuat-khau-lao-dong', '/ky-su-dai-loan', '/tin-tuc', '/ve-chung-toi', '/lien-he']) {
      const r = await get(`/${l}${p}`);
      assert.equal(r.status, 200, `${l}${p}`);
    }
  }
});

test('chi tiết trường/đơn hàng và nội dung theo ngôn ngữ', async () => {
  assert.equal((await get('/vi/du-hoc/s1')).status, 200);
  assert.ok((await (await get('/en/du-hoc/s1')).text()).includes('School One'));
  assert.ok((await (await get('/vi/ky-su-dai-loan/j1')).text()).includes('Kỹ sư Một'));
  // thiếu bản dịch -> dùng tiếng Việt
  assert.ok((await (await get('/zh/xuat-khau-lao-dong/j2')).text()).includes('Công nhân Hai'));
});

test('mục ẩn không lộ ra ngoài, sai chương trình trả 404', async () => {
  assert.equal((await get('/vi/xuat-khau-lao-dong/hidden')).status, 404);
  assert.equal((await get('/vi/ky-su-dai-loan/j2')).status, 404);
  assert.equal((await get('/khong-co-trang-nay')).status, 404);
  assert.ok(!(await (await get('/vi/xuat-khau-lao-dong')).text()).includes('>Ẩn<'));
});

test('bộ lọc và tìm kiếm', async () => {
  const html = await (await get('/vi/du-hoc?q=' + encodeURIComponent('Trường Một'))).text();
  assert.ok(html.includes('Trường Một'));
  const none = await (await get('/vi/du-hoc?q=khongtontai')).text();
  assert.ok(none.includes('class="empty"'));
});

test('XSS: nội dung nhập vào bị escape', async () => {
  run("INSERT INTO posts(slug,title_vi,body_vi) VALUES('x','<img src=x onerror=alert(1)>','<script>alert(1)</script>\n- **a**')");
  const html = await (await get('/vi/tin-tuc/x')).text();
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x onerror'));
  assert.ok(html.includes('<strong>a</strong>'));
});

const post = (body, headers = {}) =>
  get('/vi/dang-ky', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers }, body: new URLSearchParams(body) });

test('biểu mẫu: lưu hợp lệ, từ chối dữ liệu xấu, chặn bot và gửi chéo site', async () => {
  const ok = await post({ name: 'Nguyễn Văn A', phone: '0912 345 678', program: 'study', message: 'xin tư vấn' });
  assert.deepEqual(await ok.json(), { ok: true });
  assert.equal(all('SELECT * FROM leads').length, 1);

  const bad = await post({ name: 'A', phone: '12', email: 'x' });
  assert.equal(bad.status, 422);
  const errs = (await bad.json()).errors;
  assert.ok(errs.name && errs.phone && errs.email);

  const bot = await post({ name: 'Bot Bot', phone: '0912345678', company_site: 'spam' });
  assert.equal((await bot.json()).ok, true);
  assert.equal(all('SELECT * FROM leads').length, 1, 'bot không được lưu');

  const cross = await post({ name: 'Hacker X', phone: '0912345678' }, { Origin: 'http://evil.example' });
  assert.equal(cross.status, 403);
  assert.equal(all('SELECT * FROM leads').length, 1);
});

test('quản trị yêu cầu đăng nhập và có header an toàn', async () => {
  for (const p of ['/admin', '/admin/leads', '/admin/c/schools', '/admin/leads/export.csv', '/admin/settings']) {
    const r = await get(p);
    assert.equal(r.status, 303, p);
    assert.match(r.headers.get('location'), /\/admin\/login$/);
  }
  const home = await get('/vi/');
  assert.ok(home.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.equal(home.headers.get('x-powered-by'), null);
});

test('sitemap và robots', async () => {
  const sm = await (await get('/sitemap.xml')).text();
  assert.ok(sm.includes('/vi/du-hoc/s1') && sm.includes('hreflang="zh-Hant"') && !sm.includes('hidden'));
  assert.ok((await (await get('/robots.txt')).text()).includes('Disallow: /admin'));
});

test('bài hẹn giờ: chưa tới giờ thì ẩn (cả trang chi tiết, danh sách, sitemap), tới giờ thì hiện', async () => {
  const past = new Date(Date.now() - 60e3).toISOString().slice(0, 19) + 'Z';
  const future = new Date(Date.now() + 3600e3).toISOString().slice(0, 19) + 'Z';
  run("INSERT INTO posts(slug,category,title_vi,excerpt_vi,body_vi,published_at,publish_at) VALUES('bai-da-toi-gio','news','Bài đã tới giờ','m','b','2026-01-01',?)", past);
  run("INSERT INTO posts(slug,category,title_vi,excerpt_vi,body_vi,published_at,publish_at) VALUES('bai-chua-toi-gio','news','Bài chưa tới giờ','m','b','2026-01-01',?)", future);
  assert.equal((await get('/vi/tin-tuc/bai-da-toi-gio')).status, 200);
  assert.equal((await get('/vi/tin-tuc/bai-chua-toi-gio')).status, 404);
  const list = await (await get('/vi/tin-tuc')).text();
  assert.match(list, /Bài đã tới giờ/);
  assert.doesNotMatch(list, /Bài chưa tới giờ/);
  const sm = await (await get('/sitemap.xml')).text();
  assert.match(sm, /bai-da-toi-gio/);
  assert.doesNotMatch(sm, /bai-chua-toi-gio/);
  const home = await (await get('/vi/')).text();
  assert.doesNotMatch(home, /Bài chưa tới giờ/);
});
