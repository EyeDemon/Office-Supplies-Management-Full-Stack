# Chiến lược Kiểm thử (Testing Strategy) — QLVPP

Tài liệu này hướng dẫn cách chạy và viết test để đảm bảo chất lượng hệ thống.

## 1. Cấu trúc Test
Hệ thống sử dụng Jest cho Backend và Playwright cho Frontend (E2E).

```
apps/api/src/__tests__/
  ├── unit/         # Test logic thuần (Rules, Utilities)
  ├── integration/  # Test UseCase + Database
  └── setup.js      # Global mock & configuration
```

## 2. Các loại Test

### Unit Test
Tập trung vào các pure functions trong `src/domain/rules/` và các helpers.
- Lệnh chạy: `npm run test:unit` (trong apps/api).
- Yêu cầu: Không gọi DB, chạy cực nhanh.

### Integration Test
Kiểm tra luồng nghiệp vụ hoàn chỉnh (UseCase).
- Lệnh chạy: `npm run test:integration`.
- Cơ chế: Sử dụng `setup.js` để mock DB (mặc định) hoặc kết nối DB thật (nếu cấu hình `DB_HOST`).
- Quan trọng: Kiểm tra tính đúng đắn của Transaction và Pessimistic Locking.

### E2E Test (Playwright)
Kiểm tra trải nghiệm người dùng cuối trên trình duyệt.
- Vị trí: `apps/web/tests/e2e/`.
- Lệnh chạy: `npx playwright test`.

## 3. Quy trình thực hiện
1. Viết test case mô phỏng lỗi (Red).
2. Viết code xử lý lỗi (Green).
3. Refactor và đảm bảo coverage không giảm.

## 4. Coverage Requirements
- **Business Rules**: 90%+
- **Use Cases**: 80%+
- **Repositories**: 70%+
