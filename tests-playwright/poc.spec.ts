import { test, expect } from '@playwright/test';

test('basic app load and navigation check', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/NanoNyms/);
  
  await expect(page.getByText('Loading NanoNyms...')).not.toBeVisible({ timeout: 15000 });
  
  await expect(page.locator('app-welcome a[href="/configure-wallet"]')).toBeVisible();
});
