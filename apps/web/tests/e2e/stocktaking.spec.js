import { test, expect } from '@playwright/test';

test.describe('Stocktaking Flows', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
  });

  test('Stocktaking Session (Create -> Input -> Complete)', async ({ page }) => {
    await page.click('nav >> text=Kiểm kê & Điều chỉnh');
    await page.click('a:has-text("Kiểm kê kho")');
    await page.click('button:has-text("Tạo phiên kiểm kê")');

    await page.selectOption('select[name="warehouseId"]', { index: 1 });
    await page.fill('textarea[name="note"]', 'E2E Test Stocktaking');
    await page.click('button:has-text("Bắt đầu kiểm kê")');

    await expect(page.locator('.alert-success')).toBeVisible();
    await expect(page.locator('text=Đang thực hiện')).toBeVisible();

    // Input items
    await page.click('button:has-text("Nhập số liệu")');

    // Assume there is at least one item to input
    await page.fill('table tbody tr:first-child input[name="actualQuantity"]', '100');
    await page.click('button:has-text("Lưu kết quả")');
    await expect(page.locator('.alert-success')).toBeVisible();

    // Complete
    await page.click('button:has-text("Hoàn tất kiểm kê")');
    await page.click('button:has-text("Xác nhận chốt số liệu")'); // If there is a confirmation modal

    await expect(page.locator('text=Hoàn tất')).toBeVisible();
  });

});
