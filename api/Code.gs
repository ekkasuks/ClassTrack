/**
 * @fileoverview ClassTrack — Google Apps Script Backend
 * @description REST API สำหรับ Web App บน GitHub Pages
 *              ทุก request ผ่าน doGet / doPost แล้ว route ไปยัง handler
 * @version 1.0.0
 */

// ══════════════════════════════════════════════════════════
// CONFIGURATION — แก้ไขค่าเหล่านี้ก่อน deploy
// ══════════════════════════════════════════════════════════
const GAS_CONFIG = {
  /** @type {string} ID ของ Google Spreadsheet (ดูจาก URL) */
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',

  /** @type {string} Google Drive Folder ID สำหรับเก็บรูป */
  UPLOAD_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE',

  /** @type {string} Cache duration in seconds (6 ชั่วโมง) */
  CACHE_TTL: 21600,

  /** @type {string} Allowed origins (GitHub Pages URL ของคุณ) */
  ALLOWED_ORIGIN: 'https://YOUR_USERNAME.github.io',
};

// ══════════════════════════════════════════════════════════
// CORS HEADERS
// ══════════════════════════════════════════════════════════

/**
 * สร้าง response พร้อม CORS headers
 * @param {Object} data
 * @param {number} [statusCode=200]
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function _jsonResponse(data) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * สร้าง success response
 * @param {*} data
 * @param {string} [message]
 */
function _ok(data, message = 'success') {
  return _jsonResponse({ success: true, message, data });
}

/**
 * สร้าง error response
 * @param {string} message
 * @param {number} [code=400]
 */
function _err(message, code = 400) {
  return _jsonResponse({ success: false, message, code, data: null });
}

// ══════════════════════════════════════════════════════════
// ROUTER — doGet / doPost
// ══════════════════════════════════════════════════════════

/**
 * HTTP GET handler — อ่านข้อมูล
 * @param {GoogleAppsScript.Events.DoGet} e
 */
function doGet(e) {
  try {
    const action = (e.parameter.action || '').replace(/\//g, '_');
    const params = e.parameter;

    // ตรวจ token ก่อนทุก request (ยกเว้น health check)
    if (action !== 'health') {
      const authResult = AuthService.verifyToken(params.token || params.Authorization);
      if (!authResult.valid) return _err('Unauthorized: ' + authResult.reason, 401);
    }

    const routes = {
      'health':                 () => _ok({ status: 'ok', time: new Date().toISOString() }),
      'auth_verify':            () => _ok(AuthService.verifyAndGetUser(params.token)),
      'config':                 () => _ok(ConfigService.getAll()),
      'classes':                () => _ok(ClassService.list()),
      'students':               () => _ok(StudentService.list(params.class_id)),
      'students_export':        () => _ok(StudentService.exportUrl(params.class_id)),
      'subjects':               () => _ok(SubjectService.list()),
      'assignments':            () => _ok(AssignmentService.list(params)),
      'assignment_byDate':      () => _ok(AssignmentService.byDate(params.due)),
      'assignment_detail':      () => _ok(AssignmentService.detail(params.assign_id)),
      'submission_list':        () => _ok(SubmissionService.list(params.assign_id)),
      'report_summary':         () => _ok(ReportService.summary(params)),
      'report_student':         () => _ok(ReportService.byStudent(params)),
      'report_exportExcel':     () => _ok(ReportService.exportExcel(params)),
      'report_exportPDF':       () => _ok(ReportService.exportPDF(params)),
      'admins':                 () => _ok(AdminService.list()),
      'audit':                  () => _ok(AuditService.recent(parseInt(params.limit) || 20)),
    };

    const handler = routes[action];
    if (!handler) return _err(`Unknown action: ${action}`, 404);
    return handler();

  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return _err('Internal Server Error: ' + err.message, 500);
  }
}

/**
 * HTTP POST handler — เขียนข้อมูล
 * @param {GoogleAppsScript.Events.DoPost} e
 */
function doPost(e) {
  try {
    const action = (e.parameter.action || '').replace(/\//g, '_');
    const body   = JSON.parse(e.postData.contents || '{}');

    // ตรวจ token
    const token = body.token || e.parameter.token;
    const authResult = AuthService.verifyToken(token);
    if (action !== 'auth_verify' && !authResult.valid) {
      return _err('Unauthorized: ' + authResult.reason, 401);
    }

    const userEmail = authResult.email || '';

    const routes = {
      'auth_verify':            () => _ok(AuthService.verifyAndGetUser(body.token)),
      'config_update':          () => { AdminService.requireAdmin(userEmail); return _ok(ConfigService.update(body, userEmail)); },
      'classes_add':            () => { AdminService.requireAdmin(userEmail); return _ok(ClassService.add(body, userEmail)); },
      'classes_update':         () => { AdminService.requireAdmin(userEmail); return _ok(ClassService.update(body, userEmail)); },
      'students_add':           () => _ok(StudentService.add(body, userEmail)),
      'students_update':        () => _ok(StudentService.update(body, userEmail)),
      'students_delete':        () => _ok(StudentService.softDelete(body.student_id, userEmail)),
      'students_import':        () => _ok(StudentService.importRows(body.rows, userEmail)),
      'assignment_create':      () => _ok(AssignmentService.create(body, userEmail)),
      'assignment_update':      () => _ok(AssignmentService.update(body, userEmail)),
      'assignment_delete':      () => _ok(AssignmentService.remove(body.assign_id, userEmail)),
      'assignment_copy':        () => _ok(AssignmentService.copy(body.assign_id, userEmail)),
      'submission_updateOne':   () => _ok(SubmissionService.updateOne(body, userEmail)),
      'submission_bulkUpdate':  () => _ok(SubmissionService.bulkUpdate(body, userEmail)),
      'upload_image':           () => _ok(UploadService.uploadImage(body, userEmail)),
      'admins_add':             () => { AdminService.requireAdmin(userEmail); return _ok(AdminService.add(body, userEmail)); },
      'admins_remove':          () => { AdminService.requireAdmin(userEmail); return _ok(AdminService.remove(body.email, userEmail)); },
      'subjects_add':           () => { AdminService.requireAdmin(userEmail); return _ok(SubjectService.add(body, userEmail)); },
    };

    const handler = routes[action];
    if (!handler) return _err(`Unknown action: ${action}`, 404);
    return handler();

  } catch (err) {
    Logger.log('doPost error: ' + err.message + '\n' + err.stack);
    return _err('Internal Server Error: ' + err.message, 500);
  }
}
