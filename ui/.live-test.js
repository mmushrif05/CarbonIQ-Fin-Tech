const { chromium } = require('playwright');
const URL = process.env.TARGET;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext()).newPage();
  const errs = [], bad = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status()+'  '+r.url()); });

  await p.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  console.log('  title:', await p.title());
  console.log('  Auth defined      :', await p.evaluate(() => typeof Auth));
  console.log('  LoginPage defined :', await p.evaluate(() => typeof LoginPage));
  console.log('  CARBONIQ_fetch    :', await p.evaluate(() => typeof window.CARBONIQ_fetch));
  console.log('  stakeholder cards :', await p.locator('.stakeholder-card').count());

  await p.fill('#login-name','Mushrif').catch(e=>console.log('  fill name failed:', e.message.split('\n')[0]));
  await p.fill('#login-email','mmushrif05@gmail.com').catch(()=>{});
  await p.fill('#login-org','Takaful').catch(()=>{});
  await p.locator('.stakeholder-card').filter({ hasText: 'ESG Analyst' }).first().click().catch(e=>console.log('  card click failed'));
  await p.click('button:has-text("Sign In")').catch(e=>console.log('  signin click failed'));
  await p.waitForTimeout(3000);

  console.log('\n  after sign-in:');
  console.log('    session   :', await p.evaluate(() => localStorage.getItem('carboniq_session')));
  console.log('    nav items :', await p.locator('.nav-item').count());
  console.log('    shell shown:', await p.locator('.nav-item').first().isVisible().catch(()=>false));

  console.log('\n=== ERRORS ===');  console.log(errs.length ? [...new Set(errs)].join('\n') : '  none');
  console.log('\n=== 4xx/5xx ===');  console.log(bad.length ? [...new Set(bad)].join('\n') : '  none');
  await b.close();
})().catch(e => { console.error('COULD NOT REACH SITE:', e.message.split('\n')[0]); process.exit(2); });
