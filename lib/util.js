'use strict';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validateObject(value, field = 'Request body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `${field} must be an object`);
  }
  return value;
}

function requireFields(body, fields) {
  validateObject(body);
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      throw new HttpError(400, `Missing required field: ${f}`);
    }
  }
}

function validateString(value, field, required = false) {
  if (typeof value !== 'string' || (required && !value.trim())) {
    throw new HttpError(400, `${field} must be ${required ? 'a nonempty' : 'a'} string`);
  }
  return value.trim();
}

function validateTextFields(body, fields, required = []) {
  validateObject(body);
  const values = {};
  for (const field of fields) {
    if (body[field] !== undefined) values[field] = validateString(body[field], field, required.includes(field));
  }
  return values;
}

function validateNumber(value, field, { min = 0, positive = false, integer = false, allowString = false } = {}) {
  if (allowString && typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) value = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min ||
      (positive && value <= 0) || (integer && !Number.isSafeInteger(value))) {
    throw new HttpError(400, `${field} must be a finite ${positive ? 'positive' : 'non-negative'} ${integer ? 'whole number' : 'number'}`);
  }
  return value;
}

function validateEnum(value, field, choices) {
  if (typeof value !== 'string' || !choices.includes(value)) throw new HttpError(400, `Invalid ${field}`);
  return value;
}

function validateDate(value, field, { min, max } = {}) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === '0000') {
    throw new HttpError(400, `${field} must be a valid YYYY-MM-DD date`);
  }
  const d = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${field} must be a valid calendar date`);
  }
  if ((min && value < min) || (max && value > max)) throw new HttpError(400, `${field} is outside the allowed date range`);
  return value;
}

function optionalDate(value, field, limits) {
  if (value === null || value === '') return null;
  return validateDate(value, field, limits);
}

function validateTime(value, field = 'Time') {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new HttpError(400, `${field} must be a valid HH:MM time`);
  }
  return value;
}

function pad(n) { return String(n).padStart(2, '0'); }

function today(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowISO() { return new Date().toISOString(); }

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(a, b) {
  validateDate(a, 'Start date');
  validateDate(b, 'End date');
  return (new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000;
}

function money(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isFinite(n * 100)) {
    throw new HttpError(400, 'Amount must be a finite number');
  }
  return Math.round(n * 100) / 100;
}

module.exports = {
  HttpError, requireFields, today, nowISO, addDays, daysBetween, money,
  validateObject, validateString, validateTextFields, validateNumber,
  validateEnum, validateDate, optionalDate, validateTime
};