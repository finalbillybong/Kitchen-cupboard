import { expect, test } from '@playwright/test';

test('one user creates a meal and another adds a selected subset', async ({
  page,
  request,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Cross-user acceptance is exercised once to stay under registration rate limits.',
  );
  const suffix = `library-${Date.now()}`;
  const password = 'correct-horse-battery-staple';

  const creatorResponse = await request.post('/api/auth/register', {
    data: {
      username: `${suffix}-creator`,
      email: `${suffix}-creator@example.test`,
      password,
    },
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
    data: {
      username: `${suffix}-shopper`,
      email: `${suffix}-shopper@example.test`,
      password,
    },
  });
  expect(shopperResponse.ok()).toBeTruthy();
  const shopperToken = (await shopperResponse.json()).access_token;
  const listResponse = await request.post('/api/lists', {
    headers: { Authorization: `Bearer ${shopperToken}` },
    data: { name: `Subset destination ${suffix}` },
  });
  const list = await listResponse.json();

  await page.addInitScript(
    (accessToken) => localStorage.setItem('token', accessToken),
    shopperToken,
  );
  await page.goto('/library');
  await expect(
    page.getByRole('heading', { name: 'Library', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Search recipes').fill(suffix);
  await page
    .getByRole('link', { name: new RegExp(`Shared supper ${suffix}`) })
    .click();
  await page
    .getByRole('button', { name: 'Add to shopping list', exact: true })
    .click();
  await page.getByRole('button', { name: 'Preview checklist' }).click();
  await expect(
    page.getByRole('dialog').getByText(`Rice ${suffix}`, { exact: false }),
  ).toBeVisible();
  const riceRow = page.locator('label', { hasText: `Rice ${suffix}` });
  await riceRow.locator('input[type="checkbox"]').uncheck();
  await page.getByRole('button', { name: 'Add 1 selected' }).click();
  await expect(page).toHaveURL(`/list/${list.id}`);
  await expect(
    page.locator('[data-item-id]', { hasText: `Beans ${suffix}` }),
  ).toBeVisible();
  await expect(page.getByText(`Rice ${suffix}`, { exact: true })).toHaveCount(
    0,
  );
});

test('mobile Library unifies website import, usual ingredients and Basics shopping', async ({
  page,
  request,
  browserName,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const name = `mobile-${browserName}-${Date.now()}`;
  const auth = await request.post('/api/auth/register', {
    data: {
      username: name,
      email: `${name}@example.test`,
      password: 'correct-horse-battery-staple',
    },
  });
  expect(auth.ok()).toBeTruthy();
  const { access_token: token } = await auth.json();
  const headers = { Authorization: `Bearer ${token}` };
  const list = await (
    await request.post('/api/lists', {
      headers,
      data: { name: `Shopping ${name}` },
    })
  ).json();
  await page.addInitScript(
    (token) => localStorage.setItem('token', token),
    token,
  );
  await page.route('**/api/recipes/import/url', (route) =>
    route.fulfill({
      json: {
        name: `Website soup ${name}`,
        description: '',
        base_servings: 2,
        source_url: 'https://example.test/soup',
        ingredients: [
          {
            name: `Vegetables ${name}`,
            quantity: 200,
            unit: 'g',
            notes: 'diced',
            scales_with_servings: true,
          },
        ],
        steps: ['Simmer until tender.'],
        tags: ['vegetarian'],
        prep_minutes: 5,
        cook_minutes: 20,
      },
    }),
  );
  await page.goto('/recipes');
  await expect(page).toHaveURL('/library');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveText([
    'Shopping',
    'Planner',
    'Library',
  ]);
  await expect(nav.getByRole('link', { name: 'Library' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: 'Add recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Import from a website' }).click();
  await page
    .getByLabel('Recipe URL', { exact: true })
    .fill('https://example.test/soup');
  await page.getByRole('button', { name: 'Review URL import' }).click();
  await expect(
    page.getByRole('heading', { name: 'Review website import' }),
  ).toBeVisible();
  const before = await (
    await request.get(`/api/meals?q=${encodeURIComponent(name)}`, { headers })
  ).json();
  expect(before).toHaveLength(0);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(
    page.getByRole('heading', { name: `Website soup ${name}` }),
  ).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Library' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const recipe = (
    await (
      await request.get(`/api/meals?q=${encodeURIComponent(name)}`, { headers })
    ).json()
  )[0];
  await page.goto('/pantry');
  await expect(page).toHaveURL('/library?tab=ingredients&usually=true');
  await page.getByLabel('Show only ingredients I usually have').click();
  await expect(
    page.getByLabel('Show only ingredients I usually have'),
  ).not.toBeChecked();
  await page.getByPlaceholder('Search ingredients').fill(name);
  const ingredient = page.locator('article', { hasText: `Vegetables ${name}` });
  await ingredient.getByLabel('Usually have', { exact: true }).click();
  await expect(
    ingredient.getByLabel('Usually have', { exact: true }),
  ).toBeChecked();
  await page.reload();
  await page.getByPlaceholder('Search ingredients').fill(name);
  await expect(
    ingredient.getByLabel('Usually have', { exact: true }),
  ).toBeChecked();
  const basics = await (await request.get('/api/basics', { headers })).json();
  const added = await request.post('/api/basics/items', {
    headers,
    data: {
      expected_version: basics.version,
      ingredient_id: recipe.ingredients[0].ingredient_id,
      quantity: 2,
      unit: 'g',
    },
  });
  expect(added.ok()).toBeTruthy();
  await page.goto(`/list/${list.id}`);
  await page
    .getByRole('button', { name: 'Add from Basics', exact: true })
    .click();
  await page.getByRole('button', { name: 'Preview checklist' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.locator('label', { hasText: `Vegetables ${name}` }),
  ).toBeVisible();
  for (const checkbox of await dialog.getByRole('checkbox').all())
    await checkbox.uncheck();
  await dialog
    .locator('label', { hasText: `Vegetables ${name}` })
    .getByRole('checkbox')
    .check();
  await dialog.getByRole('button', { name: 'Add 1 selected' }).click();
  const row = page.locator('[data-item-id]', { hasText: `Vegetables ${name}` });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: /Already have/ })).toHaveCount(
    0,
  );
  await row
    .getByRole('button', { name: `Bought Vegetables ${name}`, exact: true })
    .click();
  await expect(
    row.getByRole('button', {
      name: `Restore Vegetables ${name}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Add from recipes' }).click();
  await page.getByLabel('Search recipes').fill(name);
  await expect(
    page.getByRole('link', { name: new RegExp(`Website soup ${name}`) }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath('mobile-library.png'),
    fullPage: true,
  });
});
