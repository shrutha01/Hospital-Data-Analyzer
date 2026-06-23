// ============================================================
//  operations.js  —  MongoDB-style operations on CSV data
//  Handles: max, min, avg, count, sort asc/desc,
//           limit, skip, greater than, less than, equal to
// ============================================================

// ── Global State ──────────────────────────────────────────
let allData      = [];   // parsed rows from CSV
let headers      = [];   // column names
let numericCols  = [];   // columns that contain numbers
let currentOp    = null; // currently selected operation

// ── On Page Load ─────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadBuiltinCSV();

  // File upload listener
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadCSV(ev.target.result, file.name);
    reader.readAsText(file);
  });

  // Operation button listeners
  document.querySelectorAll('.op-btn').forEach((btn) => {
    btn.addEventListener('click', () => selectOperation(btn));
  });
});

// ── Load Built-in CSV ─────────────────────────────────────
// Fetches hospital_dataset.csv from the same folder
function loadBuiltinCSV() {
  fetch('hospital_dataset.csv')
    .then((res) => res.text())
    .then((text) => loadCSV(text, 'hospital_dataset.csv'))
    .catch(() => {
      document.getElementById('datasetLabel').textContent =
        '⚠️ Upload CSV manually';
    });
}

// ── Parse and Load CSV ────────────────────────────────────
function loadCSV(csvText, filename) {
  const lines = csvText.trim().split('\n');
  headers = lines[0].split(',').map((h) => h.trim());

  allData = lines.slice(1).map((line) => {
    const values = line.split(',');
    const row = {};
    headers.forEach((col, i) => {
      const raw = values[i] !== undefined ? values[i].trim() : '';
      const num = parseFloat(raw);
      row[col] = !isNaN(num) && raw !== '' ? num : raw;
    });
    return row;
  });

  // Detect which columns are fully numeric
  numericCols = headers.filter((col) =>
    allData.every((row) => typeof row[col] === 'number')
  );

  // Update stats in header
  document.getElementById('datasetLabel').textContent  = filename;

  // Re-render param controls if an op is already selected
  if (currentOp) renderParams(currentOp);
}

