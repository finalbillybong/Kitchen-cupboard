import { expect, test } from '@playwright/test';

test('one user creates a meal and another adds a selected subset', async ({ page, request, browserName }) => {
  test.skip(browserName !== 'chromium', 'Cross-user acceptance is exercised once to stay under registration rate limits.');
  const suffix = `library-${Date.now()}`;
  const password = 'correct-horse-battery-staple';

  const creatorResponse = await request.post('/api/auth/register', {
    data: { username: `${suffix}-creator`, email: `${suffix}-creator@example.test`, password },
  });
  expect(creatorResponse.ok()).toBeTruthy();
  const creatorToken = (await creatorResponse.json()).access_token;
  const mealResponse = await request.post('/api/meals', {
    headers: { Authorization: `Bearer ${creatorToken}` },
    data: {
      name: `Shared supper ${suffix}`,
      base_servings: 2,
      ingredients: [
        { name: `Rice ${suffix}`, quantity: 200, unit: 'g' },
        { name: `Beans ${suffix}`, quantity: 1, unit: 'tin' },
      ],
    },
  });
  expect(mealResponse.ok()).toBeTruthy();

  const shopperResponse = await request.post('/api/auth/register', {
    data: { username: `${suffix}-shopper`, email: `${suffix}-shopper@example.test`, password },
  });
  expect(shopperResponse.ok()).toBeTruthy();
  const shopperToken = (await shopperResponse.json()).access_token;
  const listResponse = await request.post('/api/lists', {
    headers: { Authorization: `Bearer ${shopperToken}` },
    data: { name: `Subset destination ${suffix}` },
  });
  const list = await listResponse.json();

  await page.addInitScript((accessToken) => localStorage.setItem('token', accessToken), shopperToken);
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await page.getByPlaceholder('Search meals').fill(suffix);
  const mealCard = page.locator('article', { hasText: `Shared supper ${suffix}` });
  await expect(mealCard).toBeVisible();
  await mealCard.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Preview checklist' }).click();
  await expect(page.getByText(`Rice ${suffix}`, { exact: false })).toBeVisible();
  const riceRow = page.locator('label', { hasText: `Rice ${suffix}` });
  await riceRow.locator('input[type="checkbox"]').uncheck();
  await page.getByRole('button', { name: 'Add 1 selected' }).click();
  await expect(page).toHaveURL(`/list/${list.id}`);
  await expect(page.locator('[data-item-id]', { hasText: `Beans ${suffix}` })).toBeVisible();
  await expect(page.getByText(`Rice ${suffix}`, { exact: true })).toHaveCount(0);
});
