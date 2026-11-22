'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

process.env.DB_PATH = path.join(require('os').tmpdir(), `tb-jobs-${process.pid}.db`);
const { validateJob, importJobs, loadI18n } = require('../lib/content-jobs');
const { get, all } = require('../lib/db');

const dir = path.join(__dirname, '..', 'content', 'jobs');
const list = JSON.parse(fs.readFileSync(path.join(dir, 'engineers.json'), 'utf8'));

// QUY TẮC BẮT BUỘC: không lộ đối tác (tên công ty, nhà thầu, khách hàng cuối, người liên hệ, địa chỉ chi tiết).
const PARTNER_NAMES = ['Đông Tuấn', 'Thành Kiến', 'Minh Uy', 'Cự Luân', 'Thượng Ý', 'Hòa Quang', 'Thiên Hoà', 'Thiên Hòa', 'Tham Dương', 'Đại Phúc', 'Daifuku',
  'Huyền Thông', 'Công Sơn', 'Cửu Nghị', 'Kỳ Đốn', 'Dương Hồng', 'Điển Huy', 'TKE', 'Thường Lục', 'Tân Hựu', 'Hâm Quần Lợi', 'Tỉnh Nguyên',
  'Hoàn Mỹ', 'Hữu Thăng', 'Hồng Nguyên', 'Phong Dương', 'Tuấn Mậu', 'Phú Hãn', 'Thế Vũ', 'Bật Bang', 'Vạn Tấn', 'Phủ Thành', 'Thụy Long',
  'Giáp Hữu', 'Tân Á', 'Xuân Trúc', 'Nam Hưng', 'Trường Long', 'TSMC', 'Tsmc'];
const DISTRICTS = ['Thiện Hóa', 'Lâm Khẩu', 'Giai Lý', 'Phụng Sơn', 'Tiền Trấn', 'Tiểu Cảng', 'Thần Cương', 'Cương Sơn', 'Đạm Thủy', 'Vĩnh Khang', 'Shanhua', 'Fengshan'];

function allText() {
  const tr = loadI18n(dir);
  return JSON.stringify(list) + JSON.stringify(tr);
}

test('đơn kỹ sư hợp lệ, không trùng slug', () => {
  const slugs = new Set();
  for (const j of list) {
    validateJob(j, 'engineers.json');
    assert.ok(!slugs.has(j.slug), `trùng slug ${j.slug}`); slugs.add(j.slug);
    assert.ok(j.salary, `${j.slug}: thiếu lương (mặc định 47.971 Đài tệ/tháng)`);
  }
  assert.ok(list.length >= 30);
});

test('không lộ thông tin đối tác trong bất kỳ ngôn ngữ nào', () => {
  const text = allText();
  assert.doesNotMatch(text, /@[a-z0-9.-]+\.[a-z]{2,}/i, 'có email');
  assert.doesNotMatch(text, /\b0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{3,4}\b/, 'có số điện thoại');
  assert.doesNotMatch(JSON.stringify(list), /[一-鿿]/, 'bản gốc tiếng Việt có chữ Hán (tên công ty/liên hệ)');
  assert.doesNotMatch(text, /https?:\/\//i, 'có đường link');
  for (const n of [...PARTNER_NAMES, ...DISTRICTS]) assert.ok(!text.includes(n), `lộ thông tin đối tác: ${n}`);
  assert.doesNotMatch(text, /không được nghỉ|ko đc nghỉ|không có bảo hiểm/i, 'điều khoản sai luật');
});

test('mọi đơn có đủ bản dịch tiếng Anh và tiếng Trung phồn thể', () => {
  const tr = loadI18n(dir);
  const vn = /[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i;
  for (const j of list) {
    const t = tr[j.slug];
    assert.ok(t, `${j.slug}: thiếu bản dịch`);
    for (const l of ['en', 'zh']) {
      const x = t[l];
      assert.ok(x, `${j.slug}: thiếu ${l}`);
      for (const k of ['title', 'industry', 'location', 'salary']) assert.ok(x[k], `${j.slug}.${l}.${k} trống`);
      for (const k of ['description', 'requirements', 'benefits']) {
        assert.equal((x[k] || []).length, (j[k] || []).length, `${j.slug}.${l}.${k}: số dòng lệch bản gốc`);
      }
      assert.doesNotMatch(JSON.stringify(x), vn, `${j.slug}.${l}: còn tiếng Việt`);
    }
    assert.doesNotMatch(JSON.stringify(t.en), /[一-鿿]/, `${j.slug}.en: có chữ Hán`);
    assert.match(t.zh.title, /[一-鿿]/, `${j.slug}.zh: tiêu đề không phải chữ Hán`);
  }
});

test('đơn nhà hàng chỉ tuyển nữ; đơn thiếu lương dùng 47.971', () => {
  const r = list.find((j) => j.slug === 'ky-su-nha-hang-dai-nam');
  assert.equal(r.gender, 'Nữ');
  assert.match(r.title_vi, /1 nữ/);
  assert.doesNotMatch(JSON.stringify(r), /Nam\/Nữ|nam\/nữ/);
  assert.equal(list.find((j) => j.slug === 'ky-su-ong-gas-han-6g-dai-nam').salary, '47.971 Đài tệ/tháng');
});

test('nạp vào bảng jobs đủ 3 ngôn ngữ, chạy lại không nhân đôi', () => {
  assert.ok(importJobs() >= 30);
  const c1 = get("SELECT COUNT(*) c FROM jobs WHERE category='engineer' AND published=1").c;
  importJobs();
  assert.equal(get("SELECT COUNT(*) c FROM jobs WHERE category='engineer' AND published=1").c, c1);
  const j = get("SELECT * FROM jobs WHERE slug='ky-su-thang-may-toan-dai-loan'");
  assert.match(j.description_vi, /^- Lắp đặt/);
  assert.ok(j.title_en && j.title_zh && j.description_en && j.description_zh && j.industry_en && j.location_zh && j.salary_en);
  const industries = all("SELECT DISTINCT industry, industry_en, industry_zh FROM jobs WHERE published=1 AND category='engineer'");
  assert.equal(new Set(industries.map((r) => r.industry)).size, industries.length, 'bộ lọc ngành bị trùng bản dịch');
});
