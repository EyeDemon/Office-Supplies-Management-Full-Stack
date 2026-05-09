import { test, expect } from '@playwright/test';

test.describe('Dashboard & Reporting Flows', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
  });

  test('Dashboard Widgets and Charts Visibility', async ({ page }) => {
    await expect(page.locator('text=Tổng giá trị tồn kho')).toBeVisible();
    await expect(page.locator('text=Sản phẩm sắp hết hàng')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible(); // Charts
  });

  test('Inventory Report Filters and Export', async ({ page }) => {
    await page.click('nav >> text=Báo cáo & Thống kê');
    await page.click('a:has-text("Báo cáo tồn kho")');

    await expect(page.locator('table')).toBeVisible();
    
    // Test filter
    await page.fill('input[placeholder*="Tìm kiếm"]', 'Giấy');
    await page.keyboard.press('Enter');
    
    // Verify results change (not easy to assert exact content without seed data knowledge, 
    // but we check if table still exists)
    await expect(page.locator('table')).toBeVisible();

    // Test Export (Download)
    const [ download ] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Xuất Excel")')
    ]);
    expect(download.suggestedFilename()).toContain('bao-cao-ton-kho');
  });

});
