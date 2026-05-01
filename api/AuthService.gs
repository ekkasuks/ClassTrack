/**
 * @fileoverview AuthService — ตรวจสอบ Google OAuth Token และสิทธิ์ผู้ใช้
 * @description แก้ไข:
 *   - cacheKey ใช้ MD5 hash แทน base64 (ปลอดภัยกว่า ไม่มีอักขระพิเศษ)
 *   - active check รองรับทั้ง string 'TRUE' และ boolean true
 *   - เพิ่ม AUDIT log เมื่อ login สำเร็จ
 *   - Logger.log ละเอียดขึ้นสำหรับ debug
 */

const AuthService = (() => {

  const TOKEN_INFO_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=';

  /**
   * ตรวจสอบ access_token กับ Google API
   * @param {string} token
   * @returns {{ valid: boolean, email: string, reason?: string }}
   */
  function verifyToken(token) {
    if (!token || token === 'undefined' || token === 'null') {
      return { valid: false, reason: 'No token provided' };
    }

    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    if (!cleanToken) return { valid: false, reason: 'Empty token' };

    // cacheKey ใช้ MD5 hash — ไม่มีอักขระพิเศษ ไม่ชน
    const cache    = CacheService.getScriptCache();
    const hashBytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      cleanToken,
      Utilities.Charset.UTF_8
    );
    const cacheKey = 'tok_' + hashBytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').slice(0, 24);

    const cached = cache.get(cacheKey);
    if (cached) {
      Logger.log('[AuthService] cache hit for token');
      return JSON.parse(cached);
    }

    try {
      Logger.log('[AuthService] verifying token with Google...');
      const res  = UrlFetchApp.fetch(TOKEN_INFO_URL + encodeURIComponent(cleanToken), {
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      const text = res.getContentText();
      const info = JSON.parse(text);

      Logger.log('[AuthService] tokeninfo response code: ' + code);

      if (code !== 200 || info.error) {
        const reason = info.error_description || info.error || 'Invalid token (code ' + code + ')';
        Logger.log('[AuthService] token invalid: ' + reason);
        return { valid: false, reason };
      }

      if (!info.email) {
        Logger.log('[AuthService] token valid but no email field: ' + text);
        return { valid: false, reason: 'Token has no email — scope openid email required' };
      }

      const result = { valid: true, email: info.email };
      cache.put(cacheKey, JSON.stringify(result), 300); // cache 5 นาที
      Logger.log('[AuthService] token valid, email: ' + info.email);
      return result;

    } catch (e) {
      Logger.log('[AuthService] verifyToken exception: ' + e.message);
      return { valid: false, reason: 'Token verification failed: ' + e.message };
    }
  }

  /**
   * ตรวจ token + ค้นหา user จาก Sheet + log การ login
   * @param {string} token
   * @returns {{ email: string, name: string, role: string }}
   */
  function verifyAndGetUser(token) {
    const tokenResult = verifyToken(token);
    if (!tokenResult.valid) {
      throw new Error('Unauthorized: ' + tokenResult.reason);
    }

    const email = (tokenResult.email || '').toLowerCase().trim();
    Logger.log('[AuthService] looking up email: ' + email);

    // ค้นหาใน ADMINS — active รองรับทั้ง string 'TRUE' และ boolean true
    const admin = SheetService.findOne('ADMINS', 'email', email);
    Logger.log('[AuthService] admin lookup result: ' + JSON.stringify(admin));

    if (admin && _isActive(admin.active)) {
      const user = { email, name: _getName(email, admin.name), role: admin.role || 'ADMIN' };
      _logLogin(email, user.role);
      return user;
    }

    // ค้นหาใน TEACHERS
    const teacher = SheetService.findOne('TEACHERS', 'email', email);
    Logger.log('[AuthService] teacher lookup result: ' + JSON.stringify(teacher));

    if (teacher && _isActive(teacher.active)) {
      const user = { email, name: _getName(email, teacher.name), role: 'TEACHER' };
      _logLogin(email, user.role);
      return user;
    }

    // ไม่พบ — log ด้วยเพื่อ debug
    Logger.log('[AuthService] email not found in ADMINS or TEACHERS: ' + email);
    throw new Error('ไม่มีสิทธิ์เข้าใช้งาน: ' + email);
  }

  /**
   * ตรวจ active field — รองรับ string 'TRUE'/'true' และ boolean true
   * @param {*} val
   * @returns {boolean}
   */
  function _isActive(val) {
    if (val === true) return true;
    if (typeof val === 'string') return val.toUpperCase() === 'TRUE';
    return false;
  }

  /**
   * หาชื่อ user จาก name field หรือ email prefix
   * @param {string} email
   * @param {string} [nameField]
   * @returns {string}
   */
  function _getName(email, nameField) {
    if (nameField && String(nameField).trim()) return String(nameField).trim();
    return email.split('@')[0];
  }

  /**
   * บันทึก AUDIT_LOG เมื่อ login สำเร็จ
   * @param {string} email
   * @param {string} role
   */
  function _logLogin(email, role) {
    try {
      AuditService.log(email, 'LOGIN', email, 'role=' + role);
    } catch(e) {
      Logger.log('[AuthService] audit log failed: ' + e.message);
    }
  }

  return { verifyToken, verifyAndGetUser };
})();
