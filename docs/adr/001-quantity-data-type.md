# ADR 001: Kiểu dữ liệu cho Số lượng tồn kho (Quantity)

## Trạng thái
Đã quyết định (Accepted) — 03/05/2026

## Bối cảnh
Spec VII yêu cầu độ chính xác cao (`DECIMAL(18,6)`). Tuy nhiên, cơ sở dữ liệu hiện tại đang sử dụng kiểu `INT` cho các cột `stock_qty`, `quantity`, v.v.

## Vấn đề
- Nếu giữ `INT`: Không thể quản lý các mặt hàng cân, đo, đong, đếm (ví dụ: 1.5 kg giấy, 0.5 lít mực).
- Nếu đổi sang `DECIMAL`: Cần thực thực hiện một bản migration cực lớn trên 39 bảng và cập nhật toàn bộ logic validation (Zod) cũng như Frontend.

## Quyết định
**Tiếp tục sử dụng `INT` cho phiên bản hiện tại (v4.x).**

## Lý do
1. **Phạm vi dự án**: QLVPP tập trung vào Văn phòng phẩm (Stationery) — là những mặt hàng rời (discrete items) như cái bút, quyển sổ, hộp kẹp ghim. Các mặt hàng này không có số lẻ.
2. **Hiệu năng**: `INT` chiếm ít bộ nhớ hơn và tính toán nhanh hơn `DECIMAL` trong MySQL.
3. **Tính ổn định**: Việc thay đổi kiểu dữ liệu cốt lõi tại thời điểm này (sát ngày production) tiềm ẩn rủi ro rất cao gây crash hệ thống ở những module chưa được test kỹ với số thập phân.

## Hệ quả
- Nếu trong tương lai dự án mở rộng sang các mặt hàng yêu cầu đơn vị đo lường (kg, m, l), hệ thống sẽ cần một đợt refactor lớn (Migration Phase 5).
- Hiện tại, Unit Conversion đã hỗ trợ quy đổi đơn vị (ví dụ: 1 thùng = 10 hộp), đảm bảo giải quyết được đa số bài toán về đơn vị tính mà vẫn giữ số nguyên.
