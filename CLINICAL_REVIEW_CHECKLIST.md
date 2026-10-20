# Phiếu rà soát lâm sàng GeneSense

**Trạng thái: Chưa được bác sĩ rà soát hoặc phê duyệt.** Đây là phiếu chuẩn bị cho buổi đánh giá độc lập; không phải bằng chứng thẩm định y khoa.

## Phạm vi cần xem

- Cách ứng dụng tổng hợp yếu tố nguy cơ từ bệnh sử gia đình và diễn đạt mức nguy cơ trên giao diện.
- Tính dễ hiểu của phần giải thích, các hành động tiếp theo và giới hạn của điểm số.
- Các ngưỡng cảnh báo chỉ số, cách ưu tiên cảnh báo cấp cứu và nội dung hướng người dùng gọi 115.
- Sàng lọc bệnh di truyền đơn gen (`backend/app/services/hereditary.py`): thalassemia, thiếu men G6PD, ung thư vú/buồng trứng di truyền (BRCA) và tăng cholesterol gia đình. Cần xác nhận từng quy tắc, câu chữ "nên hỏi bác sĩ" và lời khuyên. Tuổi chẩn đoán hiện chỉ là thông tin tham khảo, chưa được dùng trong quy tắc.
- Phần hướng dẫn bệnh di truyền và mô tả kiểu di truyền; xác nhận câu chữ không khái quát alpha/beta thalassemia, G6PD, BRCA hoặc FH quá mức.
- Tuổi chẩn đoán được lưu tùy chọn cho tóm tắt gia đình; xác nhận tuổi không được diễn giải như chẩn đoán và không ảnh hưởng điểm/rule trước khi có quy trình thẩm định riêng.
- Luồng phiếu xét nghiệm gen: độ chính xác trích xuất gen/biến thể/kiểu gen/kết luận nguyên văn, mức dễ sửa và so với ảnh gốc; đảm bảo VUS/uncertain và kết quả chưa rõ không bị đổi thành kết luận GeneSense.
- Cách dẫn người dùng sang ClinVar/ClinGen và giải thích giới hạn: dữ liệu có thể có nhiều submitter/mức rà soát, thay đổi theo thời gian và chưa được GeneSense đồng bộ hoặc diễn giải tự động.
- Ngưỡng đường huyết: ứng dụng ghi lúc đo (lúc đói, sau ăn hoặc không rõ) nhưng vẫn dùng một khoảng an toàn 70–180 mg/dL cho mọi lần đo. Cần quyết định có tách ngưỡng theo lúc đo hay không.
- Cách xử lý hồ sơ thiếu, chưa rõ hoặc nhập không nhất quán; tránh khiến người dùng hiểu thiếu dữ liệu là nguy cơ thấp.
- Mức độ phù hợp của cảnh báo “không thay thế chẩn đoán”; khả năng người dùng nhầm gợi ý theo dõi với chỉ định điều trị.
- Tác động của tuổi, giới tính, bệnh đã chẩn đoán và bệnh sử gia đình trong từng nhánh kết quả.
- Tính phù hợp khi dùng cho nhóm tuổi hoặc bối cảnh chăm sóc khác nhau; nêu rõ trường hợp cần loại trừ.

## Không thuộc phạm vi của bản rà soát này

- Chẩn đoán, kê đơn, thay liều thuốc hoặc hướng dẫn ngừng thuốc.
- Xác nhận độ chính xác của OCR/AI từ ảnh đơn thuốc thật; cần bộ mẫu được phép sử dụng và đánh giá riêng.
- Kết luận rằng điểm số dự đoán bệnh hoặc đã được xác nhận trên quần thể lâm sàng.

## Thông tin người rà soát

- Họ tên và chức danh chuyên môn:
- Chuyên khoa / kinh nghiệm phù hợp:
- Cơ sở công tác:
- Ngày rà soát:
- Phiên bản ứng dụng / mã bản phát hành:
- Kết luận: ☐ Chấp nhận có điều kiện  ☐ Cần sửa trước khi thử nghiệm  ☐ Không chấp nhận

## Nhận xét và bằng chứng

| Khu vực | Kết quả / vấn đề | Mức độ | Bằng chứng hoặc hành động sửa |
| --- | --- | --- | --- |
| Bệnh sử gia đình và mức nguy cơ |  |  |  |
| Ngưỡng và cảnh báo chỉ số |  |  |  |
| Cách diễn đạt, khả năng hiểu |  |  |  |
| Hồ sơ thiếu hoặc dữ liệu bất thường |  |  |  |
| Đối tượng sử dụng / giới hạn |  |  |  |

## Điều kiện trước khi giới thiệu như một tính năng đã được rà soát

1. Người hành nghề y đủ chuyên môn hoàn thành phiếu và xác nhận phạm vi đánh giá.
2. Mọi vấn đề nghiêm trọng được sửa và kiểm thử lại; lưu phiên bản cùng kết quả kiểm thử.
3. Mọi nội dung được duyệt vẫn nêu rõ giới hạn, không đưa ra chẩn đoán hay chỉ định điều trị.
4. Chủ sản phẩm ghi nhận quyết định phát hành riêng; việc ký phiếu không tự động chứng minh hiệu quả lâm sàng.

