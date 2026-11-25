# Website CTCP Tập đoàn TB Việt Nam (TB GROUP)

Website 3 lĩnh vực: **Du học · Xuất khẩu lao động · Kỹ sư Đài Loan**. Ba ngôn ngữ (Tiếng Việt, 繁體中文, English), có trang quản trị để nhân viên tự cập nhật nội dung và xem khách đăng ký.

- **Công nghệ:** Node.js 22.13+ · Express 4 · EJS (render phía máy chủ, tốt cho SEO) · SQLite (module `node:sqlite` có sẵn, không cần cài thêm CSDL)
- **Không cần build:** chỉ `npm install` rồi `npm start`.

## 1. Chạy thử trên máy

```powershell
npm install
copy .env.example .env      # rồi mở .env, điền SESSION_SECRET (xem hướng dẫn trong file)
npm run seed                # tạo tài khoản quản trị + DỮ LIỆU MẪU (chỉ để xem thử)
npm run dev                 # http://localhost:3000
npm test                    # chạy bộ kiểm thử
```

- Mật khẩu quản trị: đặt `ADMIN_PASSWORD` trong `.env` trước khi chạy `seed`, hoặc để trống để hệ thống tự sinh và in ra **một lần** trên màn hình.
- Trang quản trị: `http://localhost:3000/admin`

## 2. Quản trị nội dung (`/admin`)

| Mục | Dùng để |
|---|---|
| **Khách đăng ký** | Xem, tìm, lọc; đổi trạng thái (Mới / Đã liên hệ / Hoàn tất / Rác), ghi chú; **xuất CSV mở bằng Excel** |
| **Trường du học** | Thêm/sửa thông tin tuyển sinh: tên, thành phố, ngành, học phí, kỳ nhập học, học bổng, điều kiện, ảnh... |
| **Đơn hàng & Kỹ sư** | Thêm/sửa thông tin tuyển dụng cho Xuất khẩu lao động và Kỹ sư (chọn đúng chương trình khi tạo) |
| **Tin tức**, **Chia sẻ học viên** | Bài viết và lời chia sẻ hiển thị trên website |
| **Thông tin công ty** | Hotline, Zalo, email, địa chỉ văn phòng, số liệu trang chủ |

Mẹo nhập liệu: mỗi nội dung có 3 tab ngôn ngữ; để trống bản Trung/Anh thì website tự dùng tiếng Việt. Trong ô nhiều dòng, dòng bắt đầu bằng `- ` là gạch đầu dòng, `**chữ**` là chữ đậm. Tắt "Đang hiển thị" để ẩn một mục mà không xoá.

## 3. Cấu trúc thư mục

```
server.js            Khởi động Express, bảo mật (helmet, CSP, rate limit, phiên đăng nhập)
routes/public.js     Trang công khai + nhận biểu mẫu đăng ký
routes/admin.js      Trang quản trị (cấu hình các mục ở đầu file: thêm trường/cột mới tại đây)
routes/sitemap.js    sitemap.xml (có hreflang)
lib/                 db.js (SQLite), notify.js (email/Telegram/Sheets/webhook), i18n.js, seed.js
locales/             vi.json, zh.json, en.json  <- chữ cố định của giao diện
views/               Mẫu trang EJS (views/admin cho quản trị)
public/              CSS, JS, ảnh, uploads/ (ảnh tải lên)
test/                Kiểm thử tự động
```

## 4. Thông báo khi có khách đăng ký

Đăng ký luôn được **lưu vào CSDL trước**, rồi mới gửi thông báo. Kênh nào lỗi cũng không làm mất đăng ký (lỗi được ghi vào log). Điền biến tương ứng trong `.env` (xem `.env.example`).

- **Email:** `SMTP_*` và `NOTIFY_EMAIL_TO`. Với email Hostinger: `smtp.hostinger.com`, cổng 465, `SMTP_SECURE=true`.
- **Telegram:** tạo bot bằng `@BotFather`, thêm bot vào nhóm nhận tin, điền `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`.
- **Google Sheets:** không cần khoá API, dùng Google Apps Script (mục 5).
- **Zalo:** Zalo OA/ZNS yêu cầu doanh nghiệp xác thực và duyệt mẫu tin, nên website chưa gọi trực tiếp. Dùng `LEAD_WEBHOOK_URL` để nối qua cầu nối (Make, n8n, hoặc dịch vụ của bạn). Mỗi đăng ký được gửi dạng JSON `{ "event": "lead.created", "lead": {...} }`. Nút Zalo nổi trên website dùng số trong "Thông tin công ty".

