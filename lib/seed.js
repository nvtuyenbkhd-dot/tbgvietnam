'use strict';
// Chạy:  npm run seed            -> dữ liệu MẪU + tài khoản quản trị (chỉ dùng để xem thử)
//        node lib/seed.js --admin-only -> chỉ tạo tài khoản quản trị + cài đặt mặc định (dùng khi chạy thật)
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { run, get, setSetting, getSettings, all } = require('./db');

const adminOnly = process.argv.includes('--admin-only');

// ---- Cài đặt mặc định (chỉ điền nếu chưa có) ----
const defaults = {
  hotline: '0982.735.714',
  hotline_tel: '0982735714',
  zalo: '0982735714',
  email: '',
  facebook: '',
  hours_vi: 'Thứ 2 - Thứ 7, 8:00 - 17:30',
  addr_hq: 'Liền kề 24, NO7B, Khu đất dịch vụ Vạn Phúc, phường Hà Đông, thành phố Hà Nội',
  addr_hcm: 'Số 27/48/2/3 Bùi Tư Toàn, khu phố 53, phường An Lạc, TP. Hồ Chí Minh',
  addr_tw: '台中市中區自由路二段9號',
  addr_jp: '東京都新宿区新宿1-26-6',
  stat_years: '10+',
  stat_students: '1.000+',
  stat_partners: '50+',
  stat_offices: '4',
  show_stats: '0',
};
const cur = getSettings();
for (const [k, v] of Object.entries(defaults)) if (!(k in cur)) setSetting(k, v);

// ---- Tài khoản quản trị ----
const user = process.env.ADMIN_USER || 'admin';
let pass = process.env.ADMIN_PASSWORD;
if (!get('SELECT id FROM users WHERE username=?', user)) {
  let generated = false;
  if (!pass) { pass = crypto.randomBytes(9).toString('base64url'); generated = true; }
  run('INSERT INTO users(username,password_hash) VALUES(?,?)', user, bcrypt.hashSync(pass, 12));
  console.log(`Đã tạo tài khoản quản trị: ${user}`);
  if (generated) console.log(`Mật khẩu tạm (chỉ hiện một lần, hãy đổi ngay): ${pass}`);
} else {
  console.log(`Tài khoản "${user}" đã tồn tại, giữ nguyên.`);
}

if (adminOnly) { console.log('Xong (admin-only).'); process.exit(0); }

// ---- Dữ liệu MẪU ----
const SAMPLE = 'Dữ liệu mẫu: hãy cập nhật thông tin chính xác trong trang quản trị.';
const exists = (t, slug) => get(`SELECT id FROM ${t} WHERE slug=?`, slug);

