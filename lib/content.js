'use strict';
// Nạp bài viết từ content/posts/*.json vào CSDL khi khởi động (upsert theo slug).
// Nhờ vậy bài viết nằm trong repo, deploy lại không mất. Bài tạo trong trang quản trị không bị đụng tới.
const fs = require('fs');
const path = require('path');
const { run, get } = require('./db');

const DIR = path.join(__dirname, '..', 'content', 'posts');
const CATS = ['news', 'guide', 'story'];

function validate(p, file) {
  if (!p.slug || !/^[a-z0-9-]+$/.test(p.slug)) throw new Error(`${file}: slug không hợp lệ`);
  if (!CATS.includes(p.category)) throw new Error(`${file}: category phải là ${CATS.join('/')}`);
  if (!p.title_vi || !p.excerpt_vi || !p.body_vi) throw new Error(`${file}: thiếu title_vi/excerpt_vi/body_vi`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.published_at || '')) throw new Error(`${file}: published_at dạng YYYY-MM-DD`);
  if (!Array.isArray(p.sources) || p.sources.length < 2) throw new Error(`${file}: cần ít nhất 2 nguồn trích dẫn`);
}

function importPosts(dir = DIR) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    let p;
    try {
      p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      validate(p, f);
    } catch (e) {
      console.error('[content] bỏ qua', f, '-', e.message);
      continue;
    }
    const sources = JSON.stringify(p.sources);
    const vals = [
      p.category, p.title_vi, p.title_en || '', p.title_zh || '',
      p.excerpt_vi, p.excerpt_en || '', p.excerpt_zh || '',
      p.body_vi, p.body_en || '', p.body_zh || '',
      p.image || '', p.image_alt || p.title_vi, p.image_credit || '', sources, p.published_at,
    ];
    if (get('SELECT id FROM posts WHERE slug=?', p.slug)) {
      run(`UPDATE posts SET category=?, title_vi=?, title_en=?, title_zh=?, excerpt_vi=?, excerpt_en=?, excerpt_zh=?,
           body_vi=?, body_en=?, body_zh=?, image=?, image_alt=?, image_credit=?, sources=?, published_at=?,
           published=1, source_file=?, updated_at=datetime('now') WHERE slug=? AND source_file<>''`, ...vals, f, p.slug);
    } else {
      run(`INSERT INTO posts(category, title_vi, title_en, title_zh, excerpt_vi, excerpt_en, excerpt_zh,
           body_vi, body_en, body_zh, image, image_alt, image_credit, sources, published_at, slug, source_file, published)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, ...vals, p.slug, f);
    }
    n++;
  }
  return n;
}

module.exports = { importPosts, validate };