## 5. Đẩy đăng ký sang Google Sheets

1. Tạo Google Sheet, đặt tên trang tính là `Leads`, dòng 1 là tiêu đề: `Thời gian | Họ tên | Điện thoại | Email | Chương trình | Quan tâm | Lời nhắn | Ngôn ngữ | Trang`.
2. Trong Sheet: **Tiện ích mở rộng → Apps Script**, dán đoạn mã dưới, **Cài đặt dự án → Thuộc tính tập lệnh**, thêm `SECRET` với một chuỗi ngẫu nhiên.
3. **Triển khai → Triển khai mới → Ứng dụng web**: Thực thi bằng *Tôi*, người có quyền truy cập *Bất kỳ ai*. Sao chép URL vào `GOOGLE_SHEETS_WEBHOOK_URL`, và `GOOGLE_SHEETS_SECRET` đặt đúng bằng `SECRET`.

```javascript
function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  if (d.secret !== PropertiesService.getScriptProperties().getProperty('SECRET')) {
    return ContentService.createTextOutput('forbidden');
  }
  // Chống chèn công thức: ô bắt đầu bằng = + - @ sẽ bị coi là chữ
  var safe = function (v) { v = String(v || ''); return /^[=+\-@]/.test(v) ? "'" + v : v; };
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads').appendRow(
    [d.time, d.name, d.phone, d.email, d.program, d.interest, d.message, d.lang, d.source].map(safe)
  );
  return ContentService.createTextOutput('ok');
}
```

## 6. Đưa lên GitHub

```powershell
git init
git add .
git commit -m "TB GROUP website"
git branch -M main
git remote add origin https://github.com/<tai-khoan>/<ten-repo>.git
git push -u origin main
```

`.gitignore` đã loại `.env`, CSDL và ảnh tải lên. **Không bao giờ commit `.env`.** Nên để repo ở chế độ **Private**.

## 7. Triển khai lên Hostinger (gói có Node.js Web App)

Cần gói Hostinger hỗ trợ ứng dụng Node.js (Business/Cloud hoặc VPS). Giao diện hPanel có thể thay đổi, hãy đối chiếu với tài liệu Hostinger khi cần.

1. hPanel → **Websites → Add website → Node.js Apps** → **Import Git Repository**, đăng nhập GitHub và chọn repo.
2. **Node.js version: 22 trở lên** (bắt buộc, vì dùng `node:sqlite`). Lệnh cài: `npm install`. Lệnh chạy: `npm start` (file vào: `server.js`).
3. Thêm **Environment variables** (theo `.env.example`): tối thiểu `NODE_ENV=production`, `SESSION_SECRET`, `SITE_URL=https://ten-mien-cua-ban`, `ADMIN_USER`, `ADMIN_PASSWORD` và các biến thông báo.
4. **Dữ liệu bền vững (quan trọng):** đặt `DB_PATH` và `UPLOAD_DIR` ở một thư mục *ngoài* thư mục mã nguồn (ví dụ `/home/<user>/tb-data/tbgroup.db` và `/home/<user>/tb-data/uploads`) để không mất dữ liệu khi deploy lại. Tạo thư mục đó trước.
5. Sau khi deploy xong, mở terminal/SSH của ứng dụng và chạy **một lần**: `node lib/seed.js --admin-only` (tạo tài khoản quản trị và cài đặt mặc định, **không** nạp dữ liệu mẫu).
6. Trỏ tên miền, bật SSL (HTTPS). Đăng nhập `https://ten-mien/admin`, đổi mật khẩu, nhập thông tin công ty và nội dung thật.
7. Cập nhật sau này: `git push` lên nhánh `main`, Hostinger tự kéo và khởi động lại (nếu đã bật auto-deploy) hoặc bấm Redeploy.

