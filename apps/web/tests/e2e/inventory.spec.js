import { test, expect } from '@playwright/test';

test.describe('Inventory Management Flows', () => {
  
  test.beforeEach(async ({ page }) => {
    // Standard Login as Admin
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('Full Import Order Flow (Create -> Approve -> Complete)', async ({ page }) => {
    // 1. Create Import Order (DRAFT)
    await page.click('nav >> text=Nhập / Xuất kho');
    await page.click('a:has-text("Nhập kho")');
    await page.click('button:has-text("Tạo phiếu nhập")');

    await page.selectOption('select[name="supplierId"]', { index: 1 });
    await page.selectOption('select[name="warehouseId"]', { index: 1 });
    await page.fill('textarea[name="note"]', 'E2E Test Import Order');

    // Add item
    await page.click('button:has-text("Thêm sản phẩm")');
    await page.selectOption('select[name="productId"]', { index: 1 });
    await page.fill('input[name="quantity"]', '10');
    await page.fill('input[name="unitPrice"]', '50000');

    await page.click('button:has-text("Lưu nháp")');
    await expect(page.locator('.alert-success')).toBeVisible();
    
    const orderCode = await page.locator('table tbody tr:first-child td:nth-child(1)').innerText();

    // 2. Submit for Approval
    await page.click('table tbody tr:first-child button:has-text("Gửi duyệt")');
    await expect(page.locator('text=Chờ duyệt')).toBeVisible();

    // 3. Approve
    await page.click('table tbody tr:first-child button:has-text("Duyệt")');
    await expect(page.locator('text=Đã duyệt')).toBeVisible();

    // 4. Complete (Stock increase)
    // First, check current stock if possible, or just complete and verify success message
    await page.click('table tbody tr:first-child button:has-text("Hoàn tất")');
    await expect(page.locator('text=Hoàn tất')).toBeVisible();
    await expect(page.locator(`text=Nhập kho phiếu ${orderCode} thành công`)).toBeVisible();
  });

  test('Full Export Order Flow (Create -> Approve -> Complete)', async ({ page }) => {
    await page.click('nav >> text=Nhập / Xuất kho');
    await page.click('a:has-text("Xuất kho")');
    await page.click('button:has-text("Tạo phiếu xuất")');

    await page.fill('input[name="recipientName"]', 'E2E Tester');
    await page.fill('input[name="department"]', 'Phòng Kiểm Thử');
    await page.selectOption('select[name="warehouseId"]', { index: 1 });

    // Add item
    await page.click('button:has-text("Thêm sản phẩm")');
    await page.selectOption('select[name="productId"]', { index: 1 });
    await page.fill('input[name="quantity"]', '2');

    await page.click('button:has-text("Lưu nháp")');
    await expect(page.locator('.alert-success')).toBeVisible();

    // Submit -> Approve -> Complete
    await page.click('table tbody tr:first-child button:has-text("Gửi duyệt")');
    await page.click('table tbody tr:first-child button:has-text("Duyệt")');
    await page.click('table tbody tr:first-child button:has-text("Hoàn tất")');
    
    await expect(page.locator('text=Hoàn tất')).toBeVisible();
  });

  test('Requisition Workflow (Employee -> Manager -> Warehouse)', async ({ page }) => {
    // 1. Employee creates
    // (Login as user1 omitted for brevity in this example, assuming admin can also do it or we switch sessions)
    
    // 2. Manager Approves
    await page.click('nav >> text=Mua sắm & Cấp phát');
    await page.click('a:has-text("Cấp phát")');
    
    const firstRowStatus = await page.locator('table tbody tr:first-child td:nth-child(6)').innerText();
    if (firstRowStatus.includes('Chờ duyệt')) {
      await page.click('table tbody tr:first-child button:has-text("Duyệt")');
      await expect(page.locator('text=Đã duyệt')).toBeVisible();
    }

    // 3. Warehouse Confirms
    // (In a real test, we would look for the specific requisition)
  });

});
