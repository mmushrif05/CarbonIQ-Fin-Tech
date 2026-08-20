const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext()).newPage();
  const seen = [];
  p.on('response', r => { if (r.status() >= 400) seen.push(r.status() + '  ' + r.url()); });
  await p.goto('http://localhost:3013/', { waitUntil: 'networkidle' });
  // sign in properly, then visit every nav page
  await p.fill('#login-name','Mushrif'); await p.fill('#login-email','m@e.com'); await p.fill('#login-org','Takaful');
  await p.locator('.stakeholder-card').filter({ hasText: 'ESG Analyst' }).first().click();
  await p.click('button:has-text("Sign In")');
  await p.waitForTimeout(1200);
  const ids = await p.$$eval('.nav-item[data-page]', els => els.filter(e=>e.style.display!=='none').map(e => e.dataset.page));
  console.log('  visible nav for ESG Analyst:', ids.join(', '));
  for (const id of ids) { await p.click(`.nav-item[data-page="${id}"]`); await p.waitForTimeout(700); }
  console.log('\n=== 4xx/5xx RESPONSES ===');
  console.log(seen.length ? [...new Set(seen)].join('\n') : '  none');
  await b.close();
})();
