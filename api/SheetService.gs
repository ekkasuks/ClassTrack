/**
 * @fileoverview SheetService — Data Access Layer สำหรับ Google Sheets
 * @description ทุกการอ่าน/เขียน Sheet ผ่านที่นี่ ไม่มีที่อื่น
 */

const SheetService = (() => {

  /** @type {GoogleAppsScript.Spreadsheet.Spreadsheet} */
  let _ss = null;

  /**
   * ดึง Spreadsheet instance (singleton)
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
   */
  function _getSpreadsheet() {
    if (!_ss) _ss = SpreadsheetApp.openById(GAS_CONFIG.SPREADSHEET_ID);
    return _ss;
  }

  /**
   * ดึง Sheet ตามชื่อ
   * @param {string} name
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  function getSheet(name) {
    const sheet = _getSpreadsheet().getSheetByName(name);
    if (!sheet) throw new Error(`Sheet "${name}" ไม่พบ`);
    return sheet;
  }

  /**
   * อ่านทุก row จาก Sheet เป็น Array of Objects
   * @param {string} sheetName
   * @returns {Object[]}
   */
  function getAll(sheetName) {
    const sheet  = getSheet(sheetName);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];

    const headers = values[0].map(h => String(h).trim());
    const result = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row.some(cell => cell !== '' && cell !== null)) continue;
      const obj = {};
      headers.forEach((h, j) => { obj[h] = row[j] !== undefined ? row[j] : ''; });
      obj.__rowIndex = i + 1; // 1-indexed, ถูกต้องแม้มี row ซ้ำ
      result.push(obj);
    }
    return result;
  }

  /**
   * หา row แรกที่ตรงกับ condition
   * @param {string} sheetName
   * @param {string} keyCol
   * @param {string} keyVal
   * @returns {Object|null}
   */
  /**
   * หา row แรกที่ตรงกับ condition (case-insensitive + trim สำหรับ string)
   * @param {string} sheetName
   * @param {string} keyCol
   * @param {string} keyVal
   * @returns {Object|null}
   */
  function findOne(sheetName, keyCol, keyVal) {
    const rows    = getAll(sheetName);
    const normVal = String(keyVal).toLowerCase().trim();
    return rows.find(r => String(r[keyCol]).toLowerCase().trim() === normVal) || null;
  }

  /**
   * Filter rows ตาม condition object
   * @param {string} sheetName
   * @param {Object} conditions - { col: val, ... }
   * @returns {Object[]}
   */
  function findWhere(sheetName, conditions) {
    const rows = getAll(sheetName);
    return rows.filter(row =>
      Object.entries(conditions).every(([k, v]) =>
        v === undefined || v === '' || String(row[k]) === String(v)
      )
    );
  }

  /**
   * เพิ่ม row ใหม่
   * @param {string} sheetName
   * @param {Object} data - key ต้องตรงกับ header ของ sheet
   * @returns {Object} data ที่เพิ่มไป
   */
  function insertRow(sheetName, data) {
    const sheet   = getSheet(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                         .map(h => String(h).trim());
    const row = headers.map(h => data[h] !== undefined ? data[h] : '');
    sheet.appendRow(row);
    return data;
  }

  /**
   * Update row ที่ตรงกับ keyCol = keyVal
   * @param {string} sheetName
   * @param {string} keyCol
   * @param {string} keyVal
   * @param {Object} updates - field ที่ต้องการเปลี่ยน
   * @returns {boolean} success
   */
  function updateRow(sheetName, keyCol, keyVal, updates) {
    const sheet   = getSheet(sheetName);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const keyIdx  = headers.indexOf(keyCol);
    if (keyIdx === -1) throw new Error(`Column "${keyCol}" ไม่พบใน ${sheetName}`);

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][keyIdx]) === String(keyVal)) {
        Object.entries(updates).forEach(([col, val]) => {
          const colIdx = headers.indexOf(col);
          if (colIdx !== -1) sheet.getRange(i + 1, colIdx + 1).setValue(val);
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Generate unique ID แบบ prefix + timestamp
   * @param {string} prefix - เช่น 'A', 'S', 'SB'
   * @returns {string}
   */
  function generateId(prefix) {
    return `${prefix}${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
  }

  /**
   * Escape string เพื่อป้องกัน formula injection (=, +, -, @)
   * @param {*} val
   * @returns {string}
   */
  function sanitize(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    // ป้องกัน formula injection ใน Sheets
    return /^[=+\-@]/.test(str) ? "'" + str : str;
  }

  return { getSheet, getAll, findOne, findWhere, insertRow, updateRow, generateId, sanitize };
})();
