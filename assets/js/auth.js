/**
 * @fileoverview Authentication module — Google Identity Services
 * @description แก้ปัญหา token expired: refresh อัตโนมัติเมื่อ token หมดอายุ
 */

const Auth = (() => {

  let _accessToken  = null;   // Google access token ปัจจุบัน
  let _tokenExpiry  = 0;      // timestamp ที่ token หมดอายุ
  let _user         = null;
  let _tokenClient  = null;   // GIS token client
  let _refreshPromise = null; // ป้องกัน refresh ซ้อนกัน

  // ── Init GIS ────────────────────────────────────────
  function init() {
    if (typeof google === 'undefined' || !google.accounts) return;
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope:     'openid email profile',
      callback:  _handleTokenResponse,
      // prompt ว่าง = ไม่ขึ้น popup ถ้า session ยังอยู่
    });
  }

  // ── Login (เรียกจากปุ่ม) ─────────────────────────────
  function login() {
    if (!_tokenClient) init();
    _tokenClient.requestAccessToken({ prompt: 'select_account' });
  }

  // ── Handle token response ────────────────────────────
  async function _handleTokenResponse(resp) {
    if (resp.error) {
      console.error('[Auth] token error:', resp.error);
      _showError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + resp.error);
      return;
    }

    _accessToken = resp.access_token;
    // expires_in มักเป็น 3600 วินาที (1 ชั่วโมง) หักเผื่อ 5 นาที
    _tokenExpiry = Date.now() + ((resp.expires_in || 3600) * 1000) - (5 * 60 * 1000);

    _showLoading(true, 'กำลังตรวจสอบสิทธิ์...');
    try {
      sessionStorage.setItem('ct_token', _accessToken);
      sessionStorage.setItem('ct_token_expiry', String(_tokenExpiry));

      const result = await Api.post('/auth/verify', { token: _accessToken });
      console.log('[Auth] verify result:', result);

      if (result && result.success) {
        _user = result.data;
        sessionStorage.setItem('ct_user', JSON.stringify(_user));
        window.location.href = 'pages/dashboard.html';
      } else {
        sessionStorage.removeItem('ct_token');
        sessionStorage.removeItem('ct_token_expiry');
        const msg = (result && result.message) || 'ไม่มีสิทธิ์เข้าใช้งาน';
        _showError(msg + '\n\nถ้าเพิ่งเพิ่ม email ใน Sheet ADMINS → รอ 1-2 นาทีแล้ว Login ใหม่');
      }
    } catch(e) {
      sessionStorage.removeItem('ct_token');
      console.error('[Auth] exception:', e);
      let msg = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้\n';
      if (e.message.includes('non-JSON')) msg += '→ Apps Script URL ใน config.js ผิด หรือยังไม่ได้ Deploy';
      else if (e.message.includes('Failed to fetch')) msg += '→ ตรวจ API_BASE_URL ใน config.js';
      else msg += '→ ' + e.message;
      _showError(msg);
    } finally {
      _showLoading(false);
    }
  }

  // ── Silent refresh token (ไม่ขึ้น popup) ────────────
  function _silentRefresh() {
    if (_refreshPromise) return _refreshPromise;
    _refreshPromise = new Promise((resolve, reject) => {
      if (!_tokenClient) init();
      if (!_tokenClient) { reject(new Error('GIS not ready')); return; }

      // override callback ชั่วคราว
      const origCallback = _tokenClient.callback;
      _tokenClient.callback = (resp) => {
        _tokenClient.callback = origCallback; // คืน callback เดิม
        _refreshPromise = null;
        if (resp.error) { reject(new Error(resp.error)); return; }
        _accessToken = resp.access_token;
        _tokenExpiry = Date.now() + ((resp.expires_in||3600)*1000) - (5*60*1000);
        sessionStorage.setItem('ct_token', _accessToken);
        sessionStorage.setItem('ct_token_expiry', String(_tokenExpiry));
        console.log('[Auth] token refreshed silently');
        resolve(_accessToken);
      };
      // prompt:'' = silent refresh ถ้า Google session ยังอยู่
      _tokenClient.requestAccessToken({ prompt: '' });
    });
    return _refreshPromise;
  }

  // ── getToken — คืน token ที่ยัง valid (refresh ถ้าหมดอายุ) ──
  function getToken() {
    return sessionStorage.getItem('ct_token') || null;
  }

  /**
   * ตรวจว่า token หมดอายุหรือยัง
   * @returns {boolean}
   */
  function isTokenExpired() {
    const expiry = parseInt(sessionStorage.getItem('ct_token_expiry') || '0');
    return expiry && Date.now() > expiry;
  }

  /**
   * ดึง token พร้อม refresh อัตโนมัติถ้าหมดอายุ
   * @returns {Promise<string|null>}
   */
  async function getValidToken() {
    if (isTokenExpired()) {
      console.log('[Auth] token expired, refreshing...');
      try {
        const newToken = await _silentRefresh();
        return newToken;
      } catch(e) {
        console.error('[Auth] silent refresh failed:', e.message);
        // refresh ไม่ได้ → ล้าง session แล้ว redirect login
        logout();
        return null;
      }
    }
    return getToken();
  }

  function getUser() {
    try {
      const raw = sessionStorage.getItem('ct_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function requireAuth() {
    const token = getToken();
    const user  = getUser();
    if (!token || !user) {
      const depth = location.pathname.split('/').filter(Boolean).length;
      const back  = depth > 1 ? '../'.repeat(depth - 1) : './';
      window.location.href = back + 'index.html';
      return null;
    }
    return user;
  }

  function requireRole(minRole) {
    const user = requireAuth();
    if (!user) return null;
    const order = ['TEACHER', 'ADMIN'];
    if (order.indexOf(user.role) < order.indexOf(minRole)) {
      alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
      window.location.href = 'dashboard.html';
      return null;
    }
    return user;
  }

  function logout() {
    const t = getToken();
    if (t && typeof google !== 'undefined') {
      try { google.accounts.oauth2.revoke(t, () => {}); } catch(_) {}
    }
    sessionStorage.clear();
    const depth = location.pathname.split('/').filter(Boolean).length;
    const back  = depth > 1 ? '../'.repeat(depth - 1) : './';
    window.location.href = back + 'index.html';
  }

  // ── UI helpers ───────────────────────────────────────
  function _showLoading(show, text) {
    const el = document.getElementById('loading-overlay');
    if (el) {
      el.classList.toggle('active', show);
      if (text) { const t = el.querySelector('.load-text'); if (t) t.textContent = text; }
    }
  }

  function _showError(msg) {
    const el = document.getElementById('error-msg') || document.getElementById('msg');
    if (!el) { alert(msg); return; }
    el.textContent = msg;
    el.style.cssText = 'display:block;background:#fff5f5;border:1px solid #fecaca;color:#991b1b;border-radius:12px;padding:13px 16px;font-size:13.5px;line-height:1.7;white-space:pre-wrap;margin-top:14px';
  }

  return { init, login, logout, getToken, getValidToken, isTokenExpired, getUser, requireAuth, requireRole };
})();

// ── ใช้ใน index.html ────────────────────────────────────────
function handleLogin() { Auth.login(); }
