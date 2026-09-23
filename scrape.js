const { chromium } = require('playwright');
const fs = require('fs');

const targets = {
  grok: 'https://rallies.ai/arena/grok',
  gpt: 'https://rallies.ai/arena/gpt'
};

async function scrape(fund, url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);

    const body = await page.locator('body').innerText();
    const lines = body.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const i = lines.findIndex(x => /^Activity Log$/i.test(x));

    return {
      fund,
      url,
      fetched_at: new Date().toISOString(),
      activity_log_found: i >= 0,
      activity_log: i >= 0 ? lines.slice(i, i + 160).join('\n') : ''
    };
  } finally {
    await browser.close();
  }
}

(async () => {
  fs.mkdirSync('data', { recursive: true });

  for (const [fund, url] of Object.entries(targets)) {
    try {
      const result = await scrape(fund, url);
      fs.writeFileSync(`data/${fund}.json`, JSON.stringify(result, null, 2));
      console.log(`${fund}: Activity Log found = ${result.activity_log_found}`);
    } catch (e) {
      fs.writeFileSync(
        `data/${fund}.json`,
        JSON.stringify({
          fund,
          url,
          fetched_at: new Date().toISOString(),
          activity_log_found: false,
          error: String(e)
        }, null, 2)
      );
      console.error(`${fund}: ${e}`);
    }
  }
})();
