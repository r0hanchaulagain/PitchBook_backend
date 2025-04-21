// src/services/holidayFileUtil.js
const fs = require('fs');
const path = require('path');

const HOLIDAY_DIR = path.join(__dirname, '../data/holidays');

function getHolidayFilePath(bsYear) {
  return path.join(HOLIDAY_DIR, `${bsYear}.json`);
}

function ensureHolidayDir() {
  if (!fs.existsSync(HOLIDAY_DIR)) {
    fs.mkdirSync(HOLIDAY_DIR, { recursive: true });
  }
}

function holidayFileExists(bsYear) {
  ensureHolidayDir();
  return fs.existsSync(getHolidayFilePath(bsYear));
}

function readHolidayFile(bsYear) {
  ensureHolidayDir();
  const filePath = getHolidayFilePath(bsYear);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeHolidayFile(bsYear, holidays) {
  ensureHolidayDir();
  const filePath = getHolidayFilePath(bsYear);
  fs.writeFileSync(filePath, JSON.stringify(holidays, null, 2), 'utf8');
}

module.exports = {
  holidayFileExists,
  readHolidayFile,
  writeHolidayFile,
};
