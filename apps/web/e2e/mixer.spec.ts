import { expect, test } from '@playwright/test';
import { defaultHandlers, mockTrpc } from './trpc-mock';

test.describe('mixing your score', () => {
  test('toggling and weighting sources recomputes the score without a network request', async ({
    page,
  }) => {
    const calls = await mockTrpc(page, defaultHandlers);
    await page.goto('/movie/1001');

    const score = page.getByTestId('your-score');
    await expect(page.getByTestId('movie-title')).toHaveText('Harbor Lights');
    await expect(score).toHaveText('78');

    const requestsBefore = calls.length;
    const rottenTomatoes = page.locator('[data-testid="channel-rotten_tomatoes"]:visible');
    await rottenTomatoes.getByRole('switch').click();
    await expect(rottenTomatoes.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    // (72 + 81 + 68 + 75) / 4 = 74
    await expect(score).toHaveText('74');
    await expect(page.getByTestId('your-score-caption')).toHaveText('From 4 sources');

    // Raise IMDb from ×1 to ×2 with the keyboard: (72 + 81×2 + 68 + 75) / 5 = 75.4
    const imdbWeight = page.locator('[data-testid="channel-imdb"]:visible').getByRole('slider');
    await imdbWeight.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(imdbWeight).toHaveAttribute('aria-valuetext', '×2');
    await expect(score).toHaveText('75');

    expect(calls.slice(requestsBefore)).toEqual([]);
  });

  test('a guest mix survives a reload', async ({ page }) => {
    await mockTrpc(page, defaultHandlers);
    await page.goto('/movie/1001');
    await page
      .locator('[data-testid="channel-rotten_tomatoes"]:visible')
      .getByRole('switch')
      .click();
    await expect(page.getByTestId('your-score')).toHaveText('74');

    await page.reload();
    await expect(page.getByTestId('your-score')).toHaveText('74');
    await expect(
      page.locator('[data-testid="channel-rotten_tomatoes"]:visible').getByRole('switch'),
    ).toHaveAttribute('aria-checked', 'false');
  });

  test('the mixer drawer changes the score on the page behind it', async ({ page }) => {
    await mockTrpc(page, defaultHandlers);
    await page.goto('/movie/1001');
    await expect(page.getByTestId('your-score')).toHaveText('78');

    await page.getByTestId('open-mixer').click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('Showing scores for')).toBeVisible();
    await drawer.locator('[data-testid="channel-metacritic"]').getByRole('switch').click();
    await page.keyboard.press('Escape');

    // (72 + 81 + 94 + 75) / 4 = 80.5 → 81
    await expect(page.getByTestId('your-score')).toHaveText('81');
  });
});
