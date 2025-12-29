import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(__dirname, '../dist');

test('Multi-tab extraction should work even with internal pages', async () => {
    const context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
        ],
    });

    const [extensionPage] = context.backgroundPages().length > 0
        ? context.backgroundPages()
        : [await context.newPage()]; // Fallback for MV3 if background page not immediately available

    // Open multiple tabs
    const page1 = await context.newPage();
    await page1.goto('https://www.google.com');

    const page2 = await context.newPage();
    await page2.goto('https://www.wikipedia.org');

    const page3 = await context.newPage();
    // Internal page that executeScript normally fails on
    await page3.goto('chrome://version/').catch(() => { });

    // Discover the extension ID
    let extensionId: string | undefined;

    // Try multiple ways to find the extension ID
    const [worker] = context.serviceWorkers();
    if (worker) {
        extensionId = worker.url().split('/')[2];
    } else {
        const [background] = context.backgroundPages();
        if (background) {
            extensionId = background.url().split('/')[2];
        }
    }

    if (!extensionId) {
        // Wait a bit more for the worker if not immediately available
        await new Promise(r => setTimeout(r, 2000));
        const [retryWorker] = context.serviceWorkers();
        if (retryWorker) extensionId = retryWorker.url().split('/')[2];
    }

    expect(extensionId).toBeDefined();

    // Open the extension popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // Select "Open Tabs" scope
    await popupPage.selectOption('#scope-select', 'tabs');

    // Wait for tab list to load
    await popupPage.waitForSelector('.tab-checkbox');

    // Trigger extraction
    await popupPage.click('#extract-btn');

    // Check for toast message
    const toast = popupPage.locator('#toast');
    await expect(toast).toHaveClass(/show/);

    // Check storage (in-page evaluation)
    const savedLinks = await popupPage.evaluate(async () => {
        return new Promise((resolve) => {
            chrome.storage.local.get('savedLinks', (data) => {
                resolve(data.savedLinks || []);
            });
        });
    }) as any[];

    console.log('Extracted Links:', savedLinks.length);
    // Should have at least 2 links (Google and Wikipedia). chrome://version should be skipped or handled.
    expect(savedLinks.length).toBeGreaterThanOrEqual(2);

    await context.close();
});
