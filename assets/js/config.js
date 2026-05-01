/**
 * @fileoverview Central configuration for ClassTrack
 * @description ตั้งค่า API URL และ Google Client ID ที่นี่ก่อน deploy
 */

const CONFIG = {
  /** @type {string} URL ของ Google Apps Script Web App */
  API_BASE_URL: 'https://script.google.com/macros/s/AKfycbyElpXvpOnX9nQiK7jk4xu_I3Yj70lWTsrpo2GBlKkrWCgFEjvPFUFHAoTOs-aADoS5/exec',

  /** @type {string} Google OAuth Client ID จาก Google Cloud Console */
  GOOGLE_CLIENT_ID: '175501609129-q2h9ug1cjbs0ov1um9oa4hdr4pvr4tdb.apps.googleusercontent.com',

  /** @type {number} Token expiry buffer (ms) */
  TOKEN_EXPIRY_BUFFER: 5 * 60 * 1000,

  /** @type {number} Max image size in bytes (2MB) */
  MAX_IMAGE_SIZE: 2 * 1024 * 1024,

  /** @type {number} Max image dimension for resize */
  MAX_IMAGE_DIM: 1200,
};

Object.freeze(CONFIG);
