'use strict';
// Thông báo khi có khách đăng ký. Mỗi kênh là tuỳ chọn: chỉ chạy khi đã khai báo trong .env.
// Lỗi một kênh không làm hỏng việc lưu đăng ký (đã lưu vào CSDL trước).
const nodemailer = require('nodemailer');

const PROGRAM_LABEL = { study: 'Du học', labor: 'Xuất khẩu lao động', engineer: 'Kỹ sư Đài Loan', other: 'Khác' };

let transporter = null;
function mailer() {
  if (transporter || !process.env.SMTP_HOST) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

const plain = (lead) =>
  [
    'ĐĂNG KÝ TƯ VẤN MỚI - TB GROUP',
    `Họ tên: ${lead.name}`,
    `Điện thoại: ${lead.phone}`,
    lead.email && `Email: ${lead.email}`,
    `Chương trình: ${PROGRAM_LABEL[lead.program] || lead.program}`,
    lead.ref_title && `Quan tâm: ${lead.ref_title}`,
    lead.message && `Lời nhắn: ${lead.message}`,
    `Ngôn ngữ: ${lead.lang} | Trang: ${lead.source}`,
    `Thời gian: ${lead.created_at} (UTC)`,
  ]
    .filter(Boolean)
    .join('\n');

async function sendEmail(lead) {
  const t = mailer();
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!t || !to) return;
  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `[TB GROUP] Đăng ký mới: ${lead.name} - ${PROGRAM_LABEL[lead.program] || lead.program}`,
    text: plain(lead),
    replyTo: lead.email || undefined,
  });
}

async function sendTelegram(lead) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!token || !chat) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: plain(lead), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
}

// Google Sheets qua Google Apps Script Web App (xem README) - không cần khoá API
async function sendSheets(lead) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) return;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: process.env.GOOGLE_SHEETS_SECRET || '',
      time: lead.created_at,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      program: PROGRAM_LABEL[lead.program] || lead.program,
      interest: lead.ref_title,
      message: lead.message,
      lang: lead.lang,
      source: lead.source,
    }),
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status}`);
}

// Webhook chung (ví dụ cầu nối sang Zalo OA/ZNS, Make, n8n)
async function sendWebhook(lead) {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'lead.created', lead }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
}

async function notifyLead(lead) {
  const jobs = { email: sendEmail, telegram: sendTelegram, sheets: sendSheets, webhook: sendWebhook };
  const results = await Promise.allSettled(Object.values(jobs).map((fn) => fn(lead)));
  Object.keys(jobs).forEach((name, i) => {
    if (results[i].status === 'rejected') console.error(`[notify:${name}]`, results[i].reason?.message || results[i].reason);
  });
}

module.exports = { notifyLead, PROGRAM_LABEL };
