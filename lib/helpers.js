'use strict';
const LANGS = ['vi', 'zh', 'en'];
const DEFAULT_LANG = 'vi';

// Lấy trường đa ngôn ngữ, quay về tiếng Việt nếu bản dịch trống
const L = (row, field, lang) => {
  if (!row) return '';
  return (row[`${field}_${lang}`] || '').trim() || row[`${field}_${DEFAULT_LANG}`] || '';
};

const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'muc';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Văn bản thuần -> HTML an toàn: đoạn, danh sách gạch đầu dòng, **đậm**
const richText = (s) => {
  const lines = esc(s).split(/\r?\n/);
  let html = '';
  let list = false;
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^[-*•]\s+(.*)$/);
    if (m) {
      if (!list) { html += '<ul>'; list = true; }
      html += `<li>${inline(m[1])}</li>`;
    } else {
      if (list) { html += '</ul>'; list = false; }
      if (line) html += `<p>${inline(line)}</p>`;
    }
  }
  if (list) html += '</ul>';
  return html;
};

const splitList = (s) =>
  String(s || '')
    .split(/\r?\n|,|;/)
    .map((x) => x.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);

const normPhone = (p) => String(p || '').replace(/[^\d+]/g, '');
const validPhone = (p) => /^(\+?84|0)\d{8,10}$|^\+?\d{8,15}$/.test(normPhone(p));
const validEmail = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const fmtDate = (d, lang) => {
  if (!d) return '';
  const dt = new Date(String(d).replace(' ', 'T') + (String(d).length <= 10 ? 'T00:00:00' : 'Z'));
  if (isNaN(dt)) return d;
  const loc = { vi: 'vi-VN', zh: 'zh-TW', en: 'en-GB' }[lang] || 'vi-VN';
  return dt.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
};

module.exports = { LANGS, DEFAULT_LANG, L, slugify, esc, richText, splitList, normPhone, validPhone, validEmail, fmtDate };
