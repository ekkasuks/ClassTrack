/**
 * @fileoverview Shared UI utilities — Toast, Modal, Loading, Table helpers
 * @module UI
 */

const UI = (() => {

  // ─── Toast Notifications ──────────────────────────
  let _toastContainer = null;

  function _ensureToastContainer() {
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.id = 'toast-container';
      Object.assign(_toastContainer.style, {
        position: 'fixed', top: '20px', right: '20px',
        zIndex: '9999', display: 'flex', flexDirection: 'column', gap: '10px',
      });
      document.body.appendChild(_toastContainer);
    }
  }

  /**
   * แสดง Toast notification
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} duration ms
   */
  function toast(message, type = 'info', duration = 3500) {
    _ensureToastContainer();
    const colors = {
      success: '#10b981', error: '#ef4444',
      warning: '#f59e0b', info: '#1a56db',
    };
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

    const el = document.createElement('div');
    el.style.cssText = `
      background:white; border-left:4px solid ${colors[type]};
      border-radius:10px; padding:14px 18px; min-width:260px; max-width:380px;
      box-shadow:0 8px 24px rgba(0,0,0,0.12);
      display:flex; align-items:center; gap:10px;
      font-family:'Sarabun',sans-serif; font-size:14.5px; color:#1e293b;
      animation:toastIn 0.3s cubic-bezier(0.16,1,0.3,1);
    `;
    el.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;

    if (!document.getElementById('toast-styles')) {
      const s = document.createElement('style');
      s.id = 'toast-styles';
      s.textContent = `
        @keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes toastOut { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(20px)} }
      `;
      document.head.appendChild(s);
    }

    _toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ─── Loading Overlay ──────────────────────────────
  /**
   * แสดง/ซ่อน global loading overlay
   * @param {boolean} show
   * @param {string} [text]
   */
  function loading(show, text = 'กำลังโหลด...') {
    let el = document.getElementById('global-loading');
    if (!el) {
      el = document.createElement('div');
      el.id = 'global-loading';
      el.innerHTML = `
        <div style="text-align:center">
          <div class="spinner" style="margin:0 auto 14px"></div>
          <div id="loading-text" style="font-size:15px;color:#64748b;font-family:Sarabun,sans-serif"></div>
        </div>
      `;
      Object.assign(el.style, {
        display: 'none', position: 'fixed', inset: '0', zIndex: '8888',
        background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(4px)',
        alignItems: 'center', justifyContent: 'center',
      });
      document.body.appendChild(el);
    }
    el.querySelector('#loading-text').textContent = text;
    el.style.display = show ? 'flex' : 'none';
  }

  // ─── Confirm Dialog ───────────────────────────────
  /**
   * Custom confirm dialog (แทน window.confirm)
   * @param {string} message
   * @param {string} [confirmText]
   * @returns {Promise<boolean>}
   */
  function confirm(message, confirmText = 'ยืนยัน') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.45);
        display:flex;align-items:center;justify-content:center;
        animation:fadeIn 0.15s ease;
      `;
      overlay.innerHTML = `
        <div style="background:white;border-radius:18px;padding:32px;max-width:380px;width:90%;
                    box-shadow:0 20px 60px rgba(0,0,0,0.2);font-family:Sarabun,sans-serif;text-align:center">
          <div style="font-size:36px;margin-bottom:12px">⚠️</div>
          <div style="font-size:16px;color:#1e293b;line-height:1.6;margin-bottom:24px">${message}</div>
          <div style="display:flex;gap:12px;justify-content:center">
            <button id="dlg-cancel" style="padding:10px 24px;border:2px solid #e2e8f0;border-radius:10px;
              background:white;cursor:pointer;font-size:15px;font-family:Sarabun,sans-serif;color:#64748b">ยกเลิก</button>
            <button id="dlg-confirm" style="padding:10px 24px;border:none;border-radius:10px;
              background:#ef4444;cursor:pointer;font-size:15px;font-family:Sarabun,sans-serif;
              color:white;font-weight:600">${confirmText}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('#dlg-cancel').onclick = () => { overlay.remove(); resolve(false); };
      overlay.querySelector('#dlg-confirm').onclick = () => { overlay.remove(); resolve(true); };
    });
  }

  // ─── Modal ────────────────────────────────────────
  /**
   * เปิด/ปิด Bootstrap modal
   * @param {string} id - modal element id
   * @param {boolean} show
   */
  function modal(id, show) {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof bootstrap !== 'undefined') {
      const m = bootstrap.Modal.getOrCreateInstance(el);
      show ? m.show() : m.hide();
    }
  }

  // ─── Table Builder ────────────────────────────────
  /**
   * สร้าง HTML ตารางจากข้อมูล
   * @param {string[]} headers
   * @param {Array<string[]>} rows
   * @param {string} [tableClass]
   * @returns {string} HTML string
   */
  function buildTable(headers, rows, tableClass = '') {
    const ths = headers.map(h => `<th>${h}</th>`).join('');
    const trs = rows.map(row =>
      `<tr>${row.map(cell => `<td>${cell ?? ''}</td>`).join('')}</tr>`
    ).join('');
    return `
      <div class="table-responsive">
        <table class="table table-hover align-middle ${tableClass}">
          <thead class="table-light"><tr>${ths}</tr></thead>
          <tbody>${trs || '<tr><td colspan="100%" class="text-center text-muted py-4">ไม่มีข้อมูล</td></tr>'}</tbody>
        </table>
      </div>
    `;
  }

  // ─── Status Badge ─────────────────────────────────
  /**
   * แปลง status code เป็น badge HTML
   * @param {string} status
   * @returns {string} HTML badge
   */
  function statusBadge(status) {
    const map = {
      SENT:     { cls: 'success', label: '✅ ส่งแล้ว' },
      NOT_SENT: { cls: 'danger',  label: '❌ ไม่ส่ง' },
      LATE:     { cls: 'warning', label: '🟡 ส่งช้า' },
      EXCUSED:  { cls: 'primary', label: '🟦 ลา/ยกเว้น' },
    };
    const s = map[status] || { cls: 'secondary', label: status };
    return `<span class="badge bg-${s.cls} bg-opacity-15 text-${s.cls} border border-${s.cls} border-opacity-25"
              style="font-size:12.5px;padding:5px 10px;border-radius:20px;font-family:Sarabun,sans-serif">${s.label}</span>`;
  }

  // ─── Date Formatter ───────────────────────────────
  /**
   * Format ISO date เป็น Thai locale
   * @param {string} isoStr
   * @returns {string}
   */
  function formatDate(isoStr) {
    if (!isoStr) return '-';
    return new Date(isoStr).toLocaleDateString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  /**
   * Format ISO datetime
   * @param {string} isoStr
   * @returns {string}
   */
  function formatDateTime(isoStr) {
    if (!isoStr) return '-';
    return new Date(isoStr).toLocaleString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // ─── Render User Info ─────────────────────────────
  /** แสดงชื่อ user ใน navbar */
  function renderUserInfo() {
    const user = Auth.getUser();
    if (!user) return;
    const el = document.getElementById('user-name');
    const rl = document.getElementById('user-role');
    if (el) el.textContent = user.name;
    if (rl) rl.textContent = user.role === 'ADMIN' ? '👑 Admin' : '👨‍🏫 ครู';
  }


  /**
   * ป้องกัน XSS — escape HTML entities ทุก user-generated string
   * @param {*} str
   * @returns {string}
   */
  function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return { toast, loading, confirm, modal, buildTable, statusBadge, formatDate, formatDateTime, renderUserInfo, escHtml };
})();
