'use strict';
// Nạp bài viết từ content/posts/*.json vào CSDL khi khởi động (upsert theo slug).
// Nhờ vậy bài viết nằm trong repo, deploy lại không mất. Bài tạo trong trang quản trị không bị đụng tới.
const fs = require('fs');
const path = require('path');
const { run, get } = require('./db');

const DIR = path.join(__dirname, '..', 'content', 'posts');
const CATS = ['news', 'guide', 'story'];
const GALLERY_KINDS = ['air_labor', 'air_eng', 'air_mixed', 'office', 'interview'];

function validate(p, file) {
  if (!p.slug || !/^[a-z0-9-]+$/.test(p.slug)) throw new Error(`${file}: slug không hợp lệ`);
  if (!CATS.includes(p.category)) throw new Error(`${file}: category phải là ${CATS.join('/')}`);
  if (!p.title_vi || !p.excerpt_vi || !p.body_vi) throw new Error(`${file}: thiếu title_vi/excerpt_vi/body_vi`);
  if (p.publish_at) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(p.publish_at) || Number.isNaN(Date.parse(p.publish_at))) {
      throw new Error(`${file}: publish_at dạng YYYY-MM-DDTHH:MM:SSZ (giờ UTC)`);
    }
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(p.published_at || '')) {
    throw new Error(`${file}: cần publish_at hoặc published_at (YYYY-MM-DD)`);
  }
  if (p.gallery !== undefined) {
    if (!Array.isArray(p.gallery) || p.gallery.some((g) => !g || !g.src || !GALLERY_KINDS.includes(g.kind))) {
      throw new Error(`${file}: gallery phải là mảng {src, kind} với kind thuộc ${GALLERY_KINDS.join('/')}`);
    }
  }
  if (p.youtube !== undefined && !/^[A-Za-z0-9_-]{11}$/.test(p.youtube)) {
    throw new Error(`${file}: youtube phải là mã video 11 ký tự (vd 751vzShh_eo)`);
  }
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
    // published_at (ngày hiển thị) theo giờ Việt Nam (UTC+7) khi có hẹn giờ
    if (p.publish_at) p.published_at = new Date(Date.parse(p.publish_at) + 7 * 3600e3).toISOString().slice(0, 10);
    const vals = [
      p.category, p.title_vi, p.title_en || '', p.title_zh || '',
      p.excerpt_vi, p.excerpt_en || '', p.excerpt_zh || '',
      p.body_vi, p.body_en || '', p.body_zh || '',
      p.image || '', p.image_alt || p.title_vi, p.image_credit || '', sources, p.published_at, p.publish_at || '', JSON.stringify(p.gallery || []),
      p.youtube || '',
    ];
    if (get('SELECT id FROM posts WHERE slug=?', p.slug)) {
      run(`UPDATE posts SET category=?, title_vi=?, title_en=?, title_zh=?, excerpt_vi=?, excerpt_en=?, excerpt_zh=?,
           body_vi=?, body_en=?, body_zh=?, image=?, image_alt=?, image_credit=?, sources=?, published_at=?, publish_at=?, gallery=?, youtube=?,
           published=1, source_file=?, updated_at=datetime('now') WHERE slug=? AND source_file<>''`, ...vals, f, p.slug);
    } else {
      run(`INSERT INTO posts(category, title_vi, title_en, title_zh, excerpt_vi, excerpt_en, excerpt_zh,
           body_vi, body_en, body_zh, image, image_alt, image_credit, sources, published_at, publish_at, gallery, youtube, slug, source_file, published)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, ...vals, p.slug, f);
    }
    n++;
  }
  return n;
}

const SCHOOL_DIR = path.join(__dirname, '..', 'content', 'schools');
const SCHOOL_TYPES = ['university', 'college', 'language'];

function validateSchool(p, file) {
  if (!p.slug || !/^[a-z0-9-]+$/.test(p.slug)) throw new Error(`${file}: slug không hợp lệ`);
  if (!SCHOOL_TYPES.includes(p.type)) throw new Error(`${file}: type phải là ${SCHOOL_TYPES.join('/')}`);
  if (!p.name_vi || !p.city || !p.summary_vi) throw new Error(`${file}: thiếu name_vi/city/summary_vi`);
  if (!Array.isArray(p.sources)) throw new Error(`${file}: sources phải là mảng`);
  if (p.sources.length < 1 && p.aggregated !== true) throw new Error(`${file}: cần ít nhất 1 nguồn (hoặc aggregated: true cho thông tin tổng hợp)`);
}

// Nạp trang trường từ content/schools/*.json (upsert theo slug; trường tạo trong trang quản trị không bị đụng tới)
function importSchools(dir = SCHOOL_DIR) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const ML = ['name', 'summary', 'majors', 'requirements', 'scholarship'];
  const cols = ML.flatMap((k) => ['vi', 'zh', 'en'].map((l) => `${k}_${l}`));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    let p;
    try { p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); validateSchool(p, f); } catch (e) {
      console.error('[content] bỏ qua', f, '-', e.message); continue;
    }
    const vals = [...cols.map((c) => p[c] || ''), p.city, p.type, p.image || '', p.image_credit || '', JSON.stringify(p.sources),
      p.tuition || '', p.intake || '', p.deadline || '', p.website || '', p.featured ? 1 : 0];
    const names = [...cols, 'city', 'type', 'image', 'image_credit', 'sources', 'tuition', 'intake', 'deadline', 'website', 'featured'];
    if (get('SELECT id FROM schools WHERE slug=?', p.slug)) {
      run(`UPDATE schools SET ${names.map((c) => c + '=?').join(', ')}, published=1, source_file=?, updated_at=datetime('now') WHERE slug=? AND source_file<>''`, ...vals, f, p.slug);
    } else {
      run(`INSERT INTO schools(${names.join(', ')}, slug, source_file, published) VALUES(${[...names, 'slug', 'source_file'].map(() => '?').join(',')},1)`, ...vals, p.slug, f);
    }
    n++;
  }
  return n;
}

module.exports = { importPosts, importSchools, validate, validateSchool, GALLERY_KINDS };
