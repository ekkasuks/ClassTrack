/**
 * @fileoverview ClassTrack — Google Apps Script Backend
 * @version 1.3.0
 * @description แก้ปัญหา token verification:
 *   - ตรวจ Google token เฉพาะตอน auth_verify (login) เท่านั้น
 *   - POST อื่นๆ รับ email จาก session โดยตรง ไม่ตรวจ Google ซ้ำ
 *   - ป้องกัน email spoofing ด้วย ADMINS/TEACHERS whitelist
 */

// ⚠️ แก้ค่าเหล่านี้ก่อน Deploy
const GAS_CONFIG = {
  SPREADSHEET_ID:   'YOUR_SPREADSHEET_ID_HERE',
  UPLOAD_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE',
  CACHE_TTL:        21600,
};

// ══════════════════════════════════════
// RESPONSE HELPERS
// ══════════════════════════════════════
function _json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
function _ok(data, msg)  { return _json({ success:true,  message:msg||'ok', data:data }); }
function _err(msg, code) { return _json({ success:false, message:msg, code:code||400, data:null }); }
function _action(raw)    { return (raw||'').replace(/\//g,'_').toLowerCase().trim(); }

// ══════════════════════════════════════
// SESSION VALIDATION
// ตรวจว่า email ที่ส่งมานั้นอยู่ใน whitelist จริง
// ป้องกัน email ปลอมส่งมา
// ══════════════════════════════════════
function _validateSession(email, role) {
  if (!email) throw new Error('Unauthorized: no email in session');

  const normEmail = email.toLowerCase().trim();

  // ตรวจใน ADMINS
  const admin = SheetService.findOne('ADMINS', 'email', normEmail);
  if (admin && String(admin.active).toUpperCase() === 'TRUE') {
    return { email: normEmail, role: admin.role || 'ADMIN', name: normEmail };
  }

  // ตรวจใน TEACHERS
  const teacher = SheetService.findOne('TEACHERS', 'email', normEmail);
  if (teacher && String(teacher.active).toUpperCase() === 'TRUE') {
    return { email: normEmail, role: 'TEACHER', name: teacher.name || normEmail };
  }

  throw new Error('Unauthorized: ' + email + ' ไม่มีสิทธิ์');
}

function _requireAdmin(email) {
  const user = _validateSession(email, '');
  if (user.role !== 'ADMIN') throw new Error('ต้องการสิทธิ์ ADMIN');
  return user;
}

// ══════════════════════════════════════
// doGet
// ══════════════════════════════════════
function doGet(e) {
  try {
    const action = _action(e.parameter.action);
    const p      = e.parameter;

    if (action === 'health') {
      return _ok({ status:'ok', time:new Date().toISOString(), version:'1.3' });
    }

    // GET ทุก request ตรวจ session email
    const email = (p.user_email || '').toLowerCase().trim();
    _validateSession(email, '');

    const routes = {
      'config':             () => _ok(ConfigService.getAll()),
      'classes':            () => _ok(ClassService.list()),
      'subjects':           () => _ok(SubjectService.list()),
      'students':           () => _ok(StudentService.list(p.class_id)),
      'students_export':    () => _ok(StudentService.exportUrl(p.class_id)),
      'assignments':        () => _ok(AssignmentService.list(p)),
      'assignment_bydate':  () => _ok(AssignmentService.byDate(p.due)),
      'assignment_detail':  () => _ok(AssignmentService.detail(p.assign_id)),
      'submission_list':    () => _ok(SubmissionService.list(p.assign_id)),
      'report_summary':     () => _ok(ReportService.summary(p)),
      'report_student':     () => _ok(ReportService.byStudent(p)),
      'report_exportexcel': () => _ok(ReportService.exportExcel(p)),
      'report_exportpdf':   () => _ok(ReportService.exportPDF(p)),
      'admins':             () => _ok(AdminService.list()),
      'audit':              () => _ok(AuditService.recent(parseInt(p.limit)||20)),
    };

    const handler = routes[action];
    if (!handler) return _err('Unknown action: ' + action, 404);
    return handler();

  } catch(err) {
    Logger.log('[doGet] ' + err.message);
    return _errFromEx(err);
  }
}

// ══════════════════════════════════════
// doPost
// ══════════════════════════════════════
function doPost(e) {
  try {
    var rawBody = '';
    try { rawBody = e.postData.contents || '{}'; } catch(_) { rawBody = '{}'; }

    var body = {};
    try {
      body = JSON.parse(rawBody);
    } catch(pe) {
      Logger.log('[doPost] JSON parse error: ' + pe.message);
      return _err('Invalid JSON: ' + pe.message, 400);
    }

    const action = _action(
      (e.parameter && e.parameter.action) || body.action || body._action || ''
    );
    Logger.log('[doPost] action=' + action);

    // ── auth_verify: ตรวจ Google token แล้วคืน user info ──
    if (action === 'auth_verify') {
      const result = AuthService.verifyAndGetUser(body.token);
      AuditService.log(result.email, 'LOGIN', result.email, 'role=' + result.role);
      return _ok(result);
    }

    // ── ทุก action อื่น: ใช้ email จาก session (ไม่ตรวจ Google token) ──
    const email = (body.user_email || '').toLowerCase().trim();
    Logger.log('[doPost] user_email=' + email);

    // ตรวจว่า email อยู่ใน whitelist จริง (ป้องกัน spoofing)
    const sessionUser = _validateSession(email, '');
    const userEmail   = sessionUser.email;

    const routes = {
      'config_update':         () => { _requireAdmin(userEmail); return _ok(ConfigService.update(body, userEmail)); },
      'classes_add':           () => { _requireAdmin(userEmail); return _ok(ClassService.add(body, userEmail)); },
      'classes_update':        () => { _requireAdmin(userEmail); return _ok(ClassService.update(body, userEmail)); },
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
      'admins_add':            () => { _requireAdmin(userEmail); return _ok(AdminService.add(body, userEmail)); },
      'admins_remove':         () => { _requireAdmin(userEmail); return _ok(AdminService.remove(body.email, userEmail)); },
      'subjects_add':          () => { _requireAdmin(userEmail); return _ok(SubjectService.add(body, userEmail)); },
    };

    const handler = routes[action];
    if (!handler) return _err('Unknown action: ' + action, 404);

    const result = handler();
    Logger.log('[doPost] ' + action + ' success for ' + userEmail);
    return result;

  } catch(err) {
    Logger.log('[doPost] ERROR: ' + err.message + '\n' + err.stack);
    return _errFromEx(err);
  }
}

function _errFromEx(err) {
  const msg = err.message || '';
  if (msg.includes('Unauthorized') || msg.includes('สิทธิ์')) return _err(msg, 401);
  return _err('Server Error: ' + msg, 500);
}
