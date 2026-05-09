# Quy tắc nghiệp vụ kho (Inventory Rules) — Spec IX

Dài tài liệu này chi tiết các quy tắc tính toán và mutation tồn kho trong hệ thống QLVPP.

## 1. Công thức Tồn kho
Hệ thống quản lý tồn kho tại hai cấp độ: Toàn hệ thống (`products`) và Từng kho (`warehouse_stock`).

### Công thức khả dụng (Available Stock)
```
available_qty = stock_qty - reserved_quantity
```
- `stock_qty`: Số lượng thực tế đang nằm trong kho.
- `reserved_quantity`: Số lượng đã được giữ chỗ (do Requisition/Export Order đã duyệt nhưng chưa xuất kho).

## 2. Các loại giao dịch (Mutation Types)

| Loại | Products.stock_qty | Warehouse_stock.stock_qty | Giải thích |
|------|-------------------|--------------------------|------------|
| **INBOUND** | + qty | Kho đích + qty | Nhập kho từ NCC hoặc trả hàng. |
| **OUTBOUND** | - qty | Kho nguồn - qty | Xuất kho cấp phát hoặc thanh lý. |
| **TRANSFER** | Không đổi | Nguồn - qty, Đích + qty | Điều chuyển giữa các kho nội bộ. |
| **ADJUST** | = new_qty | = new_qty | Điều chỉnh sai lệch sau kiểm kê. |

## 3. Giữ chỗ (Reservation Logic) — Spec IX.3
Để tránh tình trạng "oversell" (bán quá số lượng thực tế), hệ thống áp dụng quy tắc giữ chỗ:
1. Khi **Manager duyệt** Phiếu yêu cầu (Requisition) hoặc Phiếu xuất (Export Order):
   - `reserved_quantity` tăng.
   - `available_qty` giảm.
2. Khi **Kho xác nhận xuất** (Confirm):
   - `stock_qty` giảm.
   - `reserved_quantity` giảm.
3. Khi **Hủy phiếu** đã duyệt:
   - `reserved_quantity` giảm (giải phóng tồn kho).

## 4. Tính giá vốn (Moving Average Cost) — Spec IV
Hệ thống sử dụng phương pháp **Bình quân gia quyền di động** (Moving Average) để tính giá vốn.

**Công thức khi nhập kho:**
```
new_avg = (old_qty * old_avg + in_qty * in_price) / (old_qty + in_qty)
```
- Nếu `old_qty + in_qty = 0`, giá vốn được reset về 0 hoặc `in_price`.
- Khi xuất kho, giá vốn được snapshot tại thời điểm xuất để ghi nhận vào `stock_ledger`.

## 5. Kiểm soát Concurrency — Spec VI.2
Tất cả các thao tác thay đổi tồn kho PHẢI thực hiện trong Transaction và sử dụng:
```sql
SELECT ... FROM warehouse_stock WHERE ... FOR UPDATE NOWAIT
```
Điều này đảm bảo không có hai tiến trình nào cùng thay đổi tồn kho của một sản phẩm tại một kho cùng một lúc.
