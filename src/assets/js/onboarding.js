/* Serein · 首次启动引导
 *
 * 只做三件事：选天气城市、告诉用户右键/F2/Ctrl+K 在哪、说明数据在本机。
 * 可以跳过；老用户升级后不会看到。
 */

import { h, debounce } from './util.js';
import * as store from './store.js';
import { openModal } from './modals.js';
import { HOT_CITIES, searchCity, refreshWeather } from './weather.js';

export function showOnboarding() {
  if (store.state.meta.onboarded) return;
  if (document.querySelector('.modal.is-open') || document.querySelector('.settings.is-open')) return;

  const cityText = h('strong', { text: store.state.weather.city || '未选择' });
  const results = h('div', { class: 'onboard-cities' });
  const input = h('input', {
    class: 'text-input',
    type: 'search',
    placeholder: '搜索城市，例如 杭州',
    'aria-label': '搜索城市',
    autocomplete: 'off',
  });

  let seq = 0;
  const pickCity = async (city) => {
    store.update((state) => {
      state.weather.city = city.name;
      state.weather.lat = city.lat;
      state.weather.lon = city.lon;
    }, 'weather');
    cityText.textContent = city.name;
    results.replaceChildren();
    try {
      await refreshWeather(store.state, { force: true });
    } catch {
      /* 天气失败不影响引导 */
    }
  };

  const renderCities = (list) => {
    results.replaceChildren(
      ...list.map((city) =>
        h('button', {
          class: 'btn onboard-city',
          type: 'button',
          text: city.name,
          title: city.region || city.name,
          onclick: () => pickCity(city),
        })
      )
    );
  };
  renderCities(HOT_CITIES);

  input.addEventListener(
    'input',
    debounce(async () => {
      const query = input.value.trim();
      if (!query) {
        renderCities(HOT_CITIES);
        return;
      }
      const epoch = ++seq;
      const found = await searchCity(query);
      if (epoch !== seq) return;
      renderCities(found);
      if (!found.length) {
        results.appendChild(h('span', { class: 'field-hint', text: '没有找到，试试更完整的城市名' }));
      }
    }, 300)
  );

  const body = h(
    'div',
    { class: 'onboard' },
    h('p', {
      class: 'onboard-lead',
      text: '先选一个天气城市，然后就可以开始了。配置、待办和便签都只保存在这台电脑上。',
    }),
    h(
      'div',
      { class: 'field' },
      h('label', {}, '天气城市：', cityText),
      input,
      results
    ),
    h(
      'ul',
      { class: 'onboard-tips' },
      h('li', {}, h('kbd', { text: '右键' }), '图标编辑或移动；右键空白处新建'),
      h('li', {}, h('kbd', { text: 'Ctrl K' }), '聚焦搜索；输入「设置」「壁纸」直达'),
      h('li', {}, h('kbd', { text: 'F2' }), '编辑选中图标；', h('kbd', { text: 'Delete' }), '删除')
    )
  );

  const finish = () => {
    store.update((state) => {
      state.meta.onboarded = true;
    }, 'all');
    modal.close();
  };

  const modal = openModal({
    title: '欢迎使用 Serein',
    body,
    footer: [
      h('button', { class: 'btn is-ghost', type: 'button', text: '跳过', onclick: finish }),
      h('button', { class: 'btn is-primary', type: 'button', text: '开始使用', onclick: finish }),
    ],
    onClose: () => {
      // 关闭但没点按钮（Esc/遮罩）：不标记完成，下次仍会提醒
    },
  });
}
