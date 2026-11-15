/* Lumen · 弹窗基座与常用对话框
 *
 * 一个极简的「层」管理器：后开的弹窗永远在更上层，Esc 只关闭最上层。
 */

import { h, svgIcon, clear, uid, normalizeUrl, isSafeUrl } from './util.js';
import { files } from './storage.js';
import { resolveIcon, faviconUrl } from './icons.js';
import { ENGINES } from './defaults.js';

const stack = [];

/* ---------------------------------------------------------------- 基座 */

/**
 * @param {{title?:string, body:Node, footer?:Node[], wide?:boolean, onClose?:Function, scrimClose?:boolean}} options
 */
export function openModal(options) {
  const { title = '', body, footer = [], wide = false, onClose, scrimClose = true } = options;

  const scrim = h('div', { class: 'scrim' });
  const card = h('div', { class: `modal-card${wide ? ' is-wide' : ''}`, role: 'dialog', 'aria-modal': 'true' });
  const layer = h('div', { class: 'modal' }, scrim, card);

  if (title) {
    card.appendChild(
      h(
        'div',
        { class: 'modal-head' },
        h('h2', { class: 'modal-title', text: title }),
        h('button', {
          class: 'settings-close',
          type: 'button',
          'aria-label': '关闭',
          html: svgIcon('close', 16),
          onclick: () => close(),
        })
      )
    );
  }

  card.appendChild(h('div', { class: 'modal-body' }, body));
  if (footer.length) card.appendChild(h('div', { class: 'modal-foot' }, ...footer));

  document.body.appendChild(layer);
  // 先强制一次样式计算再挂 is-open：过渡有起点，立即生效。
  // 用 rAF 会在后台标签页被节流，弹窗要等页面重新可见才出现。
  void layer.offsetWidth;
  scrim.classList.add('is-open');
  layer.classList.add('is-open');

  const entry = { layer, close, z: 0 };
  stack.push(entry);
  entry.z = 120 + stack.length * 3;
  layer.style.zIndex = String(entry.z);

  function close() {
    const index = stack.indexOf(entry);
    if (index < 0) return;
    stack.splice(index, 1);
    scrim.classList.remove('is-open');
    layer.classList.remove('is-open');
    setTimeout(() => layer.remove(), 260);
    onClose?.();
  }

  if (scrimClose) scrim.addEventListener('click', close);

  setTimeout(() => {
    const focusable = card.querySelector('input, textarea, button.is-primary, button');
    focusable?.focus?.({ preventScroll: true });
  }, 60);

  return { layer, card, close };
}

function topLayer() {
  return stack[stack.length - 1];
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const top = topLayer();
  if (!top) return;
  // 只关最上层的弹窗：阻止同级的其他 Escape 处理器（例如设置面板）一起响应
  event.stopImmediatePropagation();
  top.close();
});

/* -------------------------------------------------------------- 确认框 */

export function confirmDialog({
  title = '确认操作',
  message = '',
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const body = h('div', { class: 'field-hint', style: { fontSize: '13px', lineHeight: '1.7' } });
    body.textContent = message;

    const modal = openModal({
      title,
      body,
      footer: [
        h('button', { class: 'btn', type: 'button', text: cancelText, onclick: () => { finish(false); modal.close(); } }),
        h('button', {
          class: `btn ${danger ? 'is-danger' : 'is-primary'}`,
          type: 'button',
          text: confirmText,
          onclick: () => { finish(true); modal.close(); },
        }),
      ],
      onClose: () => finish(false),
    });
  });
}

/* -------------------------------------------------------------- 输入框 */

export function promptDialog({
  title = '输入',
  label = '',
  value = '',
  placeholder = '',
  confirmText = '保存',
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const input = h('input', { class: 'text-input', type: 'text', value, placeholder });
    const body = h('div', { class: 'field' }, label ? h('label', { text: label }) : null, input);

    const submit = () => {
      finish(input.value.trim());
      modal.close();
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });

    const modal = openModal({
      title,
      body,
      footer: [
        h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => { finish(null); modal.close(); } }),
        h('button', { class: 'btn is-primary', type: 'button', text: confirmText, onclick: submit }),
      ],
      onClose: () => finish(null),
    });
  });
}

/* ------------------------------------------------------------ 图标选择器 */

