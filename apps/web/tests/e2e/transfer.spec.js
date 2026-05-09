import { test, expect } from '@playwright/test';

test.describe('Stock Transfer Flows', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
  });

  test('Internal Transfer (Create -> Dispatch -> Complete)', async ({ page }) => {
    await page.click('nav >> text=Kiểm kê & Điều chỉnh');
    await page.click('a:has-text("Điều chuyển kho")');
    await page.click('button:has-text("Tạo phiếu điều chuyển")');

    await page.selectOption('select[name="fromWarehouseId"]', { index: 1 });
    await page.selectOption('select[name="toWarehouseId"]', { index: 2 });
    await page.fill('input[name="toLocation"]', 'Khu vực B');

    // Add item
    await page.click('button:has-text("Thêm sản phẩm")');
    await page.selectOption('select[name="productId"]', { index: 1 });
    await page.fill('input[name="quantity"]', '5');

    await page.click('button:has-text("Lưu nháp")');
    await expect(page.locator('.alert-success')).toBeVisible();

    // Submit -> Approve
    await page.click('table tbody tr:first-child button:has-text("Gửi duyệt")');
    await page.click('table tbody tr:first-child button:has-text("Duyệt")');

    // Phase 1: Dispatch
    await page.click('table tbody tr:first-child button:has-text("Xuất kho")');
    await expect(page.locator('text=Đang vận chuyển')).toBeVisible();

    // Phase 2: Complete
    await page.click('table tbody tr:first-child button:has-text("Nhập kho")');
    await expect(page.locator('text=Hoàn tất')).toBeVisible();
  });

});