**Nhân Hoà:** dùng gói Cloud/VPS (hosting chia sẻ thường không chạy được Node.js). Trên VPS Linux: cài Node 22, `git clone`, `npm ci --omit=dev`, tạo `.env`, chạy bằng PM2 (`pm2 start server.js --name tbgroup`), đặt Nginx làm reverse proxy về cổng 3000 và cài SSL (Let's Encrypt).

## 8. Trước khi mở công khai

- [ ] **Xoá dữ liệu mẫu** (trường, đơn hàng, bài viết do `npm run seed` tạo) và nhập thông tin thật; trên máy chủ chỉ chạy `--admin-only`.
- [ ] **Logo:** logo hiện tại (`public/img/logo.svg`) là chữ T tạm. Thay bằng logo thật của TB GROUP (giữ tên file, hoặc sửa `views/partials/head.ejs` và `foot.ejs`).
- [ ] **Hình ảnh thật** của công ty (văn phòng, phỏng vấn, xuất cảnh) tải lên qua trang quản trị. Chỉ dùng ảnh bạn có quyền sử dụng và đã được người trong ảnh đồng ý.
- [ ] **Số liệu trang chủ** ("Năm kinh nghiệm", "Học viên đã xuất cảnh"...) đang **tắt**. Chỉ bật (`Thông tin công ty → Hiện khối số liệu = 1`) sau khi điền số thật, có thể chứng minh được.
- [ ] **Số liệu lương/chi phí** (48.000 và 29.500 Đài tệ, 3-6 tháng...) lấy từ website cũ kysudailoan.com; hãy xác nhận còn đúng.
- [ ] **Email công ty** trong "Thông tin công ty" (đang trống).
- [ ] Bản dịch **Trung/Anh** do máy soạn: nên nhờ người bản ngữ rà soát, nhất là nội dung pháp lý/hợp đồng.
- [ ] Điều khoản và chính sách bảo mật dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP) cần do bộ phận pháp lý của công ty soạn; website chỉ có dòng đồng ý ngắn dưới biểu mẫu.
- [ ] Hoạt động **xuất khẩu lao động cần giấy phép** theo pháp luật Việt Nam; nên hiển thị số giấy phép của công ty ở chân trang khi có.
- [ ] Sao lưu định kỳ file CSDL (`DB_PATH`) và thư mục ảnh.

## 9. Bảo mật đã có sẵn

Mật khẩu băm bcrypt; cookie phiên `httpOnly` + `sameSite`; CSRF cho mọi thao tác quản trị; giới hạn tần suất đăng nhập và đăng ký; ô chống bot ẩn; chặn gửi biểu mẫu chéo site; Content-Security-Policy qua helmet; mọi nội dung nhập vào được escape; ảnh tải lên giới hạn loại và dung lượng; xuất CSV chống chèn công thức Excel; trang quản trị `noindex`.

## 10. Landing page quảng cáo (Du học / Kỹ sư / Xuất khẩu lao động)

Ba trang landing nằm trong cùng ứng dụng (`routes/landing.js`, giao diện `views/lp/`, `public/css/landing.css`, `public/js/landing*.js`).

- Địa chỉ dự phòng, dùng được ngay: `/lp/du-hoc`, `/lp/ky-su`, `/lp/xuat-khau-lao-dong`.
- Theo subdomain: `du-hoc.<tên miền>`, `ky-su.<tên miền>`, `xkld.<tên miền>` (cần thêm subdomain trỏ về cùng ứng dụng Node trong Hostinger).
- Form gửi về `POST /dang-ky` của chính landing, lưu bảng `leads` với `program` đúng từng trang; URL đầy đủ (kèm utm) nằm ở cột `source`, hệ/ngành khách chọn ở `ref_title`. Đẩy tiếp Google Sheets/email như đăng ký thường.
- Mã theo dõi và liên hệ riêng nhập ở `/admin/settings`: `pixel_meta`, `pixel_tiktok`, `ga4_id`, `gads_id`, `gads_label`, và `lp_<study|engineer|labor>_phone/zalo/messenger`. Để trống thì không nạp mã bên thứ ba nào.
- Sự kiện: `Lead` khi gửi form thành công, `Contact` khi bấm gọi/Zalo/Messenger (`public/js/lp-track.js`).
