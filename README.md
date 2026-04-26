# 📚 ClassTrack — ระบบติดตามการส่งงานนักเรียน

> Web App (GitHub Pages) + Google Apps Script API + Google Sheets Database

---

## 🗂️ โครงสร้างโปรเจกต์

```
homework-tracker/
├── index.html                  ← หน้า Login
├── assets/
│   ├── css/
│   │   └── main.css            ← Global styles
│   └── js/
│       ├── config.js           ← ตั้งค่า URL + Client ID
│       ├── auth.js             ← Google OAuth module
│       ├── api.js              ← API Service Layer
│       └── ui.js               ← Toast, Modal, Loading utilities
├── pages/
│   ├── dashboard.html          ← Dashboard สรุปภาพรวม
│   ├── assignments.html        ← มอบหมายงาน
│   ├── checkwork.html          ← ตรวจงาน + ปฏิทิน
│   ├── students.html           ← จัดการนักเรียน
│   ├── reports.html            ← รายงานผล
│   ├── classes.html            ← จัดการชั้นเรียน (Admin)
│   └── settings.html           ← ตั้งค่าระบบ (Admin)
└── api/                        ← Google Apps Script
    ├── Code.gs                 ← Router (doGet/doPost)
    ├── SheetService.gs         ← Data Access Layer
    ├── AuthService.gs          ← OAuth Token Verification
    ├── BusinessServices.gs     ← Assignment, Student, Submission
    └── ReportAndSupportServices.gs ← Report, Upload, Audit, Admin
```

---

## 🚀 ขั้นตอน Deploy ทั้งหมด

### ขั้นที่ 1: ตั้งค่า Google Sheet

1. สร้าง Google Spreadsheet ใหม่
2. สร้าง Sheet ตามรายชื่อด้านล่างนี้ (ชื่อต้องตรงทุกตัวอักษร):

| ชื่อ Sheet | คอลัมน์ (header row) |
|---|---|
| `CONFIG` | `key`, `value` |
| `ADMINS` | `email`, `role`, `active` |
| `TEACHERS` | `teacher_id`, `name`, `email`, `active` |
| `CLASSES` | `class_id`, `class_name`, `level`, `room`, `active` |
| `STUDENTS` | `student_id`, `student_code`, `prefix`, `fullname`, `class_id`, `status` |
| `SUBJECTS` | `subject_id`, `subject_name`, `active` |
| `ASSIGNMENTS` | `assign_id`, `title`, `detail`, `class_id`, `subject_id`, `teacher_email`, `assign_date`, `due_date`, `due_time`, `attachment_drive_id`, `attachment_url`, `created_at`, `status` |
| `SUBMISSIONS` | `submit_id`, `assign_id`, `student_id`, `status`, `checked_by`, `checked_at`, `note`, `submit_time`, `late`, `proof_url` |
| `AUDIT_LOG` | `time`, `user_email`, `action`, `target`, `detail` |

3. เพิ่มข้อมูลเริ่มต้นใน `CONFIG`:

| key | value |
|---|---|
| SCHOOL_NAME | ชื่อโรงเรียนของคุณ |
| TERM | 1/2568 |
| DEFAULT_DUE_TIME | 23:59 |
| ALLOW_LATE_SUBMISSION | TRUE |
| MAX_UPLOAD_MB | 2 |

4. เพิ่ม email ของตัวเองใน `ADMINS`:
   - `email` = your@gmail.com
   - `role` = ADMIN
   - `active` = TRUE

5. คัดลอก **Spreadsheet ID** จาก URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

---

### ขั้นที่ 2: ตั้งค่า Google Drive Folder

1. สร้าง Folder ใน Google Drive สำหรับเก็บรูป (เช่น "ClassTrack Uploads")
2. คัดลอก **Folder ID** จาก URL:
   ```
   https://drive.google.com/drive/folders/[FOLDER_ID]
   ```

---

### ขั้นที่ 3: Deploy Google Apps Script

1. ไปที่ [script.google.com](https://script.google.com) → New Project
2. สร้างไฟล์ `.gs` ตามนี้ (File → New → Script):
   - `Code.gs`
   - `SheetService.gs`
   - `AuthService.gs`
   - `BusinessServices.gs`
   - `ReportAndSupportServices.gs`
3. วางโค้ดจากโฟลเดอร์ `api/` ลงในแต่ละไฟล์
4. แก้ไขค่าใน `Code.gs`:
   ```javascript
   const GAS_CONFIG = {
     SPREADSHEET_ID:  'YOUR_SPREADSHEET_ID_HERE',   // ← ใส่ ID จากขั้นที่ 1
     UPLOAD_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID_HERE', // ← ใส่ ID จากขั้นที่ 2
     ALLOWED_ORIGIN:  'https://YOUR_USERNAME.github.io', // ← GitHub Pages URL
   };
   ```
5. กด **Deploy → New Deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. กด Deploy → คัดลอก **Web App URL**

---

### ขั้นที่ 4: ตั้งค่า Google OAuth

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com)
2. สร้าง Project ใหม่ หรือใช้ Project ที่มีอยู่
3. ไปที่ **APIs & Services → OAuth consent screen**:
   - User Type: External
   - App name: ClassTrack
   - กรอก email