const EMOJIS = [
  '🔍', '⭐', '🌟', '✨', '🔥', '💡', '🎯', '🚀', '🧭', '🗂️',
  '📌', '📎', '📝', '📖', '📚', '🎧', '🎬', '🎮', '🕹️', '🎨',
  '🖌️', '📷', '🎥', '🎵', '🎼', '☕', '🍜', '🍰', '🍺', '🍎',
  '💻', '🖥️', '⌨️', '🖱️', '📱', '💾', '💿', '🔌', '🧩', '⚙️',
  '🔧', '🔨', '🛠️', '🧰', '📊', '📈', '📉', '💰', '💳', '🧾',
  '✉️', '📮', '📬', '💬', '🗨️', '📞', '☁️', '🌤️', '🌙', '⚡',
  '🌊', '🌲', '🌵', '🍀', '🌸', '🌺', '🦋', '🐧', '🐳', '🦊',
  '🏠', '🏢', '🏫', '🏥', '🏦', '🛒', '🛍️', '🎁', '🏆', '🥇',
  '✅', '❌', '❤️', '💙', '💚', '🧡', '💜', '🖤', '🤍', '🔒',
  '🔑', '🗝️', '🧠', '👤', '👥', '🌍', '🗺️', '✈️', '🚗', '🚲',
  '⏰', '📅', '🗓️', '⏳', '🔔', '🎓', '🧪', '🔬', '🧬', '🛰️',
  '🎲', '🃏', '♟️', '🎪', '🎭', '🌈', '☀️', '❄️', '🕶️', '🎃',
];

const ICON_TABS = [
  { id: 'auto', label: '自动' },
  { id: 'favicon', label: '网站图标' },
  { id: 'emoji', label: '表情' },
  { id: 'text', label: '文字' },
  { id: 'url', label: '图片链接' },
  { id: 'file', label: '本地上传' },
];

/**
 * 新建 / 编辑快捷方式。
 * @param {{shortcut?:object, defaultGroupId?:string|null, groups:Array}} options
 * @returns {Promise<null | {title,url,iconType,iconValue,groupId}>}
 */
export function shortcutEditor({ shortcut = null, groups = [], defaultGroupId = null } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const draft = {
      title: shortcut?.title || '',
      url: shortcut?.url || '',
      iconType: shortcut?.iconType || 'auto',
      iconValue: shortcut?.iconValue || '',
      groupId: shortcut?.groupId ?? defaultGroupId,
    };
    let uploadedObjectUrl = null;

    /* ---- 预览 ---- */
    const previewBox = h('div', { class: 'icon-preview' });
    const previewMeta = h('div', { class: 'field-hint', style: { marginTop: '0' } });

    function paintPreview() {
      clear(previewBox);
      const descriptor = resolveIcon(
        { title: draft.title || 'A', url: draft.url || 'https://example.com', iconType: draft.iconType, iconValue: draft.iconValue },
        { useFavicon: draft.iconType === 'auto' || draft.iconType === 'favicon', iconStyle: 'brand' }
      );
      previewBox.classList.toggle('is-brand', Boolean(descriptor.brand));

      if (descriptor.emoji) {
        previewBox.style.background = 'var(--input-bg)';
        previewBox.appendChild(h('span', { class: 'emoji-text', text: descriptor.text }));
        previewMeta.textContent = '使用表情作为图标';
        return;
      }

      if (descriptor.brand) {
        previewBox.style.background = 'transparent';
        previewMeta.textContent = '内置矢量品牌图标，离线可用';
      } else {
        previewBox.style.background = `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`;
        previewBox.appendChild(h('span', { class: 'mono-text', text: descriptor.text }));
      }

      const src = uploadedObjectUrl || descriptor.src;
      if (src) {
        const img = h('img', { src, alt: '' });
        img.addEventListener('error', () => img.remove());
        previewBox.appendChild(img);
        if (!descriptor.brand) {
          previewMeta.textContent =
            draft.iconType === 'file' ? '本地上传的图标' : '自动抓取网站图标，失败时使用字符徽标';
        }
      } else {
        previewMeta.textContent = draft.iconType === 'file' ? '尚未选择图片' : '字符徽标（无网络时也能正常显示）';
      }
    }

    /* ---- 字段 ---- */
    const titleInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: draft.title,
      placeholder: '例如：哔哩哔哩',
      maxlength: '40',
    });
    titleInput.addEventListener('input', () => {
      draft.title = titleInput.value;
      paintPreview();
    });

    const urlInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: draft.url,
      placeholder: '例如：bilibili.com',
      spellcheck: 'false',
    });
    urlInput.addEventListener('input', () => {
      draft.url = urlInput.value;
      paintPreview();
    });

    /* ---- 图标区域 ---- */
    const tabsRow = h('div', { class: 'icon-tabs' });
    const iconPanel = h('div');

    const emojiGrid = h('div', { class: 'emoji-grid' });
    for (const emoji of EMOJIS) {
      emojiGrid.appendChild(
        h('button', {
          type: 'button',
          text: emoji,
          title: emoji,
          onclick: () => {
            draft.iconType = 'emoji';
            draft.iconValue = emoji;
            syncTabs();
            paintPreview();
          },
        })
      );
    }

    const textInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: draft.iconType === 'text' ? draft.iconValue : '',
      placeholder: '最多 4 个字符',
      maxlength: '4',
    });
    textInput.addEventListener('input', () => {
      draft.iconType = 'text';
      draft.iconValue = textInput.value;
      syncTabs();
      paintPreview();
    });

    const urlIconInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: draft.iconType === 'url' ? draft.iconValue : '',
      placeholder: 'https://… 图片地址',
      spellcheck: 'false',
    });
    urlIconInput.addEventListener('input', () => {
      draft.iconType = 'url';
      draft.iconValue = urlIconInput.value;
      syncTabs();
      paintPreview();
    });

    const fileInput = h('input', {
      type: 'file',
      accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon',
      style: { display: 'none' },
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 512 * 1024) {
        previewMeta.textContent = '图片超过 512 KB，请压缩后再试';
        return;
      }
      const fileId = uid('icon_');
      await files.put(`icon:${fileId}`, file);
      draft.iconType = 'file';
      draft.iconValue = fileId;
      if (uploadedObjectUrl) URL.revokeObjectURL(uploadedObjectUrl);
      uploadedObjectUrl = URL.createObjectURL(file);
      syncTabs();
      paintPreview();
    });

    const fileButton = h(
      'button',
      {
        class: 'btn',
        type: 'button',
        html: `${svgIcon('upload', 15)}<span>选择图片</span>`,
        onclick: () => fileInput.click(),
      }
    );

    function syncTabs() {
      Array.from(tabsRow.children).forEach((button) => {
        button.classList.toggle('is-active', button.dataset.tab === draft.iconType);
      });
      clear(iconPanel);
      if (draft.iconType === 'auto') {
        iconPanel.appendChild(
          h('div', {
            class: 'field-hint',
            text: '自动：先找内置矢量品牌图标（离线、清晰），没有再取 Chrome 缓存的站点图标，最后退回品牌色字符徽标。',
          })
        );
      } else if (draft.iconType === 'favicon') {
        iconPanel.appendChild(
          h('div', {
            class: 'field-hint',
            text: '只使用 Chrome 本地缓存的站点图标，不与内置品牌图标合并。',
          })
        );
      } else if (draft.iconType === 'emoji') {
        iconPanel.appendChild(emojiGrid);
      } else if (draft.iconType === 'text') {
        iconPanel.appendChild(textInput);
      } else if (draft.iconType === 'url') {
        iconPanel.appendChild(urlIconInput);
      } else if (draft.iconType === 'file') {
        iconPanel.appendChild(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, fileButton, fileInput));
      }
      paintPreview();
    }

    for (const tab of ICON_TABS) {
      tabsRow.appendChild(
        h('button', {
          type: 'button',
          class: tab.id === draft.iconType ? 'is-active' : '',
          'data-tab': tab.id,
          text: tab.label,
          onclick: () => {
            if (tab.id === 'auto') {
              draft.iconType = 'auto';
              draft.iconValue = '';
            } else {
              draft.iconType = tab.id;
            }
            syncTabs();
          },
        })
      );
    }

    /* ---- 分组 ---- */
    const groupSelect = h('select', { class: 'text-input', style: { height: '36px', cursor: 'pointer' } });
    groupSelect.appendChild(h('option', { value: '', text: '（不放入文件夹）' }));
    for (const group of groups) {
      groupSelect.appendChild(
        h('option', { value: group.id, text: group.title, selected: draft.groupId === group.id })
      );
    }
    groupSelect.addEventListener('change', () => {
      draft.groupId = groupSelect.value || null;
    });

    /* ---- 组装 ---- */
    const body = h(
      'div',
      {},
      h('div', { class: 'icon-preview-row' }, previewBox, h('div', { style: { flex: '1', minWidth: '0' } }, previewMeta)),
      h('div', { class: 'field' }, h('label', { text: '名称' }), titleInput),
      h('div', { class: 'field' }, h('label', { text: '网址' }), urlInput),
      h('div', { class: 'field' }, h('label', { text: '图标' }), tabsRow, iconPanel),
      h('div', { class: 'field' }, h('label', { text: '所在文件夹' }), groupSelect)
    );

    const validate = () => {
      const url = normalizeUrl(draft.url);
      if (!url || !isSafeUrl(url)) return false;
      return url.includes('.') || url.includes('://') || /^[a-z]+:/i.test(url);
    };

    const saveButton = h('button', {
      class: 'btn is-primary',
      type: 'button',
      text: shortcut ? '保存' : '添加',
      onclick: () => {
        if (!validate()) {
          urlInput.focus();
          urlInput.style.borderColor = '#ff6b78';
          return;
        }
        const url = normalizeUrl(draft.url);
        finish({
          title: draft.title.trim() || url.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
          url,
          iconType: draft.iconType,
          iconValue: draft.iconValue,
          groupId: draft.groupId || null,
        });
        modal.close();
      },
    });

    urlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveButton.click();
      }
    });

    const modal = openModal({
      title: shortcut ? '编辑快捷方式' : '添加快捷方式',
      body,
      footer: [
        h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => modal.close() }),
        saveButton,
      ],
      onClose: () => {
        if (uploadedObjectUrl) URL.revokeObjectURL(uploadedObjectUrl);
        finish(null);
      },
    });

    syncTabs();
    setTimeout(() => (shortcut ? titleInput : urlInput).focus(), 80);
  });
}

