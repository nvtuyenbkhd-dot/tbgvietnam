'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

process.env.DB_PATH = path.join(require('os').tmpdir(), `tb-jobs-${process.pid}.db`);
const { validateJob, importJobs } = require('../lib/content-jobs');
const { get, all } = require('../lib/db');

const file = path.join(__dirname, '..', 'content', 'jobs', 'engineers.json');

test('đơn kỹ sư hợp lệ, không trùng slug, không lộ tên/liên hệ doanh nghiệp', () => {
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  const slugs = new Set();
  for (const j of list) {
    validateJob(j, 'engineers.json');
    assert.ok(!slugs.has(j.slug), `trùng slug ${j.slug}`); slugs.add(j.slug);
    const text = JSON.stringify(j);
    assert.doesNotMatch(text, /@[a-z0-9.-]+\.[a-z]{2,}/i, `${j.slug}: có email`);
    assert.doesNotMatch(text, /\b0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{3,4}\b/, `${j.slug}: có số điện thoại`);
    assert.doesNotMatch(text, /[一-鿿]/, `${j.slug}: có chữ Hán (tên công ty/liên hệ)`);
    assert.doesNotMatch(text, /không được nghỉ|ko đc nghỉ/i, `${j.slug}: điều khoản làm việc không nghỉ`);
  }
  assert.ok(list.length >= 30);
});

test('nạp vào bảng jobs với category engineer, chạy lại không nhân đôi', () => {
  const n = importJobs();
  assert.ok(n >= 30);
  const c1 = get("SELECT COUNT(*) c FROM jobs WHERE category='engineer'").c;
  importJobs();
  assert.equal(get("SELECT COUNT(*) c FROM jobs WHERE category='engineer'").c, c1);
  const j = all("SELECT * FROM jobs WHERE slug='ky-su-thang-may-toan-dai-loan'")[0];
  assert.match(j.description_vi, /^- Lắp đặt/);
  assert.equal(j.featured, 1);
});
