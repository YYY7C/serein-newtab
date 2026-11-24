/* Serein · 弹窗基座与常用对话框
 *
 * 一个极简的「层」管理器：后开的弹窗永远在更上层，Esc 只关闭最上层。
 */

import { h, svgIcon, clear, uid, normalizeUrl, isUsableUrl } from './util.js';
import { files, revokeObjectUrl } from './storage.js';
import { resolveIcon, faviconUrl, loadFileIcon } from './icons.js';
import * as store from './store.js';
import { t } from './i18n.js';

const stack = [];

/* ---------------------------------------------------------------- 基座 */

/**
 * @param {{title?:string, body:Node, footer?:Node[], wide?:boolean, onClose?:Function, scrimClose?:boolean}} options
 */
export function openModal(options) {
  const { title = '', body, footer = [], wide = false, onClose, scrimClose = true, restoreFocus } = options;

  const previousFocus = document.activeElement;
  const stage = document.querySelector('.stage');
  const settings = document.querySelector('.settings.is-open');
  if (stage) stage.inert = true;
  if (settings) settings.inert = true;
  const lowerModal = topLayer();
  if (lowerModal) lowerModal.layer.inert = true;

  const scrim = h('div', { class: 'scrim' });
  const card = h('div', {
    class: `modal-card${wide ? ' is-wide' : ''}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title || t('对话框'),
  });
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
          'aria-label': t('关闭'),
          html: svgIcon('close', 16),
          onclick: () => close(),
        })
      )
    );
  }

  card.appendChild(h('div', { class: 'modal-body' }, body));
  if (footer.length) card.appendChild(h('div', { class: 'modal-foot' }, ...footer));

  // 对话框内的 Tab 循环：页面/设置/下层弹窗都已 inert，
  // 但不做这一步时，Tab 仍会跑到浏览器地址栏或页面外的 Toast 上。
  card.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229 || event.key !== 'Tab') return;
    const focusables = Array.from(
      card.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((node) => node.getClientRects().length > 0);
    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !card.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !card.contains(active))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  });

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
    if (layer.contains(document.activeElement)) document.activeElement.blur?.();
    // 淡出期间保留一个不 inert 的点击拦截层：双击关闭按钮时，第二下会落在
    // 透明遮罩上而不是点穿到背后的快捷方式
    entry.layer.inert = false;
    entry.layer.classList.add('is-closing');
    const closingCard = entry.layer.querySelector('.modal-card');
    if (closingCard) closingCard.inert = true;
    scrim.classList.remove('is-open');
    layer.classList.remove('is-open');
    setTimeout(() => layer.remove(), 260);
    try {
      onClose?.();
    } catch (err) {
      console.error('[serein/modal] onClose 异常', err);
    }

    // 关闭上层弹窗后，把下层弹窗恢复为可交互
    const newTop = topLayer();
    if (newTop) newTop.layer.inert = false;

    // 最后一个弹窗关闭后，把页面/设置从 inert 里放出来，并尽量还原焦点
    if (!stack.length) {
      const stillSettings = document.querySelector('.settings.is-open');
      const page = document.querySelector('.stage');
      if (stillSettings) stillSettings.inert = false;
      if (page) page.inert = Boolean(stillSettings);
    }
    setTimeout(() => {
      // 关闭动画的 270ms 内用户可能已经点了别处；不要用旧焦点把它抢回来
      const current = document.activeElement;
      if (current && current !== document.body && !layer.contains(current) && !card.contains(current)) return;
      let target = previousFocus;
      if (!target?.isConnected || !target.getClientRects().length) {
        // 触发按钮可能已经被重绘（例如文件夹里编辑条目会让主网格重建）
        try {
          target = restoreFocus?.() || null;
        } catch {
          target = null;
        }
      }
      if (!target?.isConnected || !target.getClientRects().length) return;
      const top = topLayer();
      if (top && !top.layer.contains(target)) return;
      target.focus?.({ preventScroll: true });
    }, 270);
  }

  if (scrimClose) scrim.addEventListener('click', close);

  setTimeout(() => {
    if (!layer.isConnected || !layer.classList.contains('is-open') || topLayer()?.layer !== layer) return;
    // 用户如果在 60ms 内已经点了弹窗里的控件，不要把焦点抢回默认位置
    const active = document.activeElement;
    if (active && active !== card && card.contains(active)) return;
    // querySelector 的候选顺序不等于优先级：标题栏的关闭按钮在 DOM 里更靠前，
    // 必须显式先找输入框，再找主按钮，否则确认框会默认聚焦右上角的 ×。
    const focusable =
      card.querySelector('input, textarea, select') ||
      card.querySelector('button.is-primary') ||
      // 危险操作默认聚焦「取消」，避免打开确认框后顺手回车直接删除/重置
      card.querySelector('.modal-foot .btn:not(.is-danger)') ||
      card.querySelector('button');
    focusable?.focus?.({ preventScroll: true });
  }, 60);

  return { layer, card, close };
}

function topLayer() {
  return stack[stack.length - 1];
}

document.addEventListener('keydown', (event) => {
  // 输入法组合期间按 Esc 只是取消候选词，不能顺手把整个弹窗关掉
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key !== 'Escape') return;
  const top = topLayer();
  if (!top) return;
  // 只关最上层的弹窗：阻止同级的其他 Escape 处理器（例如设置面板）一起响应
  event.stopImmediatePropagation();
  top.close();
});

/* -------------------------------------------------------------- 确认框 */

export function confirmDialog({
  title = t('确认操作'),
  message = '',
  confirmText = t('确定'),
  cancelText = t('取消'),
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
  title = t('输入'),
  label = '',
  value = '',
  placeholder = '',
  confirmText = t('保存'),
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const input = h('input', {
      class: 'text-input',
      type: 'text',
      value,
      placeholder,
      maxlength: '40',
      'aria-label': label || title,
    });
    const body = h('div', { class: 'field' }, label ? h('label', { text: label }) : null, input);

    const submit = () => {
      finish(input.value.trim());
      modal.close();
    };

    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });

    const modal = openModal({
      title,
      body,
      footer: [
        h('button', { class: 'btn', type: 'button', text: t('取消'), onclick: () => { finish(null); modal.close(); } }),
        h('button', { class: 'btn is-primary', type: 'button', text: confirmText, onclick: submit }),
      ],
      onClose: () => finish(null),
    });

    // 预填的是旧名字：默认全选，直接输入就能覆盖，而不是在末尾追加
    setTimeout(() => {
      if (input.isConnected && input.closest('.modal.is-open') && document.activeElement === input) input.select();
    }, 80);
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

const iconTabLabel = (tab) => t(tab.label);

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
    let uploadedFileId = '';
    let previewPaintId = 0;
    let uploadSeq = 0;
    let editorClosed = false;
    let userInteracted = false;
    const newFileIds = new Set();
    const previewFileCache = new Map();
    const previewFileUrls = new Set();

    /* ---- 预览 ---- */
    const previewBox = h('div', { class: 'icon-preview' });
    const previewMeta = h('div', { class: 'field-hint', style: { marginTop: '0' } });

    function previewFileUrl(fileId) {
      if (!previewFileCache.has(fileId)) {
        previewFileCache.set(
          fileId,
          loadFileIcon(fileId).then((url) => {
            if (!url) return null;
            if (editorClosed) {
              revokeObjectUrl(url);
              return null;
            }
            previewFileUrls.add(url);
            return url;
          })
        );
      }
      return previewFileCache.get(fileId);
    }

    function appendPreviewImage(src, descriptor, token) {
      const img = h('img', { src, alt: '' });
      const tokenCurrent = () => previewBox.dataset.paintToken === String(token);
      img.addEventListener(
        'load',
        () => {
          if (!tokenCurrent() || !img.isConnected) return;
          Array.from(previewBox.childNodes).forEach((child) => {
            if (child !== img) child.remove();
          });
        },
        { once: true }
      );
      img.addEventListener(
        'error',
        () => {
          img.remove();
          if (!tokenCurrent() || !descriptor.brand) return;
          previewBox.classList.remove('is-brand');
          previewBox.style.background = `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`;
          if (!previewBox.querySelector('.mono-text')) {
            previewBox.appendChild(
              h('span', { class: 'mono-text', text: descriptor.text, style: { color: descriptor.fg } })
            );
          }
          previewMeta.textContent = t('内置图标加载失败，已使用字符徽标');
        },
        { once: true }
      );
      previewBox.appendChild(img);
    }

    function paintPreview() {
      clear(previewBox);
      const token = ++previewPaintId;
      previewBox.dataset.paintToken = String(token);
      const descriptor = resolveIcon(
        { title: draft.title || 'A', url: draft.url || 'https://example.com', iconType: draft.iconType, iconValue: draft.iconValue },
        {
          useFavicon: draft.iconType === 'auto' || draft.iconType === 'favicon',
          iconStyle: store.state.config.layout.iconStyle || 'brand',
        }
      );
      previewBox.classList.toggle('is-brand', Boolean(descriptor.brand));

      if (descriptor.emoji) {
        previewBox.style.background = 'var(--input-bg)';
        previewBox.appendChild(h('span', { class: 'emoji-text', text: descriptor.text }));
        previewMeta.textContent = t('使用表情作为图标');
        return;
      }

      if (descriptor.brand) {
        previewBox.style.background = 'transparent';
        previewMeta.textContent = t('内置矢量品牌图标，离线可用');
      } else {
        previewBox.style.background = `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`;
        previewBox.appendChild(h('span', { class: 'mono-text', text: descriptor.text, style: { color: descriptor.fg } }));
      }

      const src = (draft.iconType === 'file' && draft.iconValue === uploadedFileId ? uploadedObjectUrl : null) || descriptor.src;
      if (src) {
        appendPreviewImage(src, descriptor, token);
        if (!descriptor.brand) {
          previewMeta.textContent =
            draft.iconType === 'file'
              ? t('本地上传的图标')
              : draft.iconType === 'url'
                ? t('使用图片链接，加载失败时回退为字符徽标')
                : t('自动抓取网站图标，失败时使用字符徽标');
        }
      } else if (descriptor.pendingFileId) {
        previewMeta.textContent = t('正在载入本地上传的图标…');
        previewFileUrl(descriptor.pendingFileId).then((url) => {
          if (previewBox.dataset.paintToken !== String(token)) return;
          if (!url) {
            previewMeta.textContent = t('本地上传的图标文件已丢失');
            return;
          }
          appendPreviewImage(url, descriptor, token);
          previewMeta.textContent = t('本地上传的图标');
        });
      } else {
        previewMeta.textContent = draft.iconType === 'file' ? t('尚未选择图片') : t('字符徽标（无网络时也能正常显示）');
      }
    }

    /* ---- 字段 ---- */
    const titleInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: draft.title,
      placeholder: t('例如：哔哩哔哩'),
      maxlength: '40',
      'aria-label': t('名称'),
    });
    titleInput.addEventListener('input', () => {
      draft.title = titleInput.value;
      paintPreview();
    });

    const urlInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: draft.url,
      placeholder: t('例如：bilibili.com'),
      spellcheck: 'false',
      maxlength: '2048',
      'aria-label': t('网址'),
    });
    // 给错误提示一个稳定 id，方便 aria-describedby 指向它
    const urlErrorId = `shortcut-url-error-${uid('')}`;
    const urlError = h('div', {
      class: 'field-hint',
      id: urlErrorId,
      style: { color: '#ff6b78', minHeight: '16px' },
      'aria-live': 'polite',
      text: '',
    });
    urlInput.setAttribute('aria-describedby', urlErrorId);
    urlInput.addEventListener('input', () => {
      draft.url = urlInput.value;
      urlInput.style.borderColor = '';
      urlInput.removeAttribute('aria-invalid');
      urlError.textContent = '';
      paintPreview();
    });

    /* ---- 图标区域 ---- */
    const tabsRow = h('div', { class: 'icon-tabs', role: 'tablist', 'aria-label': t('图标类型') });
    const iconPanel = h('div', { role: 'tabpanel' });

    const emojiGrid = h('div', { class: 'emoji-grid' });
    for (const emoji of EMOJIS) {
      emojiGrid.appendChild(
        h('button', {
          type: 'button',
          text: emoji,
          title: emoji,
          onclick: () => {
            uploadSeq += 1;
            draft.iconType = 'emoji';
            draft.iconValue = emoji;
            // 已经在「表情」页里换图：不要重建面板，否则刚点的按钮会被移除、焦点掉到页面根部
            paintPreview();
          },
        })
      );
    }

    const textInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: draft.iconType === 'text' ? draft.iconValue : '',
      placeholder: t('最多 4 个字符'),
      maxlength: '4',
      'aria-label': t('文字图标'),
    });
    textInput.addEventListener('input', () => {
      uploadSeq += 1;
      draft.iconType = 'text';
      draft.iconValue = textInput.value;
      // 只刷新预览：syncTabs 会移除正在输入的这个 input，导致每打一个字就丢焦点
      paintPreview();
    });

    const urlIconInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: draft.iconType === 'url' ? draft.iconValue : '',
      placeholder: t('https://… 图片地址'),
      spellcheck: 'false',
      maxlength: '2048',
      'aria-label': t('图片链接'),
    });
    urlIconInput.addEventListener('input', () => {
      uploadSeq += 1;
      draft.iconType = 'url';
      draft.iconValue = urlIconInput.value;
      paintPreview();
    });

    const fileInput = h('input', {
      type: 'file',
      accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon',
      style: { display: 'none' },
      'aria-label': t('本地上传图标'),
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        previewMeta.textContent = t('请选择图片文件');
        fileInput.value = '';
        return;
      }
      if (file.size > 512 * 1024) {
        previewMeta.textContent = t('图片超过 512 KB，请压缩后再试');
        fileInput.value = '';
        return;
      }
      const fileId = uid('icon_');
      const seq = ++uploadSeq;
      try {
        const stored = await files.put(`icon:${fileId}`, file);
        if (!stored) throw new Error('store failed');
      } catch {
        if (seq === uploadSeq) {
          if (!editorClosed) previewMeta.textContent = t('保存图片失败，请重试');
          fileInput.value = '';
        }
        return;
      }
      if (seq !== uploadSeq || editorClosed) {
        await files.remove(`icon:${fileId}`);
        return;
      }
      newFileIds.add(fileId);
      draft.iconType = 'file';
      draft.iconValue = fileId;
      uploadedFileId = fileId;
      if (uploadedObjectUrl) URL.revokeObjectURL(uploadedObjectUrl);
      uploadedObjectUrl = URL.createObjectURL(file);
      fileInput.value = '';
      // 上传入口只存在于「本地上传」页，类型已经正确，重建面板反而会把刚用完的按钮焦点丢掉
      paintPreview();
    });

    const fileButton = h(
      'button',
      {
        class: 'btn',
        type: 'button',
        html: `${svgIcon('upload', 15)}<span>${t('选择图片')}</span>`,
        onclick: () => fileInput.click(),
      }
    );

    function syncTabs() {
      Array.from(tabsRow.children).forEach((button) => {
        const active = button.dataset.tab === draft.iconType;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      });
      clear(iconPanel);
      if (draft.iconType === 'auto') {
        iconPanel.appendChild(
          h('div', {
            class: 'field-hint',
            text: t('自动：先找内置矢量品牌图标（离线、清晰），没有再取 Chrome 缓存的站点图标，最后退回品牌色字符徽标。'),
          })
        );
      } else if (draft.iconType === 'favicon') {
        iconPanel.appendChild(
          h('div', {
            class: 'field-hint',
            text: t('只使用 Chrome 本地缓存的站点图标，不与内置品牌图标合并。'),
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
          role: 'tab',
          'aria-selected': String(tab.id === draft.iconType),
          tabIndex: tab.id === draft.iconType ? 0 : -1,
          'data-tab': tab.id,
          text: iconTabLabel(tab),
          onclick: () => {
            if (tab.id === draft.iconType) return;
            uploadSeq += 1;
            if (tab.id === 'auto') {
              draft.iconType = 'auto';
              draft.iconValue = '';
            } else {
              // 切换类型时清空上一种类型的值：文字「测」不能被当成图片 URL 请求
              draft.iconType = tab.id;
              draft.iconValue = '';
              textInput.value = '';
              urlIconInput.value = '';
            }
            syncTabs();
          },
        })
      );
    }

    tabsRow.addEventListener('keydown', (event) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const tabs = Array.from(tabsRow.children);
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      tabs[next].focus({ preventScroll: true });
      tabs[next].click();
    });

    /* ---- 分组 ---- */
    const groupSelect = h('select', {
      class: 'text-input',
      style: { height: '36px', cursor: 'pointer' },
      'aria-label': t('所在文件夹'),
    });
    groupSelect.appendChild(h('option', { value: '', text: t('（不放入文件夹）') }));
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
      h('div', { class: 'field' }, h('label', { text: t('名称') }), titleInput),
      h('div', { class: 'field' }, h('label', { text: t('网址') }), urlInput, urlError),
      h('div', { class: 'field' }, h('label', { text: t('图标') }), tabsRow, iconPanel),
      h('div', { class: 'field' }, h('label', { text: t('所在文件夹') }), groupSelect)
    );
    body.addEventListener('pointerdown', () => { userInteracted = true; }, { once: true });
    body.addEventListener('keydown', () => { userInteracted = true; }, { once: true });

    const validate = () => isUsableUrl(draft.url);

    const saveButton = h('button', {
      class: 'btn is-primary',
      type: 'button',
      text: shortcut ? t('保存') : t('添加'),
      onclick: () => {
        if (!validate()) {
          urlInput.focus();
          urlInput.style.borderColor = '#ff6b78';
          urlInput.setAttribute('aria-invalid', 'true');
          urlError.textContent = t('请输入有效网址，例如 example.com 或 https://example.com');
          return;
        }
        const url = normalizeUrl(draft.url);
        const result = {
          title: draft.title.trim() || url.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
          url,
          iconType: draft.iconType,
          iconValue: draft.iconValue,
          groupId: draft.groupId || null,
        };
        // 只保留本次最终选中的上传文件，其余候选图立即回收
        newFileIds.forEach((fileId) => {
          if (!(result.iconType === 'file' && result.iconValue === fileId)) files.remove(`icon:${fileId}`);
        });
        newFileIds.clear();
        finish(result);
        modal.close();
      },
    });

    urlInput.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        saveButton.click();
      }
    });

    titleInput.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        saveButton.click();
      }
    });

    const modal = openModal({
      title: shortcut ? t('编辑快捷方式') : t('添加快捷方式'),
      body,
      footer: [
        h('button', { class: 'btn', type: 'button', text: t('取消'), onclick: () => modal.close() }),
        saveButton,
      ],
      onClose: () => {
        editorClosed = true;
        if (!settled) newFileIds.forEach((fileId) => files.remove(`icon:${fileId}`));
        if (uploadedObjectUrl) URL.revokeObjectURL(uploadedObjectUrl);
        previewFileUrls.forEach((url) => revokeObjectUrl(url));
        previewFileUrls.clear();
        finish(null);
      },
    });

    syncTabs();
    setTimeout(() => {
      if (editorClosed || userInteracted) return;
      (shortcut ? titleInput : urlInput).focus();
    }, 80);
  });
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
  const wrap = h('div', { class: 'seg', role: 'group' });
  for (const option of options) {
    wrap.appendChild(
      h('button', {
        type: 'button',
        class: option.value === value ? 'is-active' : '',
        'data-value': option.value,
        'aria-pressed': String(option.value === value),
        text: option.label,
        onclick: () => {
          Array.from(wrap.children).forEach((child) => {
            const active = child.dataset.value === option.value;
            child.classList.toggle('is-active', active);
            child.setAttribute('aria-pressed', String(active));
          });
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
export function makeStepper({ min, max, value, label = t('数值'), onChange }) {
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
      'aria-label': t('减少'),
      tabindex: '-1',
      text: '−',
      onclick: () => nudge(-1),
    }),
    field,
    h('button', {
      class: 'stepper-btn',
      type: 'button',
      'aria-label': t('增加'),
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
