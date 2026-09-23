const { chromium } = require('playwright');
const fs = require('fs');

const targets = {
  grok: 'https://rallies.ai/arena/grok',
  gpt: 'https://rallies.ai/arena/gpt'
};

function section(lines, startPatterns, stopPatterns = [], max = 200) {
  const start = lines.findIndex(x => startPatterns.some(p => p.test(x)));
  if (start < 0) return '';
  const out = [];
  for (let i = start; i < lines.length && out.length < max; i++) {
    if (i > start && stopPatterns.some(p => p.test(lines[i]))) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function findAllocation(lines) {
  // Rallies may render the allocation widget without a literal "Allocation" heading.
  // Capture the largest useful block containing ticker symbols and percentages.
  const pct = lines.filter(x => /^\d+(?:\.\d+)?%$/.test(x));
  if (pct.length) {
    const indices = lines.map((x, i) => /^\d+(?:\.\d+)?%$/.test(x) ? i : -1).filter(i => i >= 0);
    const i = indices[0];
    return lines.slice(Math.max(0, i - 30), Math.min(lines.length, i + 80)).join('\n');
  }
  return section(lines, [/^Portfolio Allocation$/i, /^Allocation$/i, /^Holdings$/i], [], 120);
}

async function scrape(fund, url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(10000);

    // Try to expose chart/tooltip text that may not appear in body.innerText.
    await page.mouse.move(800, 500);
    await page.waitForTimeout(1000);

    const body = await page.locator('body').innerText();
    const lines = body.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

    const activityLog = section(lines, [/^Activity Log$/i], [/^Closed Trades$/i], 180);
    const allocation = findAllocation(lines);
    const portfolio = section(lines, [/^Portfolio Value$/i], [/^Arena$/i], 120);

    // Also save visible text around every percentage for debugging future site changes.
    const percentage_context = [];
    lines.forEach((x, i) => {
      if (/^\d+(?:\.\d+)?%$/.test(x)) {
        percentage_context.push(lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)));
      }
    });

    return {
      fund, url, fetched_at: new Date().toISOString(),
      activity_log_found: !!activityLog,
      activity_log: activityLog,
      allocation_found: !!allocation,
      allocation,
      percentage_context,
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
      console.log(`${fund}: Activity Log=${result.activity_log_found}, Allocation=${result.allocation_found}, Portfolio=${result.portfolio_found}, pct=${result.percentage_context.length}`);
    } catch (e) {
      fs.writeFileSync(`data/${fund}.json`, JSON.stringify({fund,url,fetched_at:new Date().toISOString(),error:String(e)},null,2));
      console.error(`${fund}: ${e}`);
    }
  }
})();