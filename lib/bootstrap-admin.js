'use strict';
// Tạo tài khoản quản trị lần đầu khi CSDL chưa có người dùng nào và có ADMIN_PASSWORD trong biến môi trường.
// (Hosting không có SSH để chạy `npm run seed`.) Sau khi tạo xong nên XOÁ ADMIN_PASSWORD khỏi biến môi trường.
const bcrypt = require('bcryptjs');
const { get, run } = require('./db');

function bootstrapAdmin() {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return false;
  if (get('SELECT COUNT(*) c FROM users').c > 0) return false;
  if (pass.length < 12) { console.error('[admin] ADMIN_PASSWORD phải từ 12 ký tự'); return false; }
  const user = process.env.ADMIN_USER || 'admin';
  run('INSERT INTO users(username,password_hash) VALUES(?,?)', user, bcrypt.hashSync(pass, 12));
  console.log(`[admin] đã tạo tài khoản quản trị "${user}"`);
  return true;
}
module.exports = { bootstrapAdmin };
