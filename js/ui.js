(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppUI = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function kbPanelMarkup(step) {
    if (step === 'kb-choose') {
      return (
        '<div class="kap-btns">' +
          '<button class="kap-btn" onclick="showKbAddPanel(\'kb-text\')"><span class="kap-icon">📝</span><span>' + I18n.t('addManually') + '</span></button>' +
          '<button class="kap-btn" onclick="showKbAddPanel(\'kb-file\')"><span class="kap-icon">📎</span><span>' + I18n.t('uploadFile') + '</span></button>' +
          '<button class="kap-btn" onclick="showKbAddPanel(\'kb-link\')"><span class="kap-icon">🔗</span><span>' + I18n.t('addByUrl') + '</span></button>' +
        '</div>' +
        '<div class="kap-hint-row">' +
          '<span class="kap-hint">Файл = PDF/DOCX/TXT · Ссылка = сайт · Текст = вставить вручную</span>' +
          '<button class="kap-help-btn" onclick="showInfoPopover(\'kb_add_flow\')">ℹ️ ' + I18n.t('howItWorks') + '</button>' +
        '</div>' +
        '<span class="kap-back-link" onclick="hideKbAddPanel()">← ' + I18n.t('close') + '</span>'
      );
    }

    if (step === 'kb-file') {
      return (
        '<div class="kap-status-bar kap-pending"><span>📎</span><span>' + I18n.t('uploadFile') + ' (PDF, DOCX, TXT)…</span></div>' +
        '<span class="kap-back-link" onclick="showKbAddPanel(\'kb-choose\')">← ' + I18n.t('cancel') + '</span>'
      );
    }

    if (step === 'kb-link') {
      return (
        '<input type="url" id="kap-link-input" class="kap-url-input" placeholder="https://example.com" oninput="_kbLinkChange()">' +
        '<div class="kap-actions-row">' +
          '<button class="kap-submit-btn" id="kap-link-submit" onclick="_kbAddLink()" disabled>' + I18n.t('add') + ' →</button>' +
        '</div>' +
        '<span class="kap-back-link" onclick="showKbAddPanel(\'kb-choose\')">← ' + I18n.t('cancel') + '</span>'
      );
    }

    if (step === 'kb-text') {
      return (
        '<textarea id="kap-text-input" class="kap-textarea" placeholder="' + I18n.t('sourceTextPlaceholder') + '" rows="4"></textarea>' +
        '<div class="kap-actions-row">' +
          '<button class="kap-submit-btn" onclick="_kbAddText()">' + I18n.t('save') + ' →</button>' +
        '</div>' +
        '<span class="kap-back-link" onclick="showKbAddPanel(\'kb-choose\')">← ' + I18n.t('cancel') + '</span>'
      );
    }

    return '';
  }

  function kbDoneMarkup(icon, line1, againLabel, againStep) {
    return (
      '<div class="kap-status-bar kap-success"><span>' + escHtml(icon) + '</span><span>' + escHtml(line1) + '</span></div>' +
      '<div class="kap-done-row">' +
        '<button class="kap-ghost-btn" onclick="showKbAddPanel(\'' + escHtml(againStep) + '\')">' + escHtml(againLabel) + '</button>' +
        '<button class="kap-primary-btn" onclick="hideKbAddPanel()">' + I18n.t('done') + ' ✓</button>' +
      '</div>'
    );
  }

  function kbUploadingMarkup(filename) {
    return '<div class="kap-status-bar kap-pending"><span>📎</span><span>' + escHtml(filename) + ' — ' + I18n.t('loading') + '</span></div>';
  }

  function setProviderTestStatus(span, text, cssVar) {
    if (!span) return;
    span.textContent = text;
    if (cssVar) span.style.color = cssVar;
  }

  function renderAutoRepliesHtml(rules) {
    if (!rules || !rules.length) {
      return '<div class="empty-state" style="padding:30px;"><div class="empty-icon">⚡</div><div class="empty-sub">' + I18n.t('noData') + '. ' + I18n.t('addFirstSource') + '.</div></div>';
    }

    return rules.map(function (r, i) {
      var matchText = r && r.matchType === 'exact' ? I18n.t('exactMatch') : I18n.t('containsMatch');
      var disabledBadge = r && !r.enabled
        ? '<span style="font-size:0.6rem;background:#fef2f2;border:1px solid #fecaca;border-radius:5px;padding:1px 6px;color:#ef4444;">' + I18n.t('disable') + '</span>'
        : '';
      return (
        '<div class="rules-card" style="padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
              '<span style="font-size:0.78rem;font-weight:700;color:var(--text);">' + escHtml((r && r.keyword) || '') + '</span>' +
              '<span style="font-size:0.6rem;background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:1px 6px;color:var(--text-dim);">' + escHtml(matchText) + '</span>' +
              disabledBadge +
            '</div>' +
            '<div style="font-size:0.75rem;color:var(--text-sec);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml((r && r.response) || '') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-shrink:0;">' +
            '<button class="chat-ctrl-btn" onclick="toggleAutoReply(' + i + ')">' + (r && r.enabled ? I18n.t('disable') : I18n.t('enable')) + '</button>' +
            '<button class="chat-ctrl-btn" onclick="showAddAutoReply(' + i + ')">✏️</button>' +
            '<button class="chat-ctrl-btn" style="color:var(--red);" onclick="deleteAutoReply(' + i + ')">🗑️</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  return {
    escHtml: escHtml,
    kbPanelMarkup: kbPanelMarkup,
    kbDoneMarkup: kbDoneMarkup,
    kbUploadingMarkup: kbUploadingMarkup,
    setProviderTestStatus: setProviderTestStatus,
    renderAutoRepliesHtml: renderAutoRepliesHtml,
  };
});