/* ------------------------------------------------------- 搜索引擎选择器 */

export function enginePicker(currentId, onPick) {
  return ENGINES.map((engine) => ({
    label: engine.name,
    icon: currentId === engine.id ? 'check' : undefined,
    onClick: () => onPick(engine.id),
  }));
}

/* --------------------------------------------------------- 通用表单元素 */

export function makeSwitch(checked, onChange) {
  const node = h('button', {
    class: `switch${checked ? ' is-on' : ''}`,
    type: 'button',
    role: 'switch',
    'aria-checked': String(checked),
    onclick: () => {
      const next = !node.classList.contains('is-on');
      node.classList.toggle('is-on', next);
      node.setAttribute('aria-checked', String(next));
      onChange(next);
    },
  });
  return node;
}

export function makeSegmented(options, value, onChange) {
  const wrap = h('div', { class: 'seg' });
  for (const option of options) {
    wrap.appendChild(
      h('button', {
        type: 'button',
        class: option.value === value ? 'is-active' : '',
        'data-value': option.value,
        text: option.label,
        onclick: () => {
          Array.from(wrap.children).forEach((child) =>
            child.classList.toggle('is-active', child.dataset.value === option.value)
          );
          onChange(option.value);
        },
      })
    );
  }
  return wrap;
}

export function makeRange({ min, max, step = 1, value, format = (v) => String(v), onInput }) {
  const valueLabel = h('span', { class: 'value', text: format(value) });
  const input = h('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
    oninput: () => {
      valueLabel.textContent = format(Number(input.value));
      onInput(Number(input.value));
    },
  });
  return h('div', { class: 'range' }, input, valueLabel);
}

/** 数字步进器：滑块只能「大概」，精确值靠直接输入或 ± 点按。 */
export function makeStepper({ min, max, value, label = '数值', onChange }) {
  const fit = (raw) => {
    const num = Math.round(Number(raw));
    if (!Number.isFinite(num)) return min;
    return Math.min(max, Math.max(min, num));
  };

  const field = h('input', {
    class: 'stepper-input',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    'aria-label': label,
    value: String(value),
  });

  const commit = (next) => {
    const fitted = fit(next);
    field.value = String(fitted);
    onChange(fitted);
  };

  const nudge = (delta) => commit(fit(field.value) + delta);

  const node = h(
    'div',
    { class: 'stepper' },
    h('button', {
      class: 'stepper-btn',
      type: 'button',
      'aria-label': '减少',
      tabindex: '-1',
      text: '−',
      onclick: () => nudge(-1),
    }),
    field,
    h('button', {
      class: 'stepper-btn',
      type: 'button',
      'aria-label': '增加',
      tabindex: '-1',
      text: '+',
      onclick: () => nudge(1),
    })
  );

  field.addEventListener('change', () => commit(field.value));
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      field.blur();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nudge(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nudge(-1);
    }
  });

  node.setValue = (next) => {
    field.value = String(fit(next));
  };

  return node;
}

export { faviconUrl };
