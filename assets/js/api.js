/**
 * @fileoverview API Service Layer — ทุก HTTP call ผ่านที่นี่
 * @module Api
 */

const Api = (() => {
  /**
   * Generic fetch wrapper พร้อม auth header
   * @param {string} endpoint - เช่น '/students'
   * @param {Object} options - fetch options
   * @returns {Promise<Object>}
   */
  async function _request(endpoint, options = {}) {
    const token = Auth.getToken();
    const url = `${CONFIG.API_BASE_URL}?action=${endpoint.replace(/^\//, '')}`;

    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    };

    try {
      const res = await fetch(url, { ...options, headers, mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`[API] ${endpoint}`, err);
      throw err;
    }
  }

  /**
   * POST request
   * @param {string} endpoint
   * @param {Object} body
   */
  async function post(endpoint, body) {
    return _request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * GET request พร้อม query params
   * @param {string} endpoint
   * @param {Object} [params]
   */
  async function get(endpoint, params = {}) {
    const qs = new URLSearchParams({ action: endpoint.replace(/^\//, ''), ...params }).toString();
    const token = Auth.getToken();
    const url = `${CONFIG.API_BASE_URL}?${qs}`;
    try {
      const res = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        mode: 'cors',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`[API GET] ${endpoint}`, err);
      throw err;
    }
  }

  // ─── Student APIs ─────────────────────────────────
  const Students = {
    list: (classId) => get('/students', { class_id: classId }),
    add: (data) => post('/students/add', data),
    update: (data) => post('/students/update', data),
    remove: (studentId) => post('/students/delete', { student_id: studentId }),
    importCSV: (rows) => post('/students/import', { rows }),
  };

  // ─── Class APIs ───────────────────────────────────
  const Classes = {
    list: () => get('/classes'),
    add: (data) => post('/classes/add', data),
    update: (data) => post('/classes/update', data),
  };

  // ─── Subject APIs ─────────────────────────────────
  const Subjects = {
    list: () => get('/subjects'),
  };

  // ─── Assignment APIs ──────────────────────────────
  const Assignments = {
    create: (data) => post('/assignment/create', data),
    byDate: (date) => get('/assignment/byDate', { due: date }),
    detail: (assignId) => get('/assignment/detail', { assign_id: assignId }),
    update: (data) => post('/assignment/update', data),
    remove: (assignId) => post('/assignment/delete', { assign_id: assignId }),
    copy: (assignId) => post('/assignment/copy', { assign_id: assignId }),
  };

  // ─── Submission APIs ──────────────────────────────
  const Submissions = {
    list: (assignId) => get('/submission/list', { assign_id: assignId }),
    updateOne: (data) => post('/submission/updateOne', data),
    bulkUpdate: (data) => post('/submission/bulkUpdate', data),
  };

  // ─── Report APIs ──────────────────────────────────
  const Reports = {
    summary: (params) => get('/report/summary', params),
    student: (params) => get('/report/student', params),
    exportExcel: (params) => get('/report/exportExcel', params),
    exportPDF: (params) => get('/report/exportPDF', params),
  };

  // ─── Upload API ───────────────────────────────────
  const Upload = {
    /**
     * อัปโหลดรูปโดย resize ก่อน แล้วส่ง base64
     * @param {File} file
     * @returns {Promise<{driveId: string, url: string}>}
     */
    image: async (file) => {
      if (file.size > CONFIG.MAX_IMAGE_SIZE) {
        throw new Error(`ขนาดไฟล์เกิน ${CONFIG.MAX_IMAGE_SIZE / 1024 / 1024}MB`);
      }
      const b64 = await _resizeImage(file, CONFIG.MAX_IMAGE_DIM);
      return post('/upload/image', { base64: b64, filename: file.name, mimeType: file.type });
    },
  };

  // ─── Config API ───────────────────────────────────
  const AppConfig = {
    get: () => get('/config'),
    update: (data) => post('/config/update', data),
  };

  /**
   * Resize รูปใน browser ก่อน upload เพื่อลดขนาด
   * @param {File} file
   * @param {number} maxDim
   * @returns {Promise<string>} base64 string
   * @private
   */
  function _resizeImage(file, maxDim) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL(file.type, 0.82).split(',')[1]);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  return { get, post, Students, Classes, Subjects, Assignments, Submissions, Reports, Upload, AppConfig };
})();
