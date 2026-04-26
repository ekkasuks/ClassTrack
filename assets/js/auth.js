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
      _showError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
      return;
    }
    _accessToken = resp.access_token;
    _tokenExpiry = Date.now() + (resp.expires_in * 1000) - CONFIG.TOKEN_EXPIRY_BUFFER;

    _showLoading(true);
    try {
      const result = await Api.post('/auth/verify', { token: _accessToken });
      if (result.success) {
        _user = result.data;
        sessionStorage.setItem('ct_user', JSON.stringify(_user));
        sessionStorage.setItem('ct_token', _accessToken);
        window.location.href = 'pages/dashboard.html';
      } else {
        _showError(result.message || 'ไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      }
    } catch (e) {
      _showError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
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
   */
  function requireAuth() {
    const token = getToken();
    const user = getUser();
    if (!token || !user) {
      window.location.href = '/index.html';
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
