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

      const result = await Api.post('/auth/verify', { token: _accessToken });

      if (result && result.success) {
        _user = result.data;
        sessionStorage.setItem('ct_user', JSON.stringify(_user));
        // Redirect ไป pages/ ซึ่งอยู่ใน subfolder เดียวกับ index.html
        window.location.href = 'pages/dashboard.html';
      } else {
        // ล้าง token ออกถ้าไม่มีสิทธิ์
        sessionStorage.removeItem('ct_token');
        _showError((result && result.message) || 'ไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      }
    } catch (e) {
      sessionStorage.removeItem('ct_token');
      console.error('Auth error:', e);
      // แยกข้อความ error ให้ชัดเจน
      const msg = e.message.includes('non-JSON')
        ? 'Apps Script URL ไม่ถูกต้อง หรือยังไม่ได้ Deploy — กรุณาตรวจ config.js'
        : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ (ตรวจ Console สำหรับรายละเอียด)';
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
    window.location.href = '/index.html';
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
    const el = document.getElementById('error-msg');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    else alert(msg);
  }

  return { init, login, logout, getToken, getUser, requireAuth, requireRole };
})();

// ใช้ใน index.html
function handleLogin() { Auth.login(); }
