const { chromium } = require('playwright');
const fs = require('fs');

const targets = {
  grok: 'https://rallies.ai/arena/grok',
  gpt: 'https://rallies.ai/arena/gpt'
};

function extractSection(lines, patterns, maxLines = 120) {
  const i = lines.findIndex(x => patterns.some(p => p.test(x)));
  return i >= 0 ? lines.slice(i, i + maxLines).join('\n') : '';
}

async function scrape(fund, url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);

    const body = await page.locator('body').innerText();
    const lines = body.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

    const activityLog = extractSection(lines, [/^Activity Log$/i], 180);
    const allocation = extractSection(
      lines,
      [/^Portfolio Allocation$/i, /^Allocation$/i, /^Holdings$/i],
      100
    );
    const portfolio = extractSection(
      lines,
      [/^Portfolio Value$/i, /^Total Return$/i],
      100
    );

    return {
      fund,
      url,
      fetched_at: new Date().toISOString(),
      activity_log_found: !!activityLog,
      activity_log: activityLog,
      allocation_found: !!allocation,
      allocation,
      portfolio_found: !!portfolio,
      portfolio
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
      console.log(`${fund}: Activity Log=${result.activity_log_found}, Allocation=${result.allocation_found}, Portfolio=${result.portfolio_found}`);
    } catch (e) {
      fs.writeFileSync(
        `data/${fund}.json`,
        JSON.stringify({
          fund, url, fetched_at: new Date().toISOString(),
          activity_log_found: false, allocation_found: false,
          portfolio_found: false, error: String(e)
        }, null, 2)
      );
      console.error(`${fund}: ${e}`);
    }
  }
})();