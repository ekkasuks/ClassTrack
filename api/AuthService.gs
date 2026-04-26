/**
 * @fileoverview AuthService — ตรวจสอบ Google OAuth Token และสิทธิ์ผู้ใช้
 */

const AuthService = (() => {

  const TOKEN_INFO_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=';

  /**
   * ตรวจสอบ token กับ Google API
   * @param {string} token - Bearer token หรือ access_token
   * @returns {{ valid: boolean, email: string, reason?: string }}
   */
  function verifyToken(token) {
    if (!token) return { valid: false, reason: 'No token provided' };

    // Strip "Bearer " prefix ถ้ามี
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();

    // ใช้ CacheService เพื่อลด API call
    const cache     = CacheService.getScriptCache();
    const cacheKey  = 'token_' + Utilities.base64Encode(cleanToken).slice(0, 30);
    const cached    = cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed;
    }

    try {
      const res  = UrlFetchApp.fetch(TOKEN_INFO_URL + encodeURIComponent(cleanToken), {
        muteHttpExceptions: true,
      });
      const info = JSON.parse(res.getContentText());

      if (res.getResponseCode() !== 200 || info.error) {
        return { valid: false, reason: info.error || 'Invalid token' };
      }

      const result = { valid: true, email: info.email };
      // Cache 5 นาที
      cache.put(cacheKey, JSON.stringify(result), 300);
      return result;

    } catch (e) {
      Logger.log('verifyToken error: ' + e.message);
      return { valid: false, reason: 'Token verification failed' };
    }
  }

  /**
   * ตรวจ token และดึงข้อมูล user จาก Sheet
   * @param {string} token
   * @returns {{ email: string, name: string, role: string }}
   */
  function verifyAndGetUser(token) {
    const tokenResult = verifyToken(token);
    if (!tokenResult.valid) throw new Error('Unauthorized');

    const email = tokenResult.email;

    // ค้นหาใน ADMINS ก่อน
    const admin = SheetService.findOne('ADMINS', 'email', email);
    if (admin && admin.active === 'TRUE') {
      return { email, name: email.split('@')[0], role: admin.role || 'ADMIN' };
    }

    // ค้นหาใน TEACHERS
    const teacher = SheetService.findOne('TEACHERS', 'email', email);
    if (teacher && teacher.active === 'TRUE') {
      return { email, name: teacher.name || email.split('@')[0], role: 'TEACHER' };
    }

    throw new Error('ไม่มีสิทธิ์เข้าใช้งาน: ' + email);
  }

  return { verifyToken, verifyAndGetUser };
})();
