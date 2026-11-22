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
