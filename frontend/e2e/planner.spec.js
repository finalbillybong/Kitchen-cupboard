import { expect, test } from '@playwright/test';

test('photo draft without a title opens for review and requires a name to save', async ({ page, request, browserName }) => {
  const name = `photo-${browserName}-${Date.now()}`;
  const registered = await request.post('/api/auth/register', { data: {
    username: name, email: `${name}@example.test`, password: 'correct-horse-battery-staple',
  } });
  expect(registered.ok()).toBeTruthy();
  const { access_token: token } = await registered.json();
  await page.route('**/api/recipes/import/status', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/api/recipes/import/photos', route => route.fulfill({ json: {
    name: '', description: '', base_servings: 2, source_url: null,
    prep_minutes: 0, cook_minutes: 0, tags: [], steps: ['Stir gently.'],
    ingredients: [{ name: `Herbs ${name}`, quantity: null, unit: '', notes: 'to taste', scales_with_servings: true }],
    image_ids: [], review_required: true,
  } }));
  await page.goto('/login');
  await page.evaluate(token => localStorage.setItem('token', token), token);
  await page.goto('/recipes');
  await page.getByText('Import a recipe', { exact: true }).click();
  await page.getByLabel('Recipe photos').setInputFiles({
    name: 'recipe.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Review photo import', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review photo import' })).toBeVisible();
  await expect(page.getByText('The recipe title could not be read. Enter a name below before saving.')).toBeVisible();
  await expect(page.getByLabel('Method', { exact: true })).toHaveValue('Stir gently.');
  await page.getByRole('button', { name: 'Save meal', exact: true }).click();
  expect(await page.getByLabel('Meal name', { exact: true }).evaluate(input => input.validity.valueMissing)).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Review photo import' })).toBeVisible();
  await page.getByLabel('Meal name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Stir gently.', { exact: true })).toBeVisible();
});

test('recipe scaling, reviewed scheduling, groceries and offline viewing', async ({
  page,
  request,
  context,
  browserName,
}) => {
  const suffix = `planner-${browserName}-${Date.now()}`;
  const registered = await request.post('/api/auth/register', {
    data: {
      username: suffix,
      email: `${suffix}@example.test`,
      password: 'correct-horse-battery-staple',
    },
  });
  expect(registered.ok()).toBeTruthy();
  const { access_token: token } = await registered.json();
  const headers = { Authorization: `Bearer ${token}` };
  const mealResponse = await request.post('/api/meals', {
    headers,
    data: {
      name: `Soup ${suffix}`,
      base_servings: 2,
      steps: ['Chop the carrots.', 'Simmer gently.'],
      tags: ['vegetarian'],
      ingredients: [
        {
          name: `Carrots ${suffix}`,
          quantity: 500,
          unit: 'g',
          notes: 'finely diced',
        },
        { name: `Salt ${suffix}`, quantity: null, notes: 'to taste' },
      ],
    },
  });
  expect(mealResponse.ok()).toBeTruthy();
  const meal = await mealResponse.json();
  const list = await (
    await request.post('/api/lists', {
      headers,
      data: { name: `Groceries ${suffix}` },
    })
  ).json();
  await page.goto('/login');
  await page.evaluate((token) => localStorage.setItem('token', token), token);
  await page.goto(`/recipes/${meal.id}`);
  await expect(page.getByRole('heading', { name: meal.name })).toBeVisible();
  await page.getByLabel('Recipe servings').fill('4');
  await expect(
    page.getByText(`1000 g Carrots ${suffix}`, { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Simmer gently.')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.pdf');
  await page.getByRole('link', { name: 'Schedule', exact: true }).click();
  // The planner is shared with previous tests: use a free day, or edit the first occupied slot.
  await expect(
    page.getByRole('heading', { name: 'Meal planner', exact: true }),
  ).toBeVisible();
  const add = page.getByRole('button', { name: '+ Plan dinner' }).first();
  if (await add.count()) await add.click();
  else await page.locator('section button.font-medium').first().click();
  await page.getByLabel('Planned recipe').selectOption(meal.id);
  await page.getByLabel('Planned servings').fill('4');
  await page
    .getByRole('button', { name: 'Review change', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Review meal plan' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Apply reviewed changes' }).click();
  await expect(
    page.getByRole('heading', { name: 'Review meal plan' }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Review groceries', exact: true })
    .click();
  await page.getByLabel('Destination shopping list').selectOption(list.id);
  await page
    .getByRole('button', { name: 'Preview groceries', exact: true })
    .click();
  await expect(
    page.getByText(`add: Carrots ${suffix}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Apply reviewed changes' }).click();
  await expect(
    page.getByRole('heading', { name: 'Review groceries', exact: true }),
  ).toHaveCount(0);
  const items = await (
    await request.get(`/api/lists/${list.id}/items`, { headers })
  ).json();
  expect(items.find((i) => i.name === `Carrots ${suffix}`).quantity).toBe(1000);
  expect(items.find((i) => i.name === `Salt ${suffix}`).quantity).toBeNull();
  await page.goto(`/list/${list.id}`);
  await page
    .getByRole('button', { name: `Already have Salt ${suffix}`, exact: true })
    .click();
  await expect(
    page
      .locator('[data-item-id]', { hasText: `Salt ${suffix}` })
      .locator('span')
      .filter({ hasText: /^Already have$/ }),
  ).toBeVisible();
  await page.goto(`/recipes/${meal.id}`);
  await expect(page.getByRole('heading', { name: meal.name })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: meal.name })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit recipe', exact: true }),
  ).toBeDisabled();
  await page.getByRole('link', { name: 'Planner', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Meal planner', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: meal.name, exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});

test('manual recipe editor saves methods and unknown quantities', async ({
  page,
  request,
  browserName,
}) => {
  const name = `manual-${browserName}-${Date.now()}`;
  const auth = await (
    await request.post('/api/auth/register', {
      data: {
        username: name,
        email: `${name}@example.test`,
        password: 'correct-horse-battery-staple',
      },
    })
  ).json();
  await page.goto('/login');
  await page.evaluate(
    (token) => localStorage.setItem('token', token),
    auth.access_token,
  );
  await page.goto('/recipes');
  await page.getByRole('button', { name: 'New recipe', exact: true }).click();
  await page.getByLabel('Meal name', { exact: true }).fill(name);
  await page
    .getByLabel('Method', { exact: true })
    .fill('Chop vegetables.\nCook until tender.');
  await page.getByLabel('Recipe tags', { exact: true }).fill('vegetarian');
  await page
    .getByLabel('New ingredient name', { exact: true })
    .fill(`Herbs ${name}`);
  await page.getByLabel('Quantity', { exact: true }).fill('');
  await page.getByLabel('Ingredient notes', { exact: true }).fill('to taste');
  await page.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(
    page.getByText('Cook until tender.', { exact: true }),
  ).toBeVisible();
});
