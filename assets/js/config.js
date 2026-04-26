/**
 * @fileoverview Central configuration for ClassTrack
 * @description ตั้งค่า API URL และ Google Client ID ที่นี่ก่อน deploy
 */

const CONFIG = {
  /** @type {string} URL ของ Google Apps Script Web App */
  API_BASE_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',

  /** @type {string} Google OAuth Client ID จาก Google Cloud Console */
  GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',

  /** @type {number} Token expiry buffer (ms) */
  TOKEN_EXPIRY_BUFFER: 5 * 60 * 1000,

  /** @type {number} Max image size in bytes (2MB) */
  MAX_IMAGE_SIZE: 2 * 1024 * 1024,

  /** @type {number} Max image dimension for resize */
  MAX_IMAGE_DIM: 1200,
};

Object.freeze(CONFIG);
