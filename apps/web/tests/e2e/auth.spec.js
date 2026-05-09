import { test, expect } from '@playwright/test';

test.describe('Authentication and Core Flow', () => {
  test('should login successfully as Admin', async ({ page }) => {
    await page.goto('/login');
    
    // Fill login form
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('text=Chào mừng, Admin')).toBeVisible();
  });

  test('should create a requisition (Smoke Test)', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[name="username"]', 'user1');
    await page.fill('input[name="password"]', 'user123');
    await page.click('button[type="submit"]');

    // 2. Navigate to Procurement
    await page.click('nav >> text=Mua sắm & Cấp phát');
    await page.click('button:has-text("Tạo yêu cầu")');

    // 3. Fill Requisition Modal
    await page.selectOption('select[name="warehouseId"]', { index: 1 });
    await page.fill('textarea[name="note"]', 'Test Requisition from Playwright E2E');
    
    // Add item
    await page.click('button:has-text("Thêm sản phẩm")');
    await page.selectOption('select[name="productId"]', { index: 1 });
    await page.fill('input[name="quantityRequested"]', '5');
    
    // 4. Submit
    await page.click('button:has-text("Gửi yêu cầu")');

    // 5. Success Check
    await expect(page.locator('.alert-success')).toBeVisible();
    await expect(page.locator('text=Tạo phiếu yêu cầu thành công')).toBeVisible();
  });
});
