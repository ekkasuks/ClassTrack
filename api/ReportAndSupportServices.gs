/**
 * @fileoverview ReportService — สร้างรายงานและ Export
 */
const ReportService = (() => {

  /**
   * สรุปรายงานหลัก
   * @param {{ class_id, subject_id, from, to }} params
   */
  function summary(params) {
    const { class_id, subject_id, from, to } = params;

    let assignments = SheetService.getAll('ASSIGNMENTS').filter(a => a.status !== 'DELETED');
    if (class_id)   assignments = assignments.filter(a => a.class_id   === class_id);
    if (subject_id) assignments = assignments.filter(a => a.subject_id === subject_id);
    if (from)       assignments = assignments.filter(a => String(a.due_date).slice(0,10) >= from);
    if (to)         assignments = assignments.filter(a => String(a.due_date).slice(0,10) <= to);

    const allSubs      = SheetService.getAll('SUBMISSIONS');
    const allStudents  = SheetService.getAll('STUDENTS');
    const classes      = ClassService.list();
    const classMap     = Object.fromEntries(classes.map(c => [c.class_id, c.class_name]));

    // คำนวณ per-assignment stats
    const assignIds    = new Set(assignments.map(a => a.assign_id));
    const relevantSubs = allSubs.filter(s => assignIds.has(s.assign_id));

    // Group submissions by student
    const studentSubMap = {};
    relevantSubs.forEach(s => {
      if (!studentSubMap[s.student_id]) studentSubMap[s.student_id] = [];
      studentSubMap[s.student_id].push(s);
    });

    // by_class stats
    const classStats = {};
    assignments.forEach(a => {
      if (!classStats[a.class_id]) classStats[a.class_id] = { total: 0, complete: 0, pcts: [] };
      const subs  = relevantSubs.filter(s => s.assign_id === a.assign_id);
      const sent  = subs.filter(s => s.status !== 'NOT_SENT').length;
      const total = subs.length;
      const pct   = total ? Math.round(sent/total*100) : 0;
      classStats[a.class_id].total++;
      if (pct === 100) classStats[a.class_id].complete++;
      classStats[a.class_id].pcts.push(pct);
    });

    const by_class = Object.entries(classStats).map(([cid, s]) => ({
      class_id:             cid,
      class_name:           classMap[cid] || cid,
      total_assignments:    s.total,
      complete_assignments: s.complete,
      avg_pct:              s.pcts.length ? Math.round(s.pcts.reduce((a,b)=>a+b,0)/s.pcts.length) : 0,
    }));

    // by_student stats
    const by_student = allStudents
      .filter(s => s.status === 'ACTIVE' && (!class_id || s.class_id === class_id))
      .map(s => {
        const subs      = studentSubMap[s.student_id] || [];
        const relevant  = subs.filter(sub => assignIds.has(sub.assign_id));
        const sent      = relevant.filter(sub => sub.status === 'SENT').length;
        const late      = relevant.filter(sub => sub.status === 'LATE').length;
        const not_sent  = relevant.filter(sub => sub.status === 'NOT_SENT').length;
        const total     = relevant.length;
        const pct       = total ? Math.round((sent+late)/total*100) : 0;
        return {
          student_id:  s.student_id,
          fullname:    s.prefix + s.fullname,
          class_name:  classMap[s.class_id] || s.class_id,
          sent, late, not_sent,
          submit_pct:  pct,
          total_assignments: total,
        };
      });

    const at_risk = by_student
      .filter(s => s.submit_pct < 50 && s.total_assignments > 0)
      .map(s => ({ ...s, pending_count: s.not_sent }))
      .sort((a,b) => a.submit_pct - b.submit_pct);

    const top_students = by_student.filter(s => s.submit_pct === 100).length;
    const allPcts      = by_student.map(s => s.submit_pct);
    const avg_submit_pct = allPcts.length
      ? Math.round(allPcts.reduce((a,b)=>a+b,0)/allPcts.length) : 0;

    // due_dates สำหรับ calendar
    const due_dates = [...new Set(assignments.map(a => String(a.due_date).slice(0,10)))];

    // Today's pending/complete count
    const today    = new Date().toISOString().slice(0,10);
    const todaySub = allSubs.filter(s => {
      const a = assignments.find(x => x.assign_id === s.assign_id);
      return a && String(a.due_date).slice(0,10) === today;
    });
    const pending_rooms  = by_class.filter(c => c.avg_pct < 100).length;
    const complete_works = assignments.filter(a => {
      const subs  = relevantSubs.filter(s => s.assign_id === a.assign_id);
      return subs.length && subs.every(s => s.status !== 'NOT_SENT');
    }).length;

    return {
      total_assignments: assignments.length,
      avg_submit_pct,
      top_students,
      risk_students:    at_risk.length,
      pending_rooms,
      complete_works,
      at_risk_students: at_risk.length,
      by_class,
      by_student,
      at_risk,
      due_dates,
    };
  }

  /** สรุปรายนักเรียน */
  function byStudent(params) {
    return summary(params);
  }

  /** Export รายงานเป็น Excel */
  function exportExcel(params) {
    const data     = summary(params);
    const ss       = SpreadsheetApp.openById(GAS_CONFIG.SPREADSHEET_ID);
    const sheetName = '_rpt_' + Date.now();
    const temp     = ss.insertSheet(sheetName);

    temp.appendRow(['รายงานสรุปการส่งงาน', '', '', '', '']);
    temp.appendRow(['สร้างเมื่อ', new Date().toLocaleString('th-TH'), '', '', '']);
    temp.appendRow(['']);
    temp.appendRow(['ชื่อ-นามสกุล','ชั้นเรียน','ส่งแล้ว','ไม่ส่ง','% ส่ง']);

    data.by_student.forEach(s => {
      temp.appendRow([s.fullname, s.class_name, s.sent, s.not_sent, s.submit_pct + '%']);
    });

    // Style header
    temp.getRange(4, 1, 1, 5).setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
    temp.autoResizeColumns(1, 5);
    SpreadsheetApp.flush();

    const url = `https://docs.google.com/spreadsheets/d/${GAS_CONFIG.SPREADSHEET_ID}/export?format=xlsx&gid=${temp.getSheetId()}`;
    ss.deleteSheet(temp);
    return { url };
  }

  /** Export รายงานเป็น PDF */
  function exportPDF(params) {
    const data = summary(params);
    const html = _buildReportHTML(data, params);

    const blob = Utilities.newBlob(html, 'text/html', 'report.html');
    const pdfBlob = blob.getAs('application/pdf');
    pdfBlob.setName('ClassTrack_Report_' + new Date().toISOString().slice(0,10) + '.pdf');

    const folder = DriveApp.getFolderById(GAS_CONFIG.UPLOAD_FOLDER_ID);
    const file   = folder.createFile(pdfBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { url: file.getDownloadUrl() };
  }

  function _buildReportHTML(data, params) {
    const rows = data.by_student.map(s => `
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:8px 12px">${s.fullname}</td>
        <td style="padding:8px 12px;text-align:center">${s.class_name}</td>
        <td style="padding:8px 12px;text-align:center;color:#10b981">${s.sent}</td>
        <td style="padding:8px 12px;text-align:center;color:#ef4444">${s.not_sent}</td>
        <td style="padding:8px 12px;text-align:center;font-weight:700;color:${s.submit_pct>=80?'#10b981':s.submit_pct>=50?'#f59e0b':'#ef4444'}">${s.submit_pct}%</td>
      </tr>`).join('');

    return `<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <style>
        body{font-family:sans-serif;margin:32px;color:#1e293b}
        h1{font-size:20px;margin-bottom:4px}
        .sub{color:#64748b;font-size:13px;margin-bottom:24px}
        .stats{display:flex;gap:20px;margin-bottom:24px}
        .stat{padding:12px 20px;border-radius:10px;background:#f0f4ff;min-width:100px;text-align:center}
        .stat-val{font-size:24px;font-weight:700;color:#1a56db}
        .stat-lbl{font-size:12px;color:#64748b}
        table{width:100%;border-collapse:collapse;font-size:13px}
        thead{background:#1a56db;color:white}
        th{padding:10px 12px;text-align:left}
        tr:nth-child(even){background:#f8faff}
      </style>
    </head><body>
      <h1>รายงานสรุปการส่งงาน — ClassTrack</h1>
      <div class="sub">สร้างเมื่อ ${new Date().toLocaleString('th-TH')}</div>
      <div class="stats">
        <div class="stat"><div class="stat-val">${data.total_assignments}</div><div class="stat-lbl">งานทั้งหมด</div></div>
        <div class="stat"><div class="stat-val">${data.avg_submit_pct}%</div><div class="stat-lbl">% ส่งเฉลี่ย</div></div>
        <div class="stat"><div class="stat-val">${data.top_students}</div><div class="stat-lbl">ส่งครบ 100%</div></div>
        <div class="stat"><div class="stat-val">${data.risk_students}</div><div class="stat-lbl">เสี่ยงตก</div></div>
      </div>
      <table>
        <thead><tr><th>ชื่อ-นามสกุล</th><th>ชั้น</th><th>ส่งแล้ว</th><th>ไม่ส่ง</th><th>% ส่ง</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`;
  }

  return { summary, byStudent, exportExcel, exportPDF };
})();

// ══════════════════════════════════════════════════════════
// ADMIN SERVICE
// ══════════════════════════════════════════════════════════
const AdminService = (() => {

  function list() {
    return SheetService.getAll('ADMINS');
  }

  function add(data, userEmail) {
    if (!data.email) throw new Error('email is required');
    const existing = SheetService.findOne('ADMINS', 'email', data.email);
    if (existing) throw new Error('อีเมลนี้มีอยู่แล้ว');
    SheetService.insertRow('ADMINS', {
      email:  data.email.toLowerCase().trim(),
      role:   data.role || 'ADMIN',
      active: 'TRUE',
    });
    AuditService.log(userEmail, 'ADMIN_ADD', data.email, data.role);
    return { email: data.email };
  }

  function remove(email, userEmail) {
    SheetService.updateRow('ADMINS', 'email', email, { active: 'FALSE' });
    AuditService.log(userEmail, 'ADMIN_REMOVE', email, '');
    return { email };
  }

  /**
   * ตรวจว่า email เป็น Admin หรือไม่ — ถ้าไม่ throw
   * @param {string} userEmail
   */
  function requireAdmin(userEmail) {
    const admin = SheetService.findOne('ADMINS', 'email', userEmail);
    if (!admin || admin.active !== 'TRUE' || admin.role !== 'ADMIN') {
      throw new Error('ต้องการสิทธิ์ ADMIN');
    }
  }

  return { list, add, remove, requireAdmin };
})();

// ══════════════════════════════════════════════════════════
// UPLOAD SERVICE
// ══════════════════════════════════════════════════════════
const UploadService = (() => {

  /**
   * รับ base64 image จาก frontend แล้วเก็บใน Drive
   * @param {{ base64: string, filename: string, mimeType: string }} data
   * @param {string} userEmail
   * @returns {{ driveId: string, url: string }}
   */
  function uploadImage(data, userEmail) {
    const { base64, filename, mimeType } = data;

    if (!base64)    throw new Error('base64 is required');
    if (!mimeType)  throw new Error('mimeType is required');

    // อนุญาตเฉพาะ image types ที่ปลอดภัย
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(mimeType)) throw new Error('ไม่รองรับประเภทไฟล์: ' + mimeType);

    const safeFilename = (filename || 'upload')
      .replace(/[^a-zA-Z0-9._\-ก-๙]/g, '_')
      .slice(0, 100);

    const bytes  = Utilities.base64Decode(base64);
    const blob   = Utilities.newBlob(bytes, mimeType, safeFilename);
    const folder = DriveApp.getFolderById(GAS_CONFIG.UPLOAD_FOLDER_ID);
    const file   = folder.createFile(blob);

    // ตั้งให้ใคร link ก็ดูได้
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const driveId = file.getId();
    const url     = `https://drive.google.com/uc?id=${driveId}&export=view`;

    AuditService.log(userEmail, 'FILE_UPLOAD', driveId, safeFilename);
    return { driveId, url, filename: safeFilename };
  }

  return { uploadImage };
})();

// ══════════════════════════════════════════════════════════
// AUDIT SERVICE
// ══════════════════════════════════════════════════════════
const AuditService = (() => {

  /**
   * บันทึก log ทุกการแก้ไข
   * @param {string} userEmail
   * @param {string} action
   * @param {string} target
   * @param {string} detail
   */
  function log(userEmail, action, target, detail) {
    try {
      SheetService.insertRow('AUDIT_LOG', {
        time:       new Date().toISOString(),
        user_email: userEmail,
        action:     action,
        target:     target,
        detail:     String(detail).slice(0, 500), // จำกัดความยาว
      });
    } catch(e) {
      Logger.log('Audit log failed: ' + e.message);
    }
  }

  /**
   * ดึง log ล่าสุด
   * @param {number} limit
   */
  function recent(limit) {
    const all = SheetService.getAll('AUDIT_LOG');
    return all
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, limit || 20)
      .map(l => ({ ...l, __rowIndex: undefined }));
  }

  return { log, recent };
})();
