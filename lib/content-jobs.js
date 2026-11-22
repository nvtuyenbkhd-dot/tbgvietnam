'use strict';
// Nạp đơn tuyển dụng từ content/jobs/*.json (mảng các đơn) vào bảng jobs khi khởi động.
// Upsert theo slug; đơn tạo trong trang quản trị (source_file rỗng) không bị đụng tới.
const fs = require('fs');
const path = require('path');
const { run, get, db } = require('./db');

try { db.exec("ALTER TABLE jobs ADD COLUMN source_file TEXT DEFAULT ''"); } catch { /* đã có */ }

const DIR = path.join(__dirname, '..', 'content', 'jobs');
const CATEGORY_BY_FILE = { 'engineers.json': 'engineer', 'labor.json': 'labor' };

const lines = (v) => (Array.isArray(v) ? v.map((x) => `- ${x}`).join('\n') : String(v || ''));

function validateJob(j, file) {
  if (!j.slug || !/^[a-z0-9-]+$/.test(j.slug)) throw new Error(`${file}: slug không hợp lệ (${j.slug})`);
  if (!j.title_vi || !j.location) throw new Error(`${file}/${j.slug}: thiếu title_vi hoặc location`);
  if (!j.description || !j.requirements) throw new Error(`${file}/${j.slug}: thiếu description hoặc requirements`);
}

function importJobs(dir = DIR) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const category = CATEGORY_BY_FILE[f];
    if (!category) { console.error('[content] bỏ qua', f, '- chưa khai báo loại (engineers.json / labor.json)'); continue; }
    let list;
    try { list = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (!Array.isArray(list)) throw new Error('phải là mảng'); } catch (e) {
      console.error('[content] bỏ qua', f, '-', e.message); continue;
    }
    const seen = new Set();
    for (const j of list) {
      try { validateJob(j, f); if (seen.has(j.slug)) throw new Error(`${f}: trùng slug ${j.slug}`); seen.add(j.slug); } catch (e) {
        console.error('[content] bỏ qua đơn -', e.message); continue;
      }
      const vals = [j.title_vi, lines(j.description), lines(j.requirements), lines(j.benefits), j.industry || '', j.location, j.salary || '',
        j.headcount || '', j.gender || '', j.age || '', j.deadline || '', j.image || '', j.featured ? 1 : 0, j.published === false ? 0 : 1];
      if (get('SELECT id FROM jobs WHERE slug=?', j.slug)) {
        run(`UPDATE jobs SET category=?, title_vi=?, description_vi=?, requirements_vi=?, benefits_vi=?, industry=?, location=?, salary=?,
             headcount=?, gender=?, age=?, deadline=?, image=?, featured=?, published=?, source_file=?, updated_at=datetime('now')
             WHERE slug=? AND source_file<>''`, category, ...vals, f, j.slug);
      } else {
        run(`INSERT INTO jobs(category, title_vi, description_vi, requirements_vi, benefits_vi, industry, location, salary,
             headcount, gender, age, deadline, image, featured, published, slug, source_file) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          category, ...vals, j.slug, f);
      }
      n++;
    }
    // đơn đã bị xoá khỏi file thì ẩn đi (chỉ với đơn do file này tạo)
    for (const r of db.prepare("SELECT slug FROM jobs WHERE source_file=?").all(f)) {
      if (!seen.has(r.slug)) run('UPDATE jobs SET published=0 WHERE slug=?', r.slug);
    }
  }
  return n;
}

module.exports = { importJobs, validateJob };
