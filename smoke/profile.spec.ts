import { expect, test } from '@playwright/test';
import { gameReady } from './game-navigation';

async function startProfile(page: import('@playwright/test').Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

test('profile picture, biography and standing survive a real save and resume', async ({ page }) => {
  await startProfile(page, 'Profile Player');
  const profile = page.getByRole('region', { name: 'Profile', exact: true });
  const footer = page.getByRole('contentinfo');
  await expect(profile.getByRole('region', { name: 'Political standing' })).toContainText('25 / 200');
  await expect(profile).toContainText('Infamy');
  await expect(profile.getByRole('region', { name: 'Finances' })).toContainText('Donor network');
  await profile.getByRole('button', { name: 'Edit biography' }).click();
  await profile.getByRole('textbox', { name: 'Biography', exact: true }).fill('Representing my community.');
  await profile.getByRole('button', { name: 'Save biography' }).click();
  await expect(profile.getByText('Representing my community.', { exact: true })).toBeVisible();
  const portrait = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 384;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#dc2626'; context.fillRect(0, 0, 512, 384);
    return canvas.toDataURL('image/png');
  });
  const chooserPromise = page.waitForEvent('filechooser');
  await profile.getByRole('button', { name: 'Upload picture' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(portrait.split(',')[1], 'base64'),
  });
  const picture = page.getByRole('img', { name: 'Profile Player profile picture' });
  await expect(picture).toBeVisible();
  await expect.poll(() => picture.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(256);
  await expect(footer).toContainText('Turn 0 ·');
  await expect(profile.getByRole('region', { name: 'Political standing' })).toContainText('25 / 200');
  const savedPicture = await picture.getAttribute('src');
  await page.reload();
  await page.getByRole('button', { name: 'Continue Profile Player' }).click();
  await gameReady(page);
  await expect(profile.getByRole('heading', { name: 'Profile Player', exact: true })).toBeVisible();
  await expect(profile.getByText('Representing my community.', { exact: true })).toBeVisible();
  await expect(picture).toHaveAttribute('src', savedPicture!);
  await expect(profile.getByRole('region', { name: 'Political standing' })).toContainText('25 / 200');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/reviews/profile-port/profile-saved-390.png', fullPage: true });
  await profile.getByRole('button', { name: 'Remove picture' }).click();
  await expect(picture).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Profile Player' }).click();
  await gameReady(page);
  await expect(profile.getByRole('heading', { name: 'Profile Player', exact: true })).toBeVisible();
  await expect(profile.getByRole('button', { name: 'Upload picture' })).toBeVisible();
  await expect(profile.getByText('Representing my community.', { exact: true })).toBeVisible();
});

test('bad images are rejected and a failed biography save retains the draft for retry', async ({ page }) => {
  await startProfile(page, 'Profile Recovery');
  const profile = page.getByRole('region', { name: 'Profile', exact: true });
  await profile.getByLabel('Choose profile picture').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(profile.getByRole('alert')).toContainText('could not be read');
  await expect(profile.getByRole('img')).toHaveCount(0);
  await profile.getByRole('button', { name: 'Edit biography' }).click();
  const bio = profile.getByRole('textbox', { name: 'Biography', exact: true });
  await bio.fill('Keep this unsaved draft.');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    let failNextWrite = true;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const transaction = original.apply(this, args);
      if (args[1] === 'readwrite' && failNextWrite) {
        failNextWrite = false;
        queueMicrotask(() => transaction.abort());
      }
      return transaction;
    };
  });
  await profile.getByRole('button', { name: 'Save biography' }).click();
  await expect(profile.getByRole('alert').filter({ hasText: 'Your draft is kept' })).toBeVisible();
  await expect(bio).toHaveValue('Keep this unsaved draft.');
  await profile.getByRole('button', { name: 'Save biography' }).click();
  await expect(bio).toHaveCount(0);
  await expect(profile.getByText('Keep this unsaved draft.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Profile Recovery' }).click();
  await gameReady(page);
  await expect(profile.getByText('Keep this unsaved draft.', { exact: true })).toBeVisible();
});

test('campaign song validation, preferences, offline fallback and save lifecycle', async ({ page }) => {
  await startProfile(page, 'Song Player');
  const profile = page.getByRole('region', { name: 'Profile', exact: true });
  const song = profile.getByRole('region', { name: 'Campaign song' });
  const input = song.getByRole('textbox', { name: 'YouTube URL or video ID' });

  await input.fill('not a youtube video');
  await song.getByRole('button', { name: 'Save campaign song' }).click();
  await expect(song.getByRole('alert')).toContainText('valid YouTube');
  await input.fill('https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ');
  await song.getByRole('checkbox', { name: 'Play automatically on my profile' }).check();
  await song.getByRole('button', { name: 'Save campaign song' }).click();
  const player = song.getByTitle("Song Player's campaign song");
  await expect(player).toHaveAttribute('src', /dQw4w9WgXcQ.*autoplay=1.*playsinline=1/);

  await page.context().setOffline(true);
  await expect(song.getByRole('status')).toContainText('available when this device is online');
  await expect(player).toHaveCount(0);
  await page.context().setOffline(false);
  await expect(player).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Continue Song Player' }).click();
  await gameReady(page);
  await expect(player).toHaveAttribute('src', /dQw4w9WgXcQ.*autoplay=1/);
  await song.getByRole('button', { name: 'Clear campaign song' }).click();
  await expect(player).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Song Player' }).click();
  await gameReady(page);
  await expect(song).toContainText('No campaign song configured');
});
