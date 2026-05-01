/**
 * @fileoverview ClassTrack — Google Apps Script Backend
 * @version 1.2.0 — แก้ปัญหา token expired + token null
 */

// ⚠️ แก้ค่าเหล่านี้ก่อน Deploy
const GAS_CONFIG = {
  SPREADSHEET_ID:  'YOUR_SPREADSHEET_ID_HERE',
  UPLOAD_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE',
  CACHE_TTL:       21600,
};

// ── Response helpers ───────────────────────────────────────
function _jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
function _ok(data, message)  { return _jsonResponse({ success:true,  message:message||'ok', data:data }); }
function _err(message, code) { return _jsonResponse({ success:false, message:message, code:code||400, data:null }); }
function _parseAction(raw)   { return (raw||'').replace(/\//g,'_').toLowerCase(); }

// ── doGet ──────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = _parseAction(e.parameter.action);
    const params = e.parameter;
    const token  = params.token || '';

    if (action !== 'health') {
      _verifyOrThrow(token, action);
    }

    const userEmail = (action !== 'health') ? _emailFromToken(token) : '';

    const routes = {
      'health':             () => _ok({ status:'ok', time:new Date().toISOString() }),
      'config':             () => _ok(ConfigService.getAll()),
      'classes':            () => _ok(ClassService.list()),
      'subjects':           () => _ok(SubjectService.list()),
      'students':           () => _ok(StudentService.list(params.class_id)),
      'students_export':    () => _ok(StudentService.exportUrl(params.class_id)),
      'assignments':        () => _ok(AssignmentService.list(params)),
      'assignment_bydate':  () => _ok(AssignmentService.byDate(params.due)),
      'assignment_detail':  () => _ok(AssignmentService.detail(params.assign_id)),
      'submission_list':    () => _ok(SubmissionService.list(params.assign_id)),
      'report_summary':     () => _ok(ReportService.summary(params)),
      'report_student':     () => _ok(ReportService.byStudent(params)),
      'report_exportexcel': () => _ok(ReportService.exportExcel(params)),
      'report_exportpdf':   () => _ok(ReportService.exportPDF(params)),
      'admins':             () => _ok(AdminService.list()),
      'audit':              () => _ok(AuditService.recent(parseInt(params.limit)||20)),
    };

    const handler = routes[action];
    if (!handler) return _err('Unknown action: ' + action, 404);
    return handler();

  } catch(err) {
    Logger.log('[doGet] ' + err.message);
    return _errFromException(err);
  }
}

// ── doPost ─────────────────────────────────────────────────
function doPost(e) {
  try {
    var rawBody = '';
    try { rawBody = e.postData.contents || '{}'; } catch(_) { rawBody = '{}'; }

    var body = {};
    try { body = JSON.parse(rawBody); } catch(pe) {
      Logger.log('[doPost] JSON parse error: ' + pe.message + ' raw: ' + rawBody.slice(0,100));
      return _err('Invalid JSON: ' + pe.message, 400);
    }

    // อ่าน action จาก URL param ก่อน ถ้าไม่มีค่อยอ่านจาก body
    const action = _parseAction(
      (e.parameter && e.parameter.action) || body.action || body._action || ''
    );

    Logger.log('[doPost] action=' + action);

    // auth_verify ไม่ต้องตรวจ token
    if (action === 'auth_verify') {
      return _ok(AuthService.verifyAndGetUser(body.token));
    }

    // ── ตรวจ token ──
    // token อยู่ใน body.token (ส่งมาจาก api.js)
    const token = body.token || (e.parameter && e.parameter.token) || '';
    Logger.log('[doPost] token length=' + token.length + ' first10=' + token.slice(0,10));

    const userEmail = _emailFromToken(token);
    Logger.log('[doPost] userEmail=' + userEmail);

    const routes = {
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

  } catch(err) {
    Logger.log('[doPost] ' + err.message + '\n' + err.stack);
    return _errFromException(err);
  }
}

// ── Auth helpers ───────────────────────────────────────────

/**
 * ตรวจ token แล้วคืน email
 * ถ้า token ว่าง / หมดอายุ → throw
 * @param {string} token
 * @returns {string} email
 */
function _emailFromToken(token) {
  // ป้องกัน string "null" "undefined" หรือสั้นเกิน
  if (!token || token === 'null' || token === 'undefined' || token.length < 10) {
    throw new Error('TOKEN_EXPIRED: session หมดอายุ กรุณา Login ใหม่');
  }
  const auth = AuthService.verifyToken(token);
  if (!auth.valid) {
    // แจ้ง frontend ให้ refresh token
    throw new Error('TOKEN_EXPIRED: ' + auth.reason);
  }
  return auth.email || '';
}

function _verifyOrThrow(token, action) {
  if (action === 'auth_verify') return;
  _emailFromToken(token);
}

function _errFromException(err) {
  const msg = err.message || '';
  if (msg.startsWith('TOKEN_EXPIRED')) return _err(msg, 401);
  if (msg.includes('Unauthorized') || msg.includes('สิทธิ์')) return _err(msg, 401);
  return _err('Server Error: ' + msg, 500);
}
