/**
 * @fileoverview ClassTrack — Google Apps Script Backend
 * @description REST API สำหรับ Web App บน GitHub Pages
 *              ทุก request ผ่าน doGet / doPost แล้ว route ไปยัง handler
 * @version 1.1.0
 */

// ⚠️ ต้องแก้ค่าด้านล่างนี้ก่อน Deploy !
const GAS_CONFIG = {
  SPREADSHEET_ID:  'YOUR_SPREADSHEET_ID_HERE',
  UPLOAD_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE',
  CACHE_TTL:       21600,
  ALLOWED_ORIGIN:  'https://YOUR_USERNAME.github.io',
};

// ══════════════════════════════════════════════════════════
// RESPONSE HELPERS
// ══════════════════════════════════════════════════════════

function _jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function _ok(data, message) {
  return _jsonResponse({ success: true, message: message || 'success', data: data });
}

function _err(message, code) {
  return _jsonResponse({ success: false, message: message, code: code || 400, data: null });
}

// ══════════════════════════════════════════════════════════
// PARSE ACTION — รองรับทั้ง slash และ underscore
// เช่น "auth/verify" → "auth_verify", "auth_verify" → "auth_verify"
// ══════════════════════════════════════════════════════════
function _parseAction(raw) {
  return (raw || '').replace(/\//g, '_').toLowerCase();
}

// ══════════════════════════════════════════════════════════
// doGet — อ่านข้อมูล
// ══════════════════════════════════════════════════════════
function doGet(e) {
  try {
    const action = _parseAction(e.parameter.action);
    const params = e.parameter;
    const token  = params.token || '';

    if (action !== 'health') {
      const auth = AuthService.verifyToken(token);
      if (!auth.valid) return _err('Unauthorized: ' + auth.reason, 401);
    }

    const routes = {
      'health':              () => _ok({ status: 'ok', time: new Date().toISOString() }),
      'config':              () => _ok(ConfigService.getAll()),
      'classes':             () => _ok(ClassService.list()),
      'subjects':            () => _ok(SubjectService.list()),
      'students':            () => _ok(StudentService.list(params.class_id)),
      'students_export':     () => _ok(StudentService.exportUrl(params.class_id)),
      'assignments':         () => _ok(AssignmentService.list(params)),
      'assignment_bydate':   () => _ok(AssignmentService.byDate(params.due)),
      'assignment_detail':   () => _ok(AssignmentService.detail(params.assign_id)),
      'submission_list':     () => _ok(SubmissionService.list(params.assign_id)),
      'report_summary':      () => _ok(ReportService.summary(params)),
      'report_student':      () => _ok(ReportService.byStudent(params)),
      'report_exportexcel':  () => _ok(ReportService.exportExcel(params)),
      'report_exportpdf':    () => _ok(ReportService.exportPDF(params)),
      'admins':              () => _ok(AdminService.list()),
      'audit':               () => _ok(AuditService.recent(parseInt(params.limit) || 20)),
    };

    const handler = routes[action];
    if (!handler) return _err('Unknown action: ' + action, 404);
    return handler();

  } catch (err) {
    Logger.log('[doGet] ' + err.message + '\n' + err.stack);
    if (err.message.indexOf('ไม่มีสิทธิ์') !== -1 || err.message.indexOf('Unauthorized') !== -1) {
      return _err(err.message, 401);
    }
    return _err('Server Error: ' + err.message, 500);
  }
}

// ══════════════════════════════════════════════════════════
// doPost — เขียนข้อมูล
// รองรับ Content-Type: text/plain (JSON string ใน postData.contents)
// ══════════════════════════════════════════════════════════
function doPost(e) {
  try {
    // Apps Script รับ JSON body ผ่าน e.postData.contents
    var rawBody = '';
    try { rawBody = e.postData.contents || '{}'; } catch(_) { rawBody = '{}'; }

    var body = {};
    try { body = JSON.parse(rawBody); } catch(parseErr) {
      Logger.log('[doPost] JSON parse error: ' + parseErr.message + ' | raw: ' + rawBody.slice(0,200));
      return _err('Invalid JSON body: ' + parseErr.message, 400);
    }

    const action    = _parseAction(e.parameter.action || body._action || '');
    const token     = body.token || e.parameter.token || '';
    const userEmail = _getEmailFromToken(token, action);

    const routes = {
      'auth_verify':           () => _ok(AuthService.verifyAndGetUser(token)),
      'config_update':         () => { AdminService.requireAdmin(userEmail); return _ok(ConfigService.update(body, userEmail)); },
      'classes_add':           () => { AdminService.requireAdmin(userEmail); return _ok(ClassService.add(body, userEmail)); },
      'classes_update':        () => { AdminService.requireAdmin(userEmail); return _ok(ClassService.update(body, userEmail)); },
      'students_add':          () => _ok(StudentService.add(body, userEmail)),
      'students_update':       () => _ok(StudentService.update(body, userEmail)),
      'students_delete':       () => _ok(StudentService.softDelete(body.student_id, userEmail)),
      'students_import':       () => _ok(StudentService.importRows(body.rows, userEmail)),
      'assignment_create':     () => _ok(AssignmentService.create(body, userEmail)),
      'assignment_update':     () => _ok(AssignmentService.update(body, userEmail)),
      'assignment_delete':     () => _ok(AssignmentService.remove(body.assign_id, userEmail)),
      'assignment_copy':       () => _ok(AssignmentService.copy(body.assign_id, userEmail)),
      'submission_updateone':  () => _ok(SubmissionService.updateOne(body, userEmail)),
      'submission_bulkupdate': () => _ok(SubmissionService.bulkUpdate(body, userEmail)),
      'upload_image':          () => _ok(UploadService.uploadImage(body, userEmail)),
      'admins_add':            () => { AdminService.requireAdmin(userEmail); return _ok(AdminService.add(body, userEmail)); },
      'admins_remove':         () => { AdminService.requireAdmin(userEmail); return _ok(AdminService.remove(body.email, userEmail)); },
      'subjects_add':          () => { AdminService.requireAdmin(userEmail); return _ok(SubjectService.add(body, userEmail)); },
    };

    const handler = routes[action];
    if (!handler) return _err('Unknown action: ' + action, 404);
    return handler();

  } catch (err) {
    Logger.log('[doPost] ' + err.message + '\n' + err.stack);
    // Auth error → 401 ไม่ใช่ 500
    if (err.message.indexOf('ไม่มีสิทธิ์') !== -1 || err.message.indexOf('Unauthorized') !== -1) {
      return _err(err.message, 401);
    }
    return _err('Server Error: ' + err.message, 500);
  }
}

/**
 * ดึง email จาก token — ถ้าเป็น auth_verify ไม่ต้องตรวจ
 * @param {string} token
 * @param {string} action
 * @returns {string}
 */
function _getEmailFromToken(token, action) {
  if (action === 'auth_verify') return '';
  const auth = AuthService.verifyToken(token);
  if (!auth.valid) throw new Error('Unauthorized: ' + auth.reason);
  return auth.email || '';
}
