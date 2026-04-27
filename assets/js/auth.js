/**
 * @fileoverview Authentication module using Google Identity Services (OAuth2 TokenClient)
 * @module auth
 * @description
 *  - ใช้ Access Token (OAuth2) สำหรับ verify กับ backend (AuthService.tokeninfo?access_token=)
 *  - เก็บ token/user ใน sessionStorage
 *  - รองรับ GitHub Pages (relative redirect)
 */

const Auth = (() => {
  /** @type {string|null} */
  let _accessToken = null;

  /** @type {number|null} */
  let _tokenExpiry = null;

  /** @type {Object|null} */
  let _user = null;

  /** @type {google.accounts.oauth2.TokenClient|null} */
  let _tokenClient = null;

  /**
   * เริ่มต้น Google Identity Services
   */
  function init() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      console.error('[Auth] Google Identity Services not loaded');
      return;
    }

    if (!CONFIG || !CONFIG.GOOGLE_CLIENT_ID) {
      console.error('[Auth] CONFIG.GOOGLE_CLIENT_ID missing');
      _showError('CONFIG.GOOGLE_CLIENT_ID ไม่ถูกต้อง (ตรวจ assets/js/config.js)');
      return;
    }

    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,

      // ✅ ต้องมี userinfo.email เพื่อให้ tokeninfo คืน email แน่นอน
      scope: 'openid profile email https://www.googleapis.com/auth/userinfo.email',

      callback: _handleTokenResponse,
    });

    console.log('[Auth] TokenClient initialized');
  }

  /**
   * callback หลังจาก Google ส่ง token กลับมา
   * @param {google.accounts.oauth2.TokenResponse} resp
   * @private
   */
  async function _handleTokenResponse(resp) {
    if (!resp) {
      _showError('Google ไม่ได้ส่ง token กลับมา');
      return;
    }

    if (resp.error) {
      console.error('[Auth] Token error:', resp.error, resp);
      _showError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + resp.error);
      return;
    }

    if (!resp.access_token) {
      console.error('[Auth] No access_token in response:', resp);
      _showError('ไม่พบ access_token จาก Google');
      return;
    }

    _accessToken = resp.access_token;

    const buffer = (CONFIG && CONFIG.TOKEN_EXPIRY_BUFFER) ? CONFIG.TOKEN_EXPIRY_BUFFER : 60000;
    _tokenExpiry = Date.now() + (resp.expires_in * 1000) - buffer;

    _showLoading(true);

    try {
      // เก็บ token ไว้ก่อน
      sessionStorage.setItem('ct_token', _accessToken);

      // เรียก backend verify
      // ⚠️ Api.post() จะ inject token ให้เองอยู่แล้ว
      // แต่ใส่ token ไปด้วยก็ไม่เสียหาย (เพื่อความชัดเจน)
      const result = await Api.post('/auth/verify', { token: _accessToken });

      if (result && result.success) {
        _user = result.data;

        sessionStorage.setItem('ct_user', JSON.stringify(_user));

        // ไปหน้า dashboard
        window.location.href = 'pages/dashboard.html';
        return;
      }

      // ไม่มีสิทธิ์
      sessionStorage.removeItem('ct_token');

      const msg = (result && result.message)
        ? result.message
        : 'ไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ';

      _showError(msg);

    } catch (e) {
      sessionStorage.removeItem('ct_token');

      console.error('[Auth] Verify error:', e);

      const msg = (e.message && e.message.includes('non-JSON'))
        ? 'Apps Script URL ไม่ถูกต้อง หรือยังไม่ได้ Deploy (ตรวจ API_BASE_URL ใน config.js)'
        : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่';

      _showError(msg);

    } finally {
      _showLoading(false);
    }
  }

  /**
   * เรียก Google login popup
   */
  function login() {
    if (!_tokenClient) init();

    if (!_tokenClient) {
      _showError('ไม่สามารถเริ่มระบบ Login ได้ (Google Script ไม่โหลด)');
      return;
    }

    _tokenClient.requestAccessToken({
      prompt: 'select_account',
    });
  }

  /**
   * ออกจากระบบ
   */
  function logout() {
    try {
      if (_accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        google.accounts.oauth2.revoke(_accessToken, () => {});
      }
    } catch (e) {
      console.warn('[Auth] revoke failed:', e.message);
    }

    sessionStorage.clear();

    // ✅ ใช้ relative path เพื่อไม่หลุด repo บน GitHub Pages
    window.location.href = '../index.html';
  }

  /**
   * @returns {string|null}
   */
  function getToken() {
    return sessionStorage.getItem('ct_token');
  }

  /**
   * @returns {Object|null}
   */
  function getUser() {
    const raw = sessionStorage.getItem('ct_user');
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * ตรวจว่า login อยู่หรือเปล่า ถ้าไม่ redirect ไป index
   * ใช้ในทุกหน้าที่ต้อง login
   */
  function requireAuth() {
    const token = getToken();
    const user  = getUser();

    if (!token || !user) {
      // หน้า pages/... ให้ย้อนกลับ 1 ชั้น
      window.location.href = '../index.html';
      return null;
    }

    return user;
  }

  /**
   * ตรวจ role ขั้นต่ำ
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

    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    } else {
      alert(msg);
    }
  }

  return { init, login, logout, getToken, getUser, requireAuth, requireRole };
})();

/**
 * ใช้ใน index.html
 */
function handleLogin() {
  Auth.login();
}
