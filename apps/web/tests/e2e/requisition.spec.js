import { test, expect } from '@playwright/test';

test.describe('Requisition Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login as standard user
    await page.goto('/login');
    await page.fill('input[name="username"]', 'user');
    await page.fill('input[name="password"]', 'user123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should create a new requisition', async ({ page }) => {
    await page.goto('/requisitions');
    await page.click('button:has-text("Tạo yêu cầu mới")');

    // Wait for modal
    await expect(page.locator('.modal-title')).toHaveText('Tạo phiếu yêu cầu cấp phát');

    // Fill form (Assuming selectors based on RequisitionCreateModal)
    // Select first product from dropdown/search
    await page.click('.product-select');
    await page.click('.product-option:first-child');

    await page.fill('input[name="quantity"]', '10');
    await page.fill('textarea[name="note"]', 'E2E Test Requisition');

    await page.click('button:has-text("Gửi yêu cầu")');

    // Success toast/alert
    await expect(page.locator('.alert-success')).toBeVisible();
    await expect(page.locator('.alert-success')).toContainText('Tạo phiếu thành công');
  });

  test('should view requisition details', async ({ page }) => {
    await page.goto('/requisitions');

    // Wait for table to load
    await expect(page.locator('table tbody tr')).toBeVisible();

    // Click "XEM CHI TIẾT" on the first row
    await page.click('tr:first-child button:has-text("XEM CHI TIẾT")');

    // Modal should open
    await expect(page.locator('.modal-title')).toContainText('Chi tiết phiếu yêu cầu');
    await page.click('button:has-text("Đóng")');
  });

  test('should filter by status', async ({ page }) => {
    await page.goto('/requisitions');

    // Select "Chờ duyệt" (PENDING)
    await page.selectOption('select', 'PENDING');

    // Verify all rows have "CHỜ DUYỆT" badge
    const badges = page.locator('.badge-warning');
    const count = await badges.count();
    for (let i = 0; i < count; i++) {
      await expect(badges.nth(i)).toHaveText('CHỜ DUYỆT');
    }
  });
});