4. ไปที่ **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins:
     ```
     https://YOUR_USERNAME.github.io
     http://localhost (สำหรับทดสอบ)
     ```
5. คัดลอก **Client ID** (ลงท้าย `.apps.googleusercontent.com`)

---

### ขั้นที่ 5: แก้ไข config.js

เปิดไฟล์ `assets/js/config.js` แล้วแก้ไข:

```javascript
const CONFIG = {
  API_BASE_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec', // ← Web App URL
  GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',          // ← Client ID
  // ...
};
```

---

### ขั้นที่ 6: Deploy บน GitHub Pages

1. สร้าง Repository ใหม่บน GitHub
2. Upload ไฟล์ทั้งหมด (ยกเว้นโฟลเดอร์ `api/`)
3. ไปที่ **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main` / `(root)`
4. รอสักครู่ แล้วเข้าใช้ที่:
   ```
   https://YOUR_USERNAME.github.io/homework-tracker/
   ```

---

## 🔐 ความปลอดภัย

| มาตรการ | รายละเอียด |
|---|---|
| Google OAuth | ทุก request ต้องมี valid access token |
| Email Whitelist | ตรวจสิทธิ์จาก ADMINS / TEACHERS Sheet |
| XSS Prevention | `escHtml()` ทุก user input ที่แสดงผล |
| Formula Injection | `sanitize()` ป้องกัน `=HYPERLINK()` ใน Sheets |
| File Type Check | อนุญาตเฉพาะ image/* และ PDF |
| Audit Log | บันทึกทุกการแก้ไขพร้อม email + timestamp |

---

## 📋 ขั้นตอนใช้งานวันแรก (Admin)

```
1. Login ด้วย Google Account (ที่ใส่ไว้ใน ADMINS Sheet)
2. ไปที่ ตั้งค่าระบบ → ใส่ชื่อโรงเรียน, ภาคเรียน
3. ไปที่ จัดการชั้นเรียน → เพิ่มห้องเรียนทั้งหมด
4. ไปที่ ตั้งค่าระบบ → เพิ่มวิชา
5. ไปที่ จัดการนักเรียน → Import CSV รายชื่อ
6. เพิ่มครูคนอื่นใน ตั้งค่าระบบ → Admin Management
```

### ตัวอย่างไฟล์ CSV สำหรับ Import นักเรียน:
```csv
student_code,prefix,fullname,class_id,status
10001,ด.ช.,สมชาย ใจดี,C001,ACTIVE
10002,ด.ญ.,สมหญิง รักเรียน,C001,ACTIVE
```

---

## ⚡ การใช้งานประจำวัน (ครู)

```
1. Login → Dashboard แสดงงานวันนี้ทันที
2. กด "มอบหมายงานใหม่" → เลือกห้อง/วิชา → ตั้งวันส่ง → บันทึก
3. ระบบสร้างรายการนักเรียนทุกคนในห้องอัตโนมัติ (NOT_SENT)
4. ถึงวันส่ง → ไป "ตรวจงาน" → กดเลือกวันจากปฏิทิน
5. กดสถานะ ✅❌🟡🟦 ต่อคน → กด "บันทึก"
6. ดูรายงาน → Export PDF/Excel ได้ทันที
```

---

## 🛠️ แก้ปัญหาที่พบบ่อย

| ปัญหา | วิธีแก้ |
|---|---|
| Login แล้วขึ้น "ไม่มีสิทธิ์" | ตรวจว่า email ใน ADMINS Sheet ถูกต้องและ active=TRUE |
| API ไม่ตอบสนอง | ตรวจ Web App URL ใน config.js ว่าถูกต้อง |
| อัปโหลดรูปไม่ได้ | ตรวจ Folder ID และสิทธิ์ Drive |
| ข้อมูลไม่อัพเดต | กด F5 หรือ cache อาจยังไม่หมดอายุ (6 ชั่วโมง) |
| CORS Error | ตรวจ ALLOWED_ORIGIN ใน Code.gs |

---

## 📞 ติดต่อ

พัฒนาสำหรับโรงเรียน — ClassTrack v1.0