// ── Select an Operation ───────────────────────────────────
function selectOperation(btn) {
  document.querySelectorAll('.op-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  currentOp = btn.dataset.op;
  renderParams(currentOp);

  // Reset results display
  document.getElementById('queryBox').textContent        = '— configure parameters and click Run Query —';
  document.getElementById('resultsContainer').innerHTML  =
    '<div class="empty-state"><p>📋 Run a query to see results here.</p></div>';
  document.getElementById('resultCount').textContent     = '';
}

// ── Render Parameter Inputs ───────────────────────────────
function renderParams(op) {
  const container = document.getElementById('paramsContainer');
  container.innerHTML = '';

  // Helper: dropdown
  const makeSelect = (id, label, options) => {
    const div = document.createElement('div');
    div.className = 'param-group';
    div.innerHTML = `
      <label for="${id}">${label}</label>
      <select id="${id}">
        ${options.map((o) => `<option value="${o}">${o}</option>`).join('')}
      </select>`;
    container.appendChild(div);
  };

  // Helper: number input
  const makeNumberInput = (id, label, defaultVal, placeholder) => {
    const div = document.createElement('div');
    div.className = 'param-group';
    div.innerHTML = `
      <label for="${id}">${label}</label>
      <input type="number" id="${id}" value="${defaultVal}" placeholder="${placeholder}" />`;
    container.appendChild(div);
  };

  // Helper: text input
  const makeTextInput = (id, label, placeholder) => {
    const div = document.createElement('div');
    div.className = 'param-group';
    div.innerHTML = `
      <label for="${id}">${label}</label>
      <input type="text" id="${id}" placeholder="${placeholder}" />`;
    container.appendChild(div);
  };

  // Build inputs based on operation
  if (op === 'max' || op === 'min' || op === 'avg') {
    makeSelect('paramField', 'Numeric Field', numericCols);
  }

  if (op === 'count') {
    const p = document.createElement('p');
    p.className = 'hint-text';
    p.textContent = 'No parameters needed — just click Run Query.';
    container.appendChild(p);
  }

  if (op === 'sort_asc' || op === 'sort_desc') {
    makeSelect('paramField', 'Sort By Field', headers);
    makeNumberInput('paramLimit', 'Show Top N Rows (0 = all)', 20, 'e.g. 10');
  }

  if (op === 'limit') {
    makeNumberInput('paramN', 'Limit — Number of Rows', 10, 'e.g. 10');
  }

  if (op === 'skip') {
    makeNumberInput('paramN', 'Skip — Number of Rows', 5, 'e.g. 5');
  }

  if (op === 'gt' || op === 'lt') {
    makeSelect('paramField', 'Numeric Field', numericCols);
    makeNumberInput('paramValue', 'Value', '', 'e.g. 30000');
  }

  if (op === 'eq') {
    makeSelect('paramField', 'Field', headers);
    makeTextInput('paramValue', 'Equal To Value', 'e.g. Bangalore or 45');
  }

  document.getElementById('runBtn').style.display = 'block';
}

// ── Run the Selected Operation ────────────────────────────
function runOperation() {
  if (!currentOp || allData.length === 0) return;

  // Read param values
  const field   = document.getElementById('paramField')  ? document.getElementById('paramField').value  : null;
  const n       = document.getElementById('paramN')       ? parseInt(document.getElementById('paramN').value)     || 0 : 0;
  const value   = document.getElementById('paramValue')   ? document.getElementById('paramValue').value  : null;
  const limitN  = document.getElementById('paramLimit')   ? parseInt(document.getElementById('paramLimit').value) || 0 : 0;

  let result    = null;
  let queryStr  = '';
  let isAgg     = false;
  let aggLabel  = '';
  let aggValue  = null;
  let aggSub    = '';

  const data = [...allData];

  // ── MongoDB Operations ──────────────────────────────────

  // MAX
  if (currentOp === 'max') {
    const values = data.map((r) => r[field]).filter((v) => typeof v === 'number');
    aggValue = Math.max(...values);
    aggLabel = `Maximum of "${field}"`;
    aggSub   = `Highest value across ${values.length} records`;
    queryStr = `db.collection.aggregate([{ $group: { _id: null, max: { $max: "$${field}" } } }])`;
    isAgg    = true;
  }

  // MIN
  else if (currentOp === 'min') {
    const values = data.map((r) => r[field]).filter((v) => typeof v === 'number');
    aggValue = Math.min(...values);
    aggLabel = `Minimum of "${field}"`;
    aggSub   = `Lowest value across ${values.length} records`;
    queryStr = `db.collection.aggregate([{ $group: { _id: null, min: { $min: "$${field}" } } }])`;
    isAgg    = true;
  }

  // AVG
  else if (currentOp === 'avg') {
    const values = data.map((r) => r[field]).filter((v) => typeof v === 'number');
    const sum    = values.reduce((a, b) => a + b, 0);
    aggValue     = (sum / values.length).toFixed(2);
    aggLabel     = `Average of "${field}"`;
    aggSub       = `Mean across ${values.length} records`;
    queryStr     = `db.collection.aggregate([{ $group: { _id: null, avg: { $avg: "$${field}" } } }])`;
    isAgg        = true;
  }

  // COUNT
  else if (currentOp === 'count') {
    aggValue = data.length;
    aggLabel = 'Total Documents';
    aggSub   = 'Full collection count';
    queryStr = `db.collection.countDocuments({})`;
    isAgg    = true;
  }

  // SORT ASCENDING
  else if (currentOp === 'sort_asc') {
    result = [...data].sort((a, b) => {
      if (typeof a[field] === 'number') return a[field] - b[field];
      return String(a[field]).localeCompare(String(b[field]));
    });
    if (limitN > 0) result = result.slice(0, limitN);
    queryStr = `db.collection.find({}).sort({ ${field}: 1 })` + (limitN > 0 ? `.limit(${limitN})` : '');
  }

  // SORT DESCENDING
  else if (currentOp === 'sort_desc') {
    result = [...data].sort((a, b) => {
      if (typeof a[field] === 'number') return b[field] - a[field];
      return String(b[field]).localeCompare(String(a[field]));
    });
    if (limitN > 0) result = result.slice(0, limitN);
    queryStr = `db.collection.find({}).sort({ ${field}: -1 })` + (limitN > 0 ? `.limit(${limitN})` : '');
  }

  // LIMIT
  else if (currentOp === 'limit') {
    result   = data.slice(0, n);
    queryStr = `db.collection.find({}).limit(${n})`;
  }

  // SKIP
  else if (currentOp === 'skip') {
    result   = data.slice(n);
    queryStr = `db.collection.find({}).skip(${n})`;
  }

  // GREATER THAN
  else if (currentOp === 'gt') {
    const v  = parseFloat(value);
    result   = data.filter((r) => r[field] > v);
    queryStr = `db.collection.find({ ${field}: { $gt: ${v} } })`;
  }

  // LESS THAN
  else if (currentOp === 'lt') {
    const v  = parseFloat(value);
    result   = data.filter((r) => r[field] < v);
    queryStr = `db.collection.find({ ${field}: { $lt: ${v} } })`;
  }

  // EQUAL TO
  else if (currentOp === 'eq') {
    const parsed = parseFloat(value);
    result = data.filter((r) =>
      typeof r[field] === 'number' && !isNaN(parsed)
        ? r[field] === parsed
        : String(r[field]).toLowerCase() === String(value).toLowerCase()
    );
    queryStr = `db.collection.find({ ${field}: { $eq: "${value}" } })`;
  }

  // ── Update Query Display ────────────────────────────────
  document.getElementById('queryBox').textContent = queryStr;

  // ── Render Output ───────────────────────────────────────
  if (isAgg) {
    document.getElementById('resultCount').textContent = '1 result';
    document.getElementById('resultsContainer').innerHTML = `
      <div class="agg-card">
        <div class="agg-label">${aggLabel}</div>
        <div class="agg-value">${typeof aggValue === 'number' ? aggValue.toLocaleString() : aggValue}</div>
        <div class="agg-sub">${aggSub}</div>
      </div>`;
  } else {
    document.getElementById('resultCount').textContent = `${result.length} rows`;
    renderTable(result, field);
  }
}

// ── Render Results Table ──────────────────────────────────
function renderTable(rows, highlightField) {
  if (rows.length === 0) {
    document.getElementById('resultsContainer').innerHTML =
      '<div class="no-results">No documents matched your query.</div>';
    return;
  }

  let html = '<table><thead><tr>';
  headers.forEach((col) => { html += `<th>${col}</th>`; });
  html += '</tr></thead><tbody>';

  rows.forEach((row) => {
    html += '<tr>';
    headers.forEach((col) => {
      const val     = row[col];
      const isNum   = typeof val === 'number';
      const isHL    = col === highlightField;
      const cls     = isHL ? 'is-highlight' : (isNum ? 'is-num' : '');
      const display = isNum ? val.toLocaleString() : val;
      html += `<td class="${cls}">${display}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  document.getElementById('resultsContainer').innerHTML = html;
}