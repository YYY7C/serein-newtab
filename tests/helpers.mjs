import { expect } from '@playwright/test';

export async function mockWeather(page) {
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        current: {
          temperature_2m: 6,
          apparent_temperature: -1,
          relative_humidity_2m: 20,
          is_day: 1,
          weather_code: 0,
          wind_speed_10m: 5,
        },
        daily: {
          time: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'],
          weather_code: [0, 1, 2, 3, 61],
          temperature_2m_max: [7, 5, 7, 11, 11],
          temperature_2m_min: [-1, -1, -3, 0, 2],
        },
      }),
    })
  );
}

export async function mockBaiduSuggest(page) {
  await page.route('https://suggestion.baidu.com/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
      body:
        'window.baidu.sug({q:"111",p:false,s:["111135cm","111是什么意思","11183","1111光棍",' +
        '"111333查询资料入口","1111院公交车路线","11133期开奖查询","11103邮政查询"]});',
    })
  );
}

export function trackPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // 本地预览没有扩展 host 权限：天气/联想/壁纸的网络失败是预期行为
    if (/Failed to load resource|net::ERR|CORS|Access to fetch/i.test(text)) return;
    errors.push(text);
  });
  return errors;
}

export async function gotoNewTab(page) {
  // ?no-onboard：测试里跳过首启引导，避免和 700ms 后的弹窗抢焦点
  await page.goto('/newtab.html?no-onboard', { waitUntil: 'load' });
  await expect(page.locator('#grid .tile').first()).toBeVisible();
}

export async function setStyle(page, style) {
  await page.evaluate(async (next) => {
    const store = await import('/assets/js/store.js');
    store.state.config.style = next;
    store.commit('config');
  }, style);
  await expect(page.locator('html')).toHaveAttribute('data-style', style);
}