const schools = [
  ['national-taiwan-university', 'Đại học Quốc lập Đài Loan (NTU)', '國立臺灣大學', 'National Taiwan University', 'Đài Bắc', 'university', 'https://www.ntu.edu.tw/', 1],
  ['national-cheng-kung-university', 'Đại học Quốc lập Thành Công (NCKU)', '國立成功大學', 'National Cheng Kung University', 'Đài Nam', 'university', 'https://www.ncku.edu.tw/', 1],
  ['ntust', 'Đại học Khoa học và Công nghệ Quốc lập Đài Loan (NTUST)', '國立臺灣科技大學', 'National Taiwan University of Science and Technology', 'Đài Bắc', 'university', 'https://www.ntust.edu.tw/', 1],
  ['feng-chia-university', 'Đại học Phùng Giáp (FCU)', '逢甲大學', 'Feng Chia University', 'Đài Trung', 'university', 'https://www.fcu.edu.tw/', 1],
  ['chung-yuan-christian-university', 'Đại học Trung Nguyên (CYCU)', '中原大學', 'Chung Yuan Christian University', 'Đào Viên', 'university', 'https://www.cycu.edu.tw/', 0],
  ['tamkang-university', 'Đại học Đạm Giang (TKU)', '淡江大學', 'Tamkang University', 'Tân Bắc', 'university', 'https://www.tku.edu.tw/', 0],
];
schools.forEach(([slug, nvi, nzh, nen, city, type, web, feat], i) => {
  if (exists('schools', slug)) return;
  run(
    `INSERT INTO schools(slug,name_vi,name_zh,name_en,city,type,website,featured,sort,summary_vi,requirements_vi,tuition,intake)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    slug, nvi, nzh, nen, city, type, web, feat, i,
    `${SAMPLE}\nGiới thiệu ngắn về trường, thế mạnh đào tạo, môi trường học tập và hỗ trợ du học sinh quốc tế.`,
    '- Tốt nghiệp THPT trở lên\n- Chứng chỉ tiếng Trung (TOCFL) hoặc tiếng Anh theo yêu cầu ngành\n- Chứng minh tài chính theo quy định',
    'Liên hệ tư vấn', 'Tháng 9 / Tháng 2'
  );
});

const jobs = [
  ['engineer', 'ky-su-co-khi-cnc-dai-trung', 'Kỹ sư cơ khí - vận hành, lập trình CNC', '機械工程師 - CNC操作與編程', 'Mechanical engineer - CNC operation and programming', 'Cơ khí', 'Đài Trung', '48.000 NT$/tháng + tăng ca', '10', 'Nam', '22 - 40', 1],
  ['engineer', 'ky-su-dien-dien-tu', 'Kỹ sư điện - điện tử', '電機電子工程師', 'Electrical and electronics engineer', 'Điện - Điện tử', 'Đào Viên', '48.000 NT$/tháng + tăng ca', '8', 'Nam/Nữ', '22 - 40', 1],
  ['engineer', 'ky-su-xay-dung-qc', 'Kỹ sư kiểm soát chất lượng (QC)', '品質管制工程師', 'Quality control engineer', 'Sản xuất', 'Đài Trung', '48.000 NT$/tháng + tăng ca', '6', 'Nam/Nữ', '22 - 40', 0],
  ['labor', 'cong-nhan-co-khi', 'Công nhân cơ khí chính xác', '精密機械作業員', 'Precision machinery operator', 'Cơ khí', 'Đài Trung', 'Từ 29.500 NT$/tháng (lương cơ bản)', '20', 'Nam', '20 - 35', 1],
  ['labor', 'cong-nhan-dien-tu', 'Công nhân lắp ráp điện tử', '電子組裝作業員', 'Electronics assembly worker', 'Điện tử', 'Tân Trúc', 'Từ 29.500 NT$/tháng (lương cơ bản)', '30', 'Nam/Nữ', '20 - 35', 1],
  ['labor', 'che-bien-thuc-pham', 'Công nhân chế biến thực phẩm', '食品加工作業員', 'Food processing worker', 'Thực phẩm', 'Đài Nam', 'Từ 29.500 NT$/tháng (lương cơ bản)', '15', 'Nữ', '20 - 35', 0],
];
for (const [cat, slug, tvi, tzh, ten, industry, loc, salary, hc, gender, age, feat] of jobs) {
  if (exists('jobs', slug)) continue;
  run(
    `INSERT INTO jobs(slug,category,title_vi,title_zh,title_en,industry,location,salary,headcount,gender,age,featured,description_vi,requirements_vi,benefits_vi)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    slug, cat, tvi, tzh, ten, industry, loc, salary, hc, gender, age, feat,
    `${SAMPLE}\nMô tả nội dung công việc, ca làm, môi trường làm việc.`,
    cat === 'engineer'
      ? '- Tốt nghiệp đại học từ 2 năm hoặc cao đẳng/trung cấp từ 5 năm\n- Có đóng bảo hiểm xã hội tại Việt Nam\n- Sức khoẻ tốt, không tiền án tiền sự'
      : '- Sức khoẻ tốt\n- Không tiền án tiền sự\n- Chăm chỉ, tuân thủ kỷ luật',
    '- Lương đúng hợp đồng\n- Bảo hiểm theo quy định Đài Loan\n- Hỗ trợ ăn ở theo thoả thuận'
  );
}

const posts = [
  ['chuong-trinh-ky-su-dai-loan-la-gi', 'guide', 'Chương trình kỹ sư Đài Loan là gì? Ai đủ điều kiện?', 'Tổng quan điều kiện bằng cấp, quyền lợi và thời gian xuất cảnh của diện kỹ sư.', `${SAMPLE}\n\n**Điều kiện cơ bản**\n- Tốt nghiệp đại học từ 2 năm hoặc cao đẳng/trung cấp từ 5 năm trở lên\n- Có đóng bảo hiểm xã hội tại Việt Nam\n\n**Quyền lợi**\n- Lương cơ bản 48.000 Đài tệ/tháng\n- Cơ hội định cư lâu dài, bảo lãnh người thân`],
  ['ho-so-du-hoc-dai-loan-can-gi', 'guide', 'Hồ sơ du học Đài Loan cần chuẩn bị những gì?', 'Danh sách giấy tờ cơ bản và lưu ý khi nộp hồ sơ vào các trường.', `${SAMPLE}\n\n- Bằng và học bạ THPT (hoặc bằng đại học nếu học lên cao hơn)\n- Chứng chỉ ngoại ngữ\n- Chứng minh tài chính\n- Hộ chiếu, ảnh, giấy khám sức khoẻ`],
  ['so-sanh-ky-su-va-lao-dong-pho-thong', 'news', 'So sánh kỹ sư và lao động phổ thông tại Đài Loan', 'Chi phí, thu nhập và thời gian xuất cảnh của hai diện.', `${SAMPLE}\n\nXem bảng so sánh chi tiết tại trang Kỹ sư Đài Loan.`],
];
for (const [slug, cat, title, excerpt, body] of posts) {
  if (exists('posts', slug)) continue;
  run('INSERT INTO posts(slug,category,title_vi,excerpt_vi,body_vi) VALUES(?,?,?,?,?)', slug, cat, title, excerpt, body);
}

if (!all('SELECT id FROM stories LIMIT 1').length) {
  run(
    'INSERT INTO stories(name,program,detail,quote_vi,sort) VALUES(?,?,?,?,?)',
    'Kỹ sư đang làm việc tại Đài Loan', 'engineer', 'Diện kỹ sư',
    'Thu nhập 7 vạn Đài tệ, tương đương khoảng 55 triệu đồng mỗi tháng.', 0
  );
}

console.log('Đã nạp dữ liệu mẫu. Nhớ thay bằng thông tin thật trước khi công khai website.');
