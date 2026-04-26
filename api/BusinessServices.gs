/**
 * @fileoverview Business Logic Services
 * @description ConfigService, ClassService, SubjectService, StudentService,
 *              AssignmentService, SubmissionService, ReportService
 */

// ══════════════════════════════════════════════════════════
// CONFIG SERVICE
// ══════════════════════════════════════════════════════════
const ConfigService = (() => {

  function getAll() {
    const rows = SheetService.getAll('CONFIG');
    const cfg  = {};
    rows.forEach(r => { cfg[r.key] = r.value; });
    return cfg;
  }

  /**
   * @param {Object} updates - { KEY: value, ... }
   * @param {string} userEmail
   */
  function update(updates, userEmail) {
    Object.entries(updates).forEach(([key, value]) => {
      const updated = SheetService.updateRow('CONFIG', 'key', key, { value: SheetService.sanitize(value) });
      if (!updated) SheetService.insertRow('CONFIG', { key, value: SheetService.sanitize(value) });
    });
    AuditService.log(userEmail, 'CONFIG_UPDATE', 'CONFIG', JSON.stringify(updates));
    return { updated: true };
  }

  return { getAll, update };
})();

// ══════════════════════════════════════════════════════════
// CLASS SERVICE
// ══════════════════════════════════════════════════════════
const ClassService = (() => {

  function list() {
    const cache    = CacheService.getScriptCache();
    const cacheKey = 'classes_all';
    const cached   = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const rows = SheetService.getAll('CLASSES').filter(c => c.active === 'TRUE');
    cache.put(cacheKey, JSON.stringify(rows), GAS_CONFIG.CACHE_TTL);
    return rows;
  }

  function add(data, userEmail) {
    _invalidateCache();
    const classId = data.class_id || SheetService.generateId('C');
    const row = {
      class_id:   classId,
      class_name: SheetService.sanitize(data.class_name),
      level:      SheetService.sanitize(data.level || ''),
      room:       SheetService.sanitize(data.room || ''),
      active:     'TRUE',
    };
    SheetService.insertRow('CLASSES', row);
    AuditService.log(userEmail, 'CLASS_ADD', classId, data.class_name);
    return row;
  }

  function update(data, userEmail) {
    _invalidateCache();
    const updates = {};
    if (data.class_name !== undefined) updates.class_name = SheetService.sanitize(data.class_name);
    if (data.level      !== undefined) updates.level      = SheetService.sanitize(data.level);
    if (data.room       !== undefined) updates.room       = SheetService.sanitize(data.room);
    if (data.active     !== undefined) updates.active     = data.active;
    SheetService.updateRow('CLASSES', 'class_id', data.class_id, updates);
    AuditService.log(userEmail, 'CLASS_UPDATE', data.class_id, JSON.stringify(updates));
    return { class_id: data.class_id };
  }

  function _invalidateCache() {
    CacheService.getScriptCache().remove('classes_all');
  }

  return { list, add, update };
})();

// ══════════════════════════════════════════════════════════
// SUBJECT SERVICE
// ══════════════════════════════════════════════════════════
const SubjectService = (() => {

  function list() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('subjects_all');
    if (cached) return JSON.parse(cached);
    const rows = SheetService.getAll('SUBJECTS').filter(s => s.active === 'TRUE');
    cache.put('subjects_all', JSON.stringify(rows), GAS_CONFIG.CACHE_TTL);
    return rows;
  }

  function add(data, userEmail) {
    CacheService.getScriptCache().remove('subjects_all');
    const row = {
      subject_id:   SheetService.sanitize(data.subject_id || SheetService.generateId('SU')),
      subject_name: SheetService.sanitize(data.subject_name),
      active:       'TRUE',
    };
    SheetService.insertRow('SUBJECTS', row);
    AuditService.log(userEmail, 'SUBJECT_ADD', row.subject_id, data.subject_name);
    return row;
  }

  return { list, add };
})();

// ══════════════════════════════════════════════════════════
// STUDENT SERVICE
// ══════════════════════════════════════════════════════════
const StudentService = (() => {

  /**
   * ดึงรายชื่อนักเรียนตาม class_id
   * @param {string} classId
   */
  function list(classId) {
    if (!classId) throw new Error('class_id is required');
    return SheetService.findWhere('STUDENTS', { class_id: classId });
  }

  function add(data, userEmail) {
    _validateStudent(data);
    const studentId = SheetService.generateId('S');
    const row = {
      student_id:   studentId,
      student_code: SheetService.sanitize(data.student_code || ''),
      prefix:       SheetService.sanitize(data.prefix || ''),
      fullname:     SheetService.sanitize(data.fullname),
      class_id:     SheetService.sanitize(data.class_id),
      status:       data.status || 'ACTIVE',
    };
    SheetService.insertRow('STUDENTS', row);
    AuditService.log(userEmail, 'STUDENT_ADD', studentId, data.fullname);
    return row;
  }

  function update(data, userEmail) {
    _validateStudent(data);
    const updates = {
      prefix:       SheetService.sanitize(data.prefix),
      fullname:     SheetService.sanitize(data.fullname),
      student_code: SheetService.sanitize(data.student_code || ''),
      class_id:     SheetService.sanitize(data.class_id),
      status:       data.status || 'ACTIVE',
    };
    SheetService.updateRow('STUDENTS', 'student_id', data.student_id, updates);
    AuditService.log(userEmail, 'STUDENT_UPDATE', data.student_id, data.fullname);
    return { student_id: data.student_id };
  }

  /**
   * Soft delete: เปลี่ยน status เท่านั้น
   * @param {string} studentId
   * @param {string} userEmail
   */
  function softDelete(studentId, userEmail) {
    const student = SheetService.findOne('STUDENTS', 'student_id', studentId);
    if (!student) throw new Error('ไม่พบนักเรียน: ' + studentId);
    const newStatus = student.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    SheetService.updateRow('STUDENTS', 'student_id', studentId, { status: newStatus });
    AuditService.log(userEmail, 'STUDENT_STATUS', studentId, newStatus);
    return { student_id: studentId, status: newStatus };
  }

  /**
   * Import หลาย row จาก CSV
   * @param {Object[]} rows
   * @param {string} userEmail
   */
  function importRows(rows, userEmail) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('ไม่มีข้อมูลที่จะ Import');
    let count = 0;
    rows.forEach(r => {
      try {
        // ตรวจซ้ำด้วย student_code
        if (r.student_code) {
          const existing = SheetService.findWhere('STUDENTS', { student_code: r.student_code, class_id: r.class_id });
          if (existing.length) return; // ข้าม ถ้ามีอยู่แล้ว
        }
        add(r, userEmail);
        count++;
      } catch(e) { Logger.log('Import skip: ' + e.message); }
    });
    AuditService.log(userEmail, 'STUDENT_IMPORT', 'STUDENTS', `Imported ${count} rows`);
    return { imported: count, total: rows.length };
  }

  function exportUrl(classId) {
    // สร้าง temp sheet แล้ว export
    const students = list(classId);
    const ss    = SpreadsheetApp.openById(GAS_CONFIG.SPREADSHEET_ID);
    const temp  = ss.insertSheet('_export_tmp_' + Date.now());
    temp.appendRow(['เลขประจำตัว','คำนำหน้า','ชื่อ-นามสกุล','ชั้น','สถานะ']);
    students.forEach(s => temp.appendRow([s.student_code, s.prefix, s.fullname, s.class_id, s.status]));
    SpreadsheetApp.flush();
    const url = `https://docs.google.com/spreadsheets/d/${GAS_CONFIG.SPREADSHEET_ID}/export?format=xlsx&gid=${temp.getSheetId()}`;
    // ลบ temp sheet หลัง 1 นาที (หรือทันที เพราะ URL ใช้ได้ทันที)
    ss.deleteSheet(temp);
    return { url };
  }

  function _validateStudent(data) {
    if (!data.fullname || !String(data.fullname).trim()) throw new Error('fullname is required');
    if (!data.class_id) throw new Error('class_id is required');
    // ป้องกัน XSS/Injection ใน input
    const dangerPattern = /<script|javascript:|on\w+=/i;
    if (dangerPattern.test(data.fullname)) throw new Error('Invalid characters in fullname');
  }

  return { list, add, update, softDelete, importRows, exportUrl };
})();

// ══════════════════════════════════════════════════════════
// ASSIGNMENT SERVICE
// ══════════════════════════════════════════════════════════
const AssignmentService = (() => {

  /**
   * ดึงงานทั้งหมด พร้อม filter
   * @param {Object} params - { class_id, subject_id, due }
   */
  function list(params) {
    let rows = SheetService.getAll('ASSIGNMENTS');
    if (params.class_id)   rows = rows.filter(a => a.class_id   === params.class_id);
    if (params.subject_id) rows = rows.filter(a => a.subject_id === params.subject_id);
    if (params.due)        rows = rows.filter(a => String(a.due_date).slice(0,10) === params.due);
    return _enrichAssignments(rows);
  }

  /**
   * ดึงงานตามวันที่ due
   * @param {string} dueDate - YYYY-MM-DD
   */
  function byDate(dueDate) {
    if (!dueDate) throw new Error('due date is required');
    const rows = SheetService.findWhere('ASSIGNMENTS', {}).filter(
      a => String(a.due_date).slice(0,10) === dueDate && a.status !== 'DELETED'
    );
    return _enrichAssignments(rows);
  }

  function detail(assignId) {
    const a = SheetService.findOne('ASSIGNMENTS', 'assign_id', assignId);
    if (!a) throw new Error('ไม่พบงาน: ' + assignId);
    return _enrichAssignments([a])[0];
  }

  /**
   * สร้างงานใหม่ + auto-create SUBMISSIONS ทุกคนในห้อง
   * @param {Object} data
   * @param {string} userEmail
   */
  function create(data, userEmail) {
    _validateAssignment(data);
    const assignId = SheetService.generateId('A');
    const now      = new Date().toISOString();
    const row = {
      assign_id:            assignId,
      title:                SheetService.sanitize(data.title),
      detail:               SheetService.sanitize(data.detail || ''),
      class_id:             data.class_id,
      subject_id:           data.subject_id,
      teacher_email:        userEmail,
      assign_date:          data.assign_date || now.slice(0,10),
      due_date:             data.due_date,
      due_time:             data.due_time || '23:59',
      attachment_drive_id:  data.attachment_drive_id || '',
      attachment_url:       data.attachment_url || '',
      created_at:           now,
      status:               'ACTIVE',
    };
    SheetService.insertRow('ASSIGNMENTS', row);

    // Auto-create submission rows สำหรับทุกคนในห้อง
    const students = StudentService.list(data.class_id).filter(s => s.status === 'ACTIVE');
    _createSubmissionsForStudents(assignId, students, userEmail);

    AuditService.log(userEmail, 'ASSIGNMENT_CREATE', assignId, data.title);
    return { assign_id: assignId, submissions_created: students.length };
  }

  function update(data, userEmail) {
    _validateAssignment(data);
    const updates = {
      title:       SheetService.sanitize(data.title),
      detail:      SheetService.sanitize(data.detail || ''),
      class_id:    data.class_id,
      subject_id:  data.subject_id,
      due_date:    data.due_date,
      due_time:    data.due_time || '23:59',
    };
    if (data.attachment_url)      updates.attachment_url      = data.attachment_url;
    if (data.attachment_drive_id) updates.attachment_drive_id = data.attachment_drive_id;
    SheetService.updateRow('ASSIGNMENTS', 'assign_id', data.assign_id, updates);
    AuditService.log(userEmail, 'ASSIGNMENT_UPDATE', data.assign_id, data.title);
    return { assign_id: data.assign_id };
  }

  function remove(assignId, userEmail) {
    SheetService.updateRow('ASSIGNMENTS', 'assign_id', assignId, { status: 'DELETED' });
    AuditService.log(userEmail, 'ASSIGNMENT_DELETE', assignId, '');
    return { assign_id: assignId };
  }

  /**
   * คัดลอกงาน (เปลี่ยน assign_id ใหม่ reset submissions)
   * @param {string} assignId
   * @param {string} userEmail
   */
  function copy(assignId, userEmail) {
    const original = SheetService.findOne('ASSIGNMENTS', 'assign_id', assignId);
    if (!original) throw new Error('ไม่พบงาน: ' + assignId);
    const newData = {
      ...original,
      title:      '[สำเนา] ' + original.title,
      assign_date: new Date().toISOString().slice(0,10),
    };
    delete newData.assign_id;
    delete newData.__rowIndex;
    return create(newData, userEmail);
  }

  /**
   * Enrich assignments ด้วย class_name, subject_name, submit_pct
   * @param {Object[]} assignments
   * @returns {Object[]}
   */
  function _enrichAssignments(assignments) {
    const classes  = ClassService.list();
    const subjects = SubjectService.list();
    const classMap   = Object.fromEntries(classes.map(c  => [c.class_id,   c.class_name]));
    const subjectMap = Object.fromEntries(subjects.map(s => [s.subject_id, s.subject_name]));

    return assignments.map(a => {
      const subs    = SheetService.findWhere('SUBMISSIONS', { assign_id: a.assign_id });
      const sent    = subs.filter(s => s.status !== 'NOT_SENT').length;
      const total   = subs.length;
      const pct     = total ? Math.round(sent / total * 100) : 0;
      return {
        ...a,
        class_name:   classMap[a.class_id]   || a.class_id,
        subject_name: subjectMap[a.subject_id] || a.subject_id,
        submit_pct:   pct,
        total_students: total,
        sent_count:   sent,
        __rowIndex:   undefined,
      };
    });
  }

  function _createSubmissionsForStudents(assignId, students, userEmail) {
    students.forEach(s => {
      const submitId = SheetService.generateId('SB');
      SheetService.insertRow('SUBMISSIONS', {
        submit_id:  submitId,
        assign_id:  assignId,
        student_id: s.student_id,
        status:     'NOT_SENT',
        checked_by: '',
        checked_at: '',
        note:       '',
        submit_time:'',
        late:       'FALSE',
        proof_url:  '',
      });
    });
  }

  function _validateAssignment(data) {
    if (!data.title)      throw new Error('title is required');
    if (!data.class_id)   throw new Error('class_id is required');
    if (!data.subject_id) throw new Error('subject_id is required');
    if (!data.due_date)   throw new Error('due_date is required');
  }

  return { list, byDate, detail, create, update, remove, copy };
})();

// ══════════════════════════════════════════════════════════
// SUBMISSION SERVICE
// ══════════════════════════════════════════════════════════
const SubmissionService = (() => {

  /**
   * ดึง submission รายงานสำหรับการตรวจ (รวมชื่อนักเรียน)
   * @param {string} assignId
   */
  function list(assignId) {
    if (!assignId) throw new Error('assign_id is required');
    const subs     = SheetService.findWhere('SUBMISSIONS', { assign_id: assignId });
    const students = SheetService.getAll('STUDENTS');
    const studentMap = Object.fromEntries(students.map(s => [s.student_id, s]));

    return subs.map(sub => {
      const s = studentMap[sub.student_id] || {};
      return {
        ...sub,
        prefix:   s.prefix   || '',
        fullname: s.fullname  || sub.student_id,
        student_code: s.student_code || '',
        __rowIndex: undefined,
      };
    }).sort((a, b) => (a.student_code || '').localeCompare(b.student_code || ''));
  }

  /**
   * อัพเดตสถานะรายคน
   * @param {Object} data - { assign_id, student_id, status, note }
   * @param {string} userEmail
   */
  function updateOne(data, userEmail) {
    const { assign_id, student_id, status, note } = data;
    if (!assign_id || !student_id) throw new Error('assign_id and student_id are required');

    const validStatuses = ['SENT', 'NOT_SENT', 'LATE', 'EXCUSED'];
    if (!validStatuses.includes(status)) throw new Error('Invalid status: ' + status);

    const now      = new Date().toISOString();
    const assign   = SheetService.findOne('ASSIGNMENTS', 'assign_id', assign_id);
    const isLate   = assign ? _isLate(now, assign.due_date, assign.due_time) : false;

    SheetService.updateRow('SUBMISSIONS', 'submit_id',
      _findSubmitId(assign_id, student_id),
      {
        status:     status,
        note:       SheetService.sanitize(note || ''),
        checked_by: userEmail,
        checked_at: now,
        submit_time: status === 'SENT' ? now : '',
        late:       isLate && status === 'SENT' ? 'TRUE' : 'FALSE',
      }
    );
    AuditService.log(userEmail, 'SUBMISSION_UPDATE', assign_id, `${student_id}→${status}`);
    return { assign_id, student_id, status };
  }

  /**
   * อัพเดตหลาย submission ในครั้งเดียว (bulk save)
   * @param {{ rows: Object[], assign_id: string }} data
   * @param {string} userEmail
   */
  function bulkUpdate(data, userEmail) {
    const { rows, assign_id } = data;
    if (!Array.isArray(rows)) throw new Error('rows must be array');

    const assign = SheetService.findOne('ASSIGNMENTS', 'assign_id', assign_id);
    const now    = new Date().toISOString();

    // อ่าน submission ทั้งหมดครั้งเดียว แล้ว index ด้วย submit_id
    const allSubs = SheetService.getAll('SUBMISSIONS');
    const submitMap = {};
    allSubs.forEach(s => {
      if (s.assign_id === assign_id) {
        submitMap[s.student_id] = s;
      }
    });

    const validStatuses = ['SENT', 'NOT_SENT', 'LATE', 'EXCUSED'];
    rows.forEach(row => {
      if (!validStatuses.includes(row.status)) return;
      const sub = submitMap[row.student_id];
      if (!sub) return;
      const isLate = assign ? _isLate(now, assign.due_date, assign.due_time) : false;
      SheetService.updateRow('SUBMISSIONS', 'submit_id', sub.submit_id, {
        status:     row.status,
        note:       SheetService.sanitize(row.note || ''),
        checked_by: userEmail,
        checked_at: now,
        submit_time: row.status === 'SENT' ? now : '',
        late:       isLate && row.status === 'SENT' ? 'TRUE' : 'FALSE',
      });
    });

    AuditService.log(userEmail, 'SUBMISSION_BULK', assign_id, `${rows.length} rows`);
    return { updated: rows.length };
  }

  function _findSubmitId(assignId, studentId) {
    const sub = SheetService.findWhere('SUBMISSIONS', { assign_id: assignId, student_id: studentId })[0];
    if (!sub) throw new Error(`ไม่พบ submission: ${assignId}/${studentId}`);
    return sub.submit_id;
  }

  /**
   * ตรวจว่าส่งช้าหรือเปล่า
   * @param {string} submitTime - ISO string
   * @param {string} dueDate - YYYY-MM-DD
   * @param {string} dueTime - HH:MM
   */
  function _isLate(submitTime, dueDate, dueTime) {
    try {
      const deadline = new Date(`${dueDate}T${dueTime || '23:59'}:00`);
      return new Date(submitTime) > deadline;
    } catch(e) { return false; }
  }

  return { list, updateOne, bulkUpdate };
})();
