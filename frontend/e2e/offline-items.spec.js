import { expect, test } from '@playwright/test';

test('replays the complete offline item lifecycle after an offline reload', async ({ page, context, request, browserName }) => {
  const suffix = `${browserName}-${Date.now()}`;
  const registration = await request.post('/api/auth/register', {
    data: {
      username: `offline-${suffix}`,
      email: `offline-${suffix}@example.test`,
      password: 'correct-horse-battery-staple',
    },
  });
  expect(registration.ok()).toBeTruthy();
  const { access_token: token } = await registration.json();
  const createdList = await request.post('/api/lists', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `Offline lifecycle ${suffix}` },
  });
  expect(createdList.ok()).toBeTruthy();
  const list = await createdList.json();

  await page.addInitScript((accessToken) => localStorage.setItem('token', accessToken), token);
  await page.goto(`/list/${list.id}`);
  await expect(page.getByPlaceholder('Add an item...')).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) location.reload();
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(page.getByPlaceholder('Add an item...')).toBeVisible();

  await context.setOffline(true);
  for (const name of ['Milk', 'Bread', 'Eggs', 'Apples']) {
    await page.getByPlaceholder('Add an item...').fill(name);
    await page.getByPlaceholder('Add an item...').press('Enter');
    await expect(page.locator('[data-item-id]', { hasText: name })).toBeVisible();
  }

  await page.locator('[data-item-id]', { hasText: 'Milk' }).getByText('Milk').click();

  const bread = page.locator('[data-item-id]', { hasText: 'Bread' });
  await bread.hover();
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.up();
  await expect(page.getByText('Edit Item')).toBeVisible();
  await page.locator('input[type="text"][value="Bread"]').fill('Bread loaf');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.locator('[data-item-id]', { hasText: 'Eggs' }).getByTitle('Delete').click();
  await page.getByRole('button', { name: 'Clear all' }).click();

  await page.getByTitle('Reorder items').click();
  await page.locator('[data-item-id]', { hasText: 'Apples' }).dragTo(
    page.locator('[data-item-id]', { hasText: 'Bread loaf' }),
  );
  await page.getByTitle('Done reordering').click();

  await page.reload();
  await expect(page.locator('[data-item-id]', { hasText: 'Bread loaf' })).toBeVisible();
  await expect(page.locator('[data-item-id]', { hasText: 'Apples' })).toBeVisible();
  await expect(page.getByText('Milk', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Eggs', { exact: true })).toHaveCount(0);

  await context.setOffline(false);
  // Firefox's automation network toggle does not consistently emit the DOM
  // online event that a real network transition emits.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText(/pending change/)).toHaveCount(0, { timeout: 30000 });

  const serverItems = await page.evaluate(async (listId) => {
    const response = await fetch(`/api/lists/${listId}/items`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    return response.json();
  }, list.id);
  expect(serverItems.map((item) => item.name).sort()).toEqual(['Apples', 'Bread loaf']);
});
