'use strict';
/**
 * csvStream.js
 * Utility to stream DB results to CSV response to prevent OOM.
 */

const { Transform } = require('stream');

/**
 * Escapes CSV values correctly.
 */
function escapeCsv(v) {
  if (v == null) return '';
  let s;
  if (typeof v === 'object' && v instanceof Date) {
    s = v.toLocaleString('vi-VN');
  } else if (typeof v === 'object') {
    s = JSON.stringify(v);
  } else {
    s = String(v);
  }
  
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Creates a Transform stream that converts JS objects to CSV lines.
 */
function createCsvTransformer(headers) {
  let isFirst = true;
  
  return new Transform({
    objectMode: true,
    transform(row, encoding, callback) {
      let chunk = '';
      if (isFirst) {
        chunk += '\uFEFF' + headers.join(',') + '\n';
        isFirst = false;
      }
      
      const values = [];
      // If row is an array, use it directly, otherwise map keys
      if (Array.isArray(row)) {
        row.forEach(v => values.push(escapeCsv(v)));
      } else {
        // We assume the caller might pass a mapping function, 
        // but for raw DB rows we might just take all values.
        Object.values(row).forEach(v => values.push(escapeCsv(v)));
      }
      
      chunk += values.join(',') + '\n';
      callback(null, chunk);
    }
  });
}

/**
 * Helper to stream a DB query result to Express response.
 * @param {object} res - Express Response object
 * @param {string} filename - Filename for download
 * @param {Array} headers - CSV header array
 * @param {object} queryStream - mysql2 connection.query().stream()
 * @param {Function} [mapFn] - Optional function to map row to array
 */
function streamToCsv(res, filename, headers, queryStream, mapFn) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  let isFirst = true;
  const transformer = new Transform({
    objectMode: true,
    transform(row, encoding, callback) {
      let chunk = '';
      if (isFirst) {
        chunk += '\uFEFF' + headers.join(',') + '\n';
        isFirst = false;
      }
      
      const data = mapFn ? mapFn(row) : Object.values(row);
      const csvLine = data.map(escapeCsv).join(',') + '\n';
      
      callback(null, chunk + csvLine);
    }
  });

  queryStream.on('error', (err) => {
    console.error('[CSV Stream Error]', err);
    if (!res.headersSent) {
      res.status(500).end('Error generating CSV');
    } else {
      res.end();
    }
  });

  queryStream.pipe(transformer).pipe(res);
}

module.exports = {
  escapeCsv,
  createCsvTransformer,
  streamToCsv
};
