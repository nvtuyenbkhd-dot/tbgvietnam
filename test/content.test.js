'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

process.env.DB_PATH = path.join(require('os').tmpdir(), `tb-content-${process.pid}.db`);
const { validate } = require('../lib/content');
const { richText } = require('../lib/helpers');

const dir = path.join(__dirname, '..', 'content', 'posts');

test('mọi bài trong content/posts hợp lệ, có nguồn, ảnh tồn tại', () => {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    validate(p, f);
    assert.equal(p.slug + '.json', f, `${f}: tên file phải trùng slug`);
    assert.ok(p.image && (p.image_own === true || p.image_credit), `${f}: thiếu ảnh/ghi nguồn ảnh (ảnh công ty cần image_own: true)`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', p.image)), `${f}: file ảnh không tồn tại`);
    for (const s of p.sources) assert.match(s.url, /^https:\/\//, `${f}: nguồn phải là https`);
    assert.ok(p.excerpt_vi.length <= 200, `${f}: mô tả meta quá dài`);
  }
});

test('richText hiển thị tiêu đề, danh sách số và chữ nghiêng', () => {
  const h = richText('## Mục\n1. Một\n2. Hai\n- a\nChữ *nghiêng* và **đậm**');
  assert.match(h, /<h2>Mục<\/h2><ol><li>Một<\/li><li>Hai<\/li><\/ol><ul><li>a<\/li><\/ul>/);
  assert.match(h, /<em>nghiêng<\/em>/);
  assert.match(h, /<strong>đậm<\/strong>/);
});

test('mọi trang trường trong content/schools hợp lệ, có nguồn và ảnh', () => {
  const { validateSchool } = require('../lib/content');
  const sdir = path.join(__dirname, '..', 'content', 'schools');
  const files = fs.existsSync(sdir) ? fs.readdirSync(sdir).filter((x) => x.endsWith('.json')) : [];
  const slugs = new Set();
  for (const f of files) {
    const p = JSON.parse(fs.readFileSync(path.join(sdir, f), 'utf8'));
    validateSchool(p, f);
    assert.equal(p.slug + '.json', f, `${f}: tên file phải trùng slug`);
    assert.ok(!slugs.has(p.slug), `${f}: trùng slug`);
    slugs.add(p.slug);
    assert.ok(p.image_credit && fs.existsSync(path.join(__dirname, '..', 'public', p.image)), `${f}: thiếu ảnh hoặc ghi nguồn ảnh`);
    for (const s of p.sources) assert.match(s.url, /^https:\/\//, `${f}: nguồn phải là https`);
  }
});

test('ảnh hoạt động trong bài (gallery) tồn tại và đúng loại', () => {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const g of p.gallery || []) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', g.src)), `${f}: thiếu ảnh ${g.src}`);
    }
    assert.ok((p.gallery || []).length <= 4, `${f}: tối đa 4 ảnh trong gallery`);
  }
});

test('bài có youtube: mã video hợp lệ được nhận, mã sai bị bỏ qua', () => {
  const fs2 = require('fs'); const os = require('os'); const path2 = require('path');
  const { importPosts } = require('../lib/content');
  const tmp = fs2.mkdtempSync(path2.join(os.tmpdir(), 'yt-'));
  const base = { category: 'guide', title_vi: 'T', excerpt_vi: 'E', body_vi: 'B', published_at: '2026-11-24',
    sources: [{ title: 'a', url: 'https://a.example' }, { title: 'b', url: 'https://b.example' }] };
  fs2.writeFileSync(path2.join(tmp, 'ok.json'), JSON.stringify({ ...base, slug: 'yt-test-ok', youtube: '751vzShh_eo' }));
  fs2.writeFileSync(path2.join(tmp, 'bad.json'), JSON.stringify({ ...base, slug: 'yt-test-bad', youtube: 'javascript:alert(1)' }));
  const n = importPosts(tmp);
  assert.strictEqual(n, 1);
  const { get, run } = require('../lib/db');
  assert.strictEqual(get('SELECT youtube FROM posts WHERE slug=?', 'yt-test-ok').youtube, '751vzShh_eo');
  assert.strictEqual(get('SELECT id FROM posts WHERE slug=?', 'yt-test-bad'), undefined);
  run('DELETE FROM posts WHERE slug=?', 'yt-test-ok');
});
