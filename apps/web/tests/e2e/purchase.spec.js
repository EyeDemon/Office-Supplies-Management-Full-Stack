import { test, expect } from '@playwright/test';

test.describe('Purchase Management Flows', () => {
  
  test.beforeEach(async ({ page }) => {
    // Login as Admin
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('Full Purchase Workflow (PR -> PO -> Receive)', async ({ page }) => {
    // 1. Create Purchase Request (PR)
    await page.click('nav >> text=Mua sắm & Cấp phát');
    await page.click('a:has-text("Yêu cầu mua hàng")');
    await page.click('button:has-text("Tạo yêu cầu")');

    await page.selectOption('select[name="supplierId"]', { index: 1 });
    await page.selectOption('select[name="warehouseId"]', { index: 1 });
    await page.fill('textarea[name="note"]', 'E2E Test PR');

    // Add item
    await page.click('button:has-text("Thêm sản phẩm")');
    await page.selectOption('select[name="productId"]', { index: 1 });
    await page.fill('input[name="quantity"]', '50');
    await page.fill('input[name="unitPrice"]', '12000');

    await page.click('button:has-text("Gửi yêu cầu")');
    await expect(page.locator('.alert-success')).toBeVisible();
    await expect(page.locator('text=Chờ duyệt')).toBeVisible();

    const prCode = await page.locator('table tbody tr:first-child td:nth-child(1)').innerText();

    // 2. Approve PR (Creates PO)
    await page.click('table tbody tr:first-child button:has-text("Duyệt")');
    await expect(page.locator('text=Đã duyệt')).toBeVisible();

    // 3. Go to Purchase Orders
    await page.click('nav >> text=Mua sắm & Cấp phát');
    await page.click('a:has-text("Đơn mua hàng")');
    
    // Verify PO exists for this PR
    await expect(page.locator(`text=${prCode}`)).toBeVisible();
    const poCode = await page.locator('table tbody tr:first-child td:nth-child(1)').innerText();

    // 4. Receive PO
    await page.click('table tbody tr:first-child button:has-text("Nhận hàng")');
    
    // In the receive modal/page
    await page.fill('input[name="quantityReceived"]', '50');
    await page.click('button:has-text("Xác nhận nhập kho")');

    await expect(page.locator('.alert-success')).toBeVisible();
    await expect(page.locator('text=Hoàn tất')).toBeVisible();
  });

});
