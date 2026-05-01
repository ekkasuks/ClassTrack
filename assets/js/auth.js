/**
 * @fileoverview Authentication module using Google Identity Services
 * @module auth
 */

const Auth = (() => {
  /** @type {string|null} */
  let _accessToken = null;
  /** @type {number|null} */
  let _tokenExpiry = null;
  /** @type {Object|null} */
  let _user = null;
  /** @type {google.accounts.oauth2.TokenClient} */
  let _tokenClient = null;

  /**
   * เริ่มต้น Google Identity Services
   */
  function init() {
    if (typeof google === 'undefined') {
      console.error('Google Identity Services not loaded');
      return;
    }
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      callback: _handleTokenResponse,
    });
  }

  /**
   * @param {google.accounts.oauth2.TokenResponse} resp
   * @private
   */
  async function _handleTokenResponse(resp) {
    if (resp.error) {
      console.error('Token error:', resp.error);
      _showError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + resp.error);
      return;
    }
    _accessToken = resp.access_token;
    _tokenExpiry = Date.now() + (resp.expires_in * 1000) - CONFIG.TOKEN_EXPIRY_BUFFER;

    _showLoading(true);
    try {
      // เก็บ token ก่อน เพื่อให้ Api.post() ใช้ Auth.getToken() ได้
      sessionStorage.setItem('ct_token', _accessToken);
      console.log('[Auth] token saved, calling /auth/verify...');

      const result = await Api.post('/auth/verify', { token: _accessToken });
      console.log('[Auth] /auth/verify response:', result);

      if (result && result.success) {
        _user = result.data;
        sessionStorage.setItem('ct_user', JSON.stringify(_user));
        console.log('[Auth] login success, user:', _user);
        window.location.href = 'pages/dashboard.html';
      } else {
        sessionStorage.removeItem('ct_token');
        // แสดง error จาก server ตรงๆ เพื่อ debug ง่าย
        const errMsg = (result && result.message) || 'ไม่มีสิทธิ์เข้าใช้งาน';
        console.error('[Auth] server rejected:', errMsg);
        _showError(errMsg + '\n\nถ้าเพิ่ง login ครั้งแรก → ตรวจว่า email ของคุณอยู่ใน Sheet ADMINS แล้ว');
      }
    } catch (e) {
      sessionStorage.removeItem('ct_token');
      console.error('[Auth] exception:', e);
      let msg = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้\n';
      if (e.message.includes('non-JSON')) {
        msg += '→ Apps Script ยังไม่ได้ Deploy หรือ URL ใน config.js ผิด';
      } else if (e.message.includes('Failed to fetch')) {
        msg += '→ ตรวจ API_BASE_URL ใน config.js';
      } else {
        msg += '→ ' + e.message + '\n(เปิด Console กด ⌘+⌥+J เพื่อดูรายละเอียด)';
      }
      _showError(msg);
    } finally {
      _showLoading(false);
    }
  }

  /** เรียก Google login popup */
  function login() {
    if (!_tokenClient) init();
    _tokenClient.requestAccessToken({ prompt: 'select_account' });
  }

  /** ออกจากระบบ */
  function logout() {
    if (_accessToken) {
      google.accounts.oauth2.revoke(_accessToken, () => {});
    }
    sessionStorage.clear();
    const _d = location.pathname.split('/').filter(Boolean).length; window.location.href = (_d > 1 ? '../'.repeat(_d-1) : './') + 'index.html';
  }

  /**
   * @returns {string|null} Access token ปัจจุบัน
   */
  function getToken() {
    return sessionStorage.getItem('ct_token');
  }

  /**
   * @returns {Object|null} ข้อมูล user ปัจจุบัน
   */
  function getUser() {
    const raw = sessionStorage.getItem('ct_user');
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * ตรวจว่า login อยู่หรือเปล่า ถ้าไม่ redirect ไป index
   * ใช้ relative path เพื่อให้ทำงานได้บน GitHub Pages subdirectory
   */
  function requireAuth() {
    const token = getToken();
    const user  = getUser();
    if (!token || !user) {
      // หา root โดย traverse ขึ้นไปจาก path ปัจจุบัน
      const depth = location.pathname.split('/').filter(Boolean).length;
      const back  = depth > 1 ? '../'.repeat(depth - 1) : './';
      window.location.href = back + 'index.html';
      return null;
    }
    return user;
  }

  /**
   * ตรวจสิทธิ์ขั้นต่ำ
   * @param {string} minRole - 'TEACHER' | 'ADMIN'
   */
  function requireRole(minRole) {
    const user = requireAuth();
    if (!user) return null;
    const roles = ['TEACHER', 'ADMIN'];
    if (roles.indexOf(user.role) < roles.indexOf(minRole)) {
      alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
      window.location.href = 'dashboard.html';
      return null;
    }
    return user;
  }

  function _showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.toggle('active', show);
  }

  function _showError(msg) {
    // รองรับทั้ง id='error-msg' (pages) และ id='msg' (index.html)
    const el = document.getElementById('error-msg') || document.getElementById('msg');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      el.style.background = '#fff5f5';
      el.style.border = '1px solid #fecaca';
      el.style.color = '#991b1b';
      el.style.borderRadius = '12px';
      el.style.padding = '13px 16px';
      el.style.fontSize = '13.5px';
      el.style.lineHeight = '1.7';
      el.style.whiteSpace = 'pre-wrap';
    } else {
      alert(msg);
    }
  }

  return { init, login, logout, getToken, getUser, requireAuth, requireRole };
})();

// ใช้ใน index.html
function handleLogin() { Auth.login(); }
