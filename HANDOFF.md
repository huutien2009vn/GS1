# Bàn giao dự án GeneSense / GS1

**Cập nhật:** 06/10/2026 · **Ngôn ngữ sản phẩm:** tiếng Việt · **Trạng thái:** bản demo/đánh giá, chưa phải thiết bị y tế.

Tài liệu này mô tả **mã nguồn trong GS1** tại thời điểm bàn giao. Đọc cùng [README.md](README.md), [PRODUCT.md](PRODUCT.md) và [CLINICAL_REVIEW_CHECKLIST.md](CLINICAL_REVIEW_CHECKLIST.md). Nếu tài liệu cũ mâu thuẫn với mã nguồn, kiểm tra mã nguồn và kiểm thử lại trước khi đưa ra cam kết.

## 1. Đường dẫn và phiên bản

| Mục | Trạng thái hiện tại |
| --- | --- |
| Repo bàn giao | [github.com/huutien2009vn/GS1](https://github.com/huutien2009vn/GS1) — **private**, cần đăng nhập tài khoản có quyền xem |
| Nhánh bàn giao | `main`, snapshot ứng dụng từ commit `6b5b629` của nhánh `feat/care-ui-review` |
| Repo phát triển gốc | [yosidalogarit/genesense](https://github.com/yosidalogarit/genesense), nhánh chính `master` |
| Công việc ở repo gốc | [PR #24](https://github.com/yosidalogarit/genesense/pull/24) từ `feat/care-ui-review` vào `master` đang mở tại lúc bàn giao; kiểm tra lại trạng thái trước khi làm tiếp |
| Link chạy GS1 | **Chưa triển khai GS1 lên hosting.** Repo GitHub là mã nguồn, không phải đường dẫn web chạy được |
| Link công khai cũ | `https://genesense-five.vercel.app/` thuộc luồng triển khai GeneSense gốc; không được xem là bản GS1 hoặc tự nhận là đã chứa các thay đổi mới |
| Xem thử trên máy hiện tại | `http://127.0.0.1:8003/` là server review riêng, không bền và không phải một phần của repo; có thể ngừng khi phiên làm việc kết thúc |

`vercel.json` hiện chỉ bật Git deployment cho nhánh **`master`**. GS1 dùng **`main`**, nên push vào GS1 không tự động phát hành web. Muốn triển khai GS1 phải chỉnh cấu hình nhánh và kết nối một dự án hosting/database riêng; không tái sử dụng database sản xuất của repo gốc khi chưa có quyết định rõ ràng.

## 2. Mục đích và nguyên tắc an toàn

GeneSense là PWA theo dõi chỉ số sức khỏe tại nhà, bệnh sử gia đình và nguy cơ bệnh mạn tính. Người dùng mục tiêu gồm người lớn tuổi/ít quen công nghệ và người thân hỗ trợ theo dõi. Ưu tiên màn hình điện thoại, chữ dễ đọc, thao tác ngắn, trạng thái không chỉ biểu thị bằng màu.

- Điểm và mức nguy cơ chỉ mang tính **sàng lọc minh họa**, không chẩn đoán, kê đơn, thay đổi liều hay thay thế bác sĩ. `CLINICAL_REVIEW_CHECKLIST.md` chưa có xác nhận của bác sĩ.
- Chỉ số cấp cứu phải được ưu tiên hơn điểm số/thông báo thường; giao diện hướng người dùng gọi **115** khi có dấu hiệu cần cấp cứu.
- Dữ liệu mẫu luôn ghi nhãn **“Dữ liệu mẫu”**. Không biến dữ liệu mẫu hoặc số liệu trích từ giấy tờ thành phép đo trực tiếp chưa được thực hiện.
- Nhập tay phải hoạt động khi không có Bluetooth hoặc AI. Ảnh/AI cần sự đồng ý, kết quả OCR cần người dùng xem và xác nhận trước khi lưu.
- Không đưa hồ sơ bệnh án thật, cookie đăng nhập, ảnh chụp đơn thuốc, khóa API hoặc chuỗi kết nối database vào Git, issue, ảnh chụp màn hình công khai hay log bàn giao.

## 3. Kiến trúc và nơi cần sửa

| Thành phần | Tệp chính | Vai trò |
| --- | --- | --- |
| Backend | `backend/app/main.py` | FastAPI, API hồ sơ/chỉ số/giấy tờ/thuốc, middleware bảo mật, phục vụ frontend |
| Đăng nhập | `backend/app/auth.py` | Google OAuth khi cấu hình, tài khoản dùng thử, session cookie |
| Chia sẻ gia đình | `backend/app/care.py` | Mã mời, quyền người thân, dữ liệu chỉ đọc, huyết áp 7 ngày |
| Dữ liệu | `backend/app/models.py`, `database.py`, `migrations.py`, `schemas.py` | SQLAlchemy, SQLite/ PostgreSQL, schema và migration hiện có |
| Tính toán | `backend/app/services/risk_engine.py` | Chỉ số, mức cảnh báo và nguy cơ gia đình; **chưa được thẩm định lâm sàng** |
| AI | `backend/app/services/ai_service.py` | Đọc giấy tờ/đơn thuốc và nội dung gợi ý khi được phép |
| Giao diện | `frontend/index.html`, `frontend/assets/styles.css`, `frontend/js/app.js` | HTML/CSS/vanilla JS; không có bước build frontend |
| Biểu đồ/thiết bị | `frontend/js/chart.js`, `frontend/js/ble.js` | SVG chart và Web Bluetooth khi trình duyệt/thiết bị hỗ trợ |
| Client API/PWA | `frontend/js/api.js`, `frontend/sw.js`, `frontend/manifest.webmanifest` | Gọi API, cache shell tĩnh và manifest |
| Vercel | `api/index.py`, `vercel.json`, `public/` | Một Python serverless function; `public/` trống có chủ đích |
| Kiểm thử | `backend/tests/` | 37 bài test backend trong snapshot này |

Ứng dụng dùng SQLite mặc định tại `healthpredict.db` trong thư mục repo khi chạy máy cá nhân. Bản Vercel yêu cầu PostgreSQL (ví dụ Neon) và `SESSION_SECRET`; `api/index.py` từ chối SQLite trên Vercel. Không giả định GS1 đã có database, domain, biến môi trường hoặc tự động deploy.

## 4. Tính năng đang có trong snapshot GS1

1. **Hôm nay:** trạng thái từ lần đo phù hợp gần nhất, chỉ số, khuyến nghị, lối tắt tới các việc chính và nút ghi chỉ số. Tình huống cấp cứu dùng panel riêng, nút gọi 115 và ưu tiên cảnh báo.
2. **Ghi chỉ số:** nhập tay; Web Bluetooth khi có thiết bị/trình duyệt tương thích; dữ liệu mẫu chỉ hiện cho tài khoản dùng thử. Lần đo được lưu với nguồn dữ liệu rõ ràng.
3. **Lịch sử:** danh sách lần đo, bộ lọc dữ liệu thật/mẫu, biểu đồ SVG cho huyết áp, nhịp tim, SpO₂ và đường huyết; tóm tắt huyết áp 7 ngày phân nhóm sáng/tối. Thẻ chỉ số và biểu đồ có chuyển động khi lần đầu vào vùng nhìn thấy, hỗ trợ `prefers-reduced-motion`.
4. **Thuốc và giấy tờ:** thêm/sửa/xóa thuốc bằng tay; lịch Sáng/Trưa/Chiều/Tối hoặc “Khi cần”; tích “Đã uống” theo buổi được lưu phía server; in lịch; ảnh đơn thuốc/giấy khám/kết quả xét nghiệm có bước phân tích AI rồi **xem, sửa, chọn từng mục trước khi lưu**. Không có lời khuyên đổi liều hoặc tương tác thuốc tự động.
5. **Ảnh giấy tờ:** ảnh gốc lưu trong IndexedDB của **thiết bị đang dùng**, không phải server; dữ liệu đã trích và người dùng xác nhận được lưu riêng. Xóa dữ liệu trình duyệt sẽ mất ảnh gốc. Không mặc định đồng bộ ảnh qua các máy.
6. **Di truyền:** bệnh sử gia đình, mức nguy cơ theo từng bệnh và cây gia đình. Trên điện thoại mục này nằm trong **Hồ sơ**, không có nút riêng ở thanh dưới; vẫn có đường vào từ điều hướng bên trái/lối tắt trong ứng dụng.
7. **Người thân:** người bệnh tạo mã mời, người chăm sóc liên kết và xem dữ liệu được chia sẻ dạng chỉ đọc; người bệnh có thể thu hồi. Lịch thuốc/tích đã uống chỉ chia sẻ khi tùy chọn `share_medications` được bật. Ảnh giấy tờ, email, ghi chú tự do và consent không nằm trong dữ liệu chia sẻ.
8. **Hồ sơ/báo cáo:** thông tin cá nhân và gia đình, ảnh đại diện; phiếu tổng hợp cho bác sĩ qua hộp thoại in/lưu PDF của trình duyệt, ghi rõ không phải giấy tờ y tế chính thức.
9. **Điều hướng/UI:** logo GeneSense mở drawer bên trái; header, drawer và thanh điều hướng điện thoại dùng nền blur; tương tác icon có nổi nhẹ khi hover/chạm. Drawer có overlay, khóa focus nền và hỗ trợ đóng bằng bàn phím. Thanh dưới điện thoại gồm Hôm nay, Lịch sử, Giấy tờ, Hồ sơ.

Đây là mô tả **tính năng trong mã** chứ không xác nhận đã được kiểm thử trên mọi điện thoại, máy đo, ảnh đơn thuốc hay trình duyệt. Các giới hạn chưa xác minh nằm ở mục 8.

## 5. Chạy trên máy cá nhân

Yêu cầu: Python **3.11+**, Git, trình duyệt hiện đại. Với Bluetooth cần trình duyệt và thiết bị hỗ trợ Web Bluetooth; localhost hoặc HTTPS là secure context.

### Windows PowerShell

```powershell
git clone https://github.com/huutien2009vn/GS1.git
cd GS1
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

### macOS / Linux

```bash
git clone https://github.com/huutien2009vn/GS1.git
cd GS1
python3 -m venv .venv
./.venv/bin/python -m pip install -r backend/requirements.txt
cp .env.example .env
./.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Mở `http://localhost:8000/`; API docs chỉ hiện trong môi trường development tại `http://localhost:8000/docs`. Lần đầu chọn tài khoản demo rồi điền hồ sơ. `localhost` và `127.0.0.1` có cookie riêng; nên dùng một địa chỉ nhất quán. Nếu đổi cổng hoặc public qua tunnel, chỉnh `APP_BASE_URL`, `CORS_ORIGINS` và database cho phù hợp. Không dùng database thật để thử luồng có ghi/xóa.

`.env.example` là danh sách cấu hình mẫu, **không có khóa dùng được**. Những biến chính:

| Biến | Khi nào cần |
| --- | --- |
| `DATABASE_URL` | Mặc định SQLite; PostgreSQL cho Vercel/sản xuất |
| `APP_ENV`, `APP_BASE_URL`, `CORS_ORIGINS` | Môi trường, địa chỉ canonical, origin hợp lệ |
| `SESSION_SECRET` | Bắt buộc tối thiểu 32 ký tự trên Vercel/sản xuất |
| `ENABLE_DEMO_LOGIN`, `DEMO_PUBLIC`, `DEMO_ACCOUNTS_PER_HOUR`, `DEMO_RETENTION_DAYS` | Điều khiển tài khoản dùng thử; public demo phải cân nhắc quota và xóa dữ liệu |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Đăng nhập Google OAuth; độc lập với khóa Gemini |
| `AI_PROVIDER`, `GOOGLE_AI_API_KEY`, `GOOGLE_AI_MODEL`, `GOOGLE_AI_FALLBACK_MODEL`, `OPENAI_*` | AI đọc ảnh/viết gợi ý nếu được bật và có consent |

Không cần AI hay Google OAuth để dùng thử **nhập tay**. Nếu không có cấu hình AI, phân tích ảnh không xử lý thực. Không đưa giá trị bí mật vào tài liệu này.

## 6. Chạy kiểm thử và kiểm tra trước khi bàn giao thay đổi

```powershell
.\.venv\Scripts\python -m pytest backend\tests -q
node --check frontend\js\app.js
node --check frontend\js\chart.js
git diff --check
```

Snapshot trước khi cập nhật handoff có **37 test backend**; cần chạy lại trong môi trường mới để xác nhận. Test bao phủ đăng nhập/cô lập tài khoản, tài liệu, thuốc và tích đã uống, huyết áp tuần, chia sẻ người thân, AI parser, thuật toán nguy cơ. Đây không phải kiểm định y khoa hoặc kiểm thử giao diện toàn diện.

Khi sửa frontend, kiểm tra thực tế ở kích thước điện thoại khoảng **375×812** và desktop; xem console/CSP, drawer bằng bàn phím, tab dưới, biểu đồ chạm/hover, `prefers-reduced-motion`. Sau khi đổi HTML/CSS/JS, tăng `CACHE` trong `frontend/sw.js` (snapshot hiện là `genesense-v47`) để tránh PWA giữ giao diện cũ. Khi sửa backend, khởi động lại server nếu reload không nhận code mới. Chỉ test thao tác ghi/xóa trên tài khoản và database thử nghiệm, không trên hồ sơ thật hay demo của người khác.

Trang `/` có Content-Security-Policy nghiêm: không thêm inline script, inline handler hoặc `style="..."` vào template; chỉnh class hoặc style bằng JS phù hợp policy. API và dữ liệu sức khỏe không được service worker cache; shell tĩnh có thể được cache để mở giao diện khi mất mạng, **không có nghĩa là nhập/sync dữ liệu offline đã hoàn thành**.

## 7. Triển khai GS1 để người khác review

**Hiện chưa triển khai.** Để có link web đúng bản GS1, cần thực hiện và xác minh riêng:

1. Kết nối repo GS1 với một project Vercel mới; đặt preset `Other` và vùng phù hợp. Kiểm tra/sửa `vercel.json`: hiện `git.deploymentEnabled` chỉ bật `master`, trong khi GS1 mặc định `main`.
2. Tạo **database PostgreSQL riêng**, không dùng chung dữ liệu đang chạy của GeneSense gốc. Cấp `DATABASE_URL`, `SESSION_SECRET` (ít nhất 32 ký tự), `APP_ENV=production`; nếu cho phép khách dùng thử thêm `DEMO_PUBLIC=true` và cân nhắc giới hạn/retention. OAuth/AI là tùy chọn và cần domain/consent tương ứng.
3. Deploy, sau đó kiểm tra `/api/health`, trang login, tạo tài khoản demo, nhập một số đo thử, tải lại, xem lịch sử và các tab trên điện thoại. Xác nhận cache SW, cookie HTTPS, header CSP, log lỗi và database trước khi gửi link cho người review.
4. Ghi lại URL, project, nhánh, commit deploy và kết quả smoke test ngay trong tài liệu bàn giao hoặc release note sau khi hoàn tất. **Không** gắn nhãn link cũ hay tunnel tạm là GS1 nếu chưa xác minh đúng commit.

Trong repo gốc, PR #24 vẫn là thay đổi **chưa merge** tại thời điểm snapshot; việc cập nhật GS1 không tự merge PR này hay cập nhật website production của repo gốc. Nếu tiếp tục phát triển cả hai repo, chọn rõ nơi làm nguồn chính và cách đồng bộ để tránh hai bản lệch nhau.

## 8. Giới hạn, rủi ro và việc còn lại

### Chưa xác minh đầy đủ

- Chưa chạy luồng OCR bằng ảnh đơn thuốc tiếng Việt thực tế trên bản GS1; cần mẫu được phép sử dụng, che thông tin cá nhân, kiểm tra chữ viết tay/ảnh nghiêng/lóa và lỗi tên thuốc/liều/buổi uống. Không lưu thuốc tự động khi AI không chắc.
- Chưa xác nhận đầy đủ trên iPhone/Safari, điện thoại Android thật, tải ảnh gốc trên điện thoại, máy Bluetooth cụ thể và in PDF nhiều trang bằng mắt. Web Bluetooth không có trên mọi trình duyệt.
- Chưa kiểm thử end-to-end một bản **GS1 đã deploy** vì hiện không có deployment GS1. Google OAuth cũng cần cấu hình client/domain thật mới kiểm tra được.
- Đánh giá lâm sàng theo `CLINICAL_REVIEW_CHECKLIST.md` chưa hoàn tất; không quảng bá điểm nguy cơ như kết quả y khoa đã được chứng nhận.

### Hạn chế đã biết từ mã/tài liệu

- Dữ liệu lịch sử và phiếu tổng hợp chỉ tải tối đa **100** lần đo gần nhất qua API hiện tại; chưa có phân trang đầy đủ.
- Ảnh gốc giấy tờ ở IndexedDB có thể mất khi xóa dữ liệu trình duyệt/đổi máy; phần đã xác nhận lưu server không tự xóa theo ảnh khi xóa một giấy tờ. Quét lại một tài liệu có thể tạo lần đo trùng; thuốc trùng có bước hỏi người dùng.
- Tính năng PWA mới cache shell; **nhập liệu offline, hàng đợi đồng bộ và thông báo nhắc thuốc** chưa phải luồng hoàn chỉnh.
- Cần kiểm tra lại `PRODUCT.md` và `README.md` khi sửa các tính năng mới: một số mô tả cũ có thể chưa phản ánh IndexedDB, lịch thuốc/đã uống và chart SVG. Ưu tiên mã và test hiện tại làm nguồn sự thật kỹ thuật.
- Bản demo chưa sẵn sàng cho dữ liệu bệnh nhân thật: cần chính sách riêng tư, xóa/xuất dữ liệu, backup/monitoring/audit, kiểm thử bảo mật và thẩm định quy định liên quan trước khi phát hành rộng.

### Ưu tiên tiếp theo đề xuất

1. Chốt repo nào sẽ là nguồn chính (GS1 hay `yosidalogarit/genesense`) và tình trạng PR #24; tránh phát triển hai nhánh không đồng bộ.
2. Nếu cần URL cho hội đồng/người review: triển khai **GS1 riêng** theo mục 7, chạy smoke test trên bản deploy rồi mới gửi link.
3. Kiểm thử UI thực tế trên Android/iPhone và accessibility: drawer/blur, thanh dưới, biểu đồ khi chạm, vùng click, focus, reduced motion và scroll ngang.
4. Kiểm thử ảnh đơn thuốc tiếng Việt với sự đồng ý của người sở hữu dữ liệu; đánh giá từng trường AI trích xuất trước khi đưa vào lịch thuốc.
5. Nhờ người có chuyên môn lâm sàng rà soát ngưỡng, lời khuyên và cách trình bày nguy cơ; ghi phiên bản kết luận trong checklist.
6. Sau đó mới cân nhắc nhắc thuốc, offline sync, phân trang lịch sử, đơn vị đường huyết mmol/L, chỉnh sửa lần đo và các tiện ích theo phản hồi người dùng.

## 9. Quy tắc tiếp tục công việc

- Đọc `PRODUCT.md` và luồng code liên quan; thay đổi nhỏ, có thể kiểm chứng. Không tự mở rộng sang chẩn đoán, kê đơn hoặc chia sẻ dữ liệu nhạy cảm.
- Giữ thiết kế hiện tại theo yêu cầu mới nhất: mobile-first, header blur, drawer mở bằng logo, icon nổi nhẹ, animation ngắn và có reduced-motion. Handoff cũ từng cấm blur/hover; quyết định đó **đã bị yêu cầu UI mới thay thế**.
- Trước khi sửa/push vào repo gốc, kiểm tra PR #24 còn mở hay đã merge. GS1 `main` và repo gốc `master` là **hai remote/luồng độc lập**.
- Không đưa `.env`, database, ảnh đơn thuốc, cookie, file tạm `.tools/` hoặc dữ liệu thử nghiệm cá nhân lên Git. File `.gitignore` chỉ là lớp bảo vệ bổ sung, vẫn kiểm tra `git status`/diff trước commit.
- Mỗi bản bàn giao nên ghi: commit, nhánh, URL deploy thực (nếu có), test đã chạy, những gì chưa test và giới hạn dữ liệu. Không suy đoán rằng push GitHub đồng nghĩa đã deploy.
