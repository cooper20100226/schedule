// ===============================
// Timetable Planner (GitHub Pages)
// ===============================

const DAYS = [
  { key: "Mon", label: "一" },
  { key: "Tue", label: "二" },
  { key: "Wed", label: "三" },
  { key: "Thu", label: "四" },
  { key: "Fri", label: "五" },
  { key: "Sat", label: "六" },
  { key: "Sun", label: "日" },
];

// 你可以依你學校節次改這裡（顯示列與可選節次都跟著變）
// 你的節次（1~9 + A + B）
const PERIODS = ["1","2","3","4","5","6","7","8","9","A","B"];

// 課表列（顯示順序）
const GRID_PERIOD_ROWS = ["1","2","3","4","5","6","7","8","9","A","B"];

// 節次對應時間（用來顯示）
const PERIOD_TIME = {
  "1": "08:10–09:00",
  "2": "09:10–10:00",
  "3": "10:10–11:00",
  "4": "11:10–12:00",
  "5": "13:10–14:00",
  "6": "14:10–15:00",
  "7": "15:10–16:00",
  "8": "16:10–17:00",
  "9": "17:10–18:00",
  "A": "18:10–19:00",
  "B": "19:10–20:00",
};

const STORAGE_KEY = "timetable_planner_v1";

let state = loadState();

// ------- DOM -------
const yearSelect = document.getElementById("yearSelect");
const termSelect = document.getElementById("termSelect");
const timetableEl = document.getElementById("timetable");
const courseListEl = document.getElementById("courseList");
const creditTotalEl = document.getElementById("creditTotal");

const courseForm = document.getElementById("courseForm");
const courseName = document.getElementById("courseName");
const courseTeacher = document.getElementById("courseTeacher");
const courseCredits = document.getElementById("courseCredits");
const courseDay = document.getElementById("courseDay");
const coursePeriod = document.getElementById("coursePeriod");
const editingId = document.getElementById("editingId");

const cancelEditBtn = document.getElementById("cancelEditBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const csvFile = document.getElementById("csvFile");
const resetBtn = document.getElementById("resetBtn");
const toastEl = document.getElementById("toast");

// ------- init -------
initSelectors();
initPeriodOptions();
renderAll();

// -------------------
// State
// -------------------
function defaultState() {
  // years 2~5, terms 1~2
  const semesters = {};
  for (let y = 2; y <= 5; y++) {
    for (let t = 1; t <= 2; t++) {
      semesters[semKey(y, t)] = {
        year: y,
        term: t,
        courses: [], // {id, name, teacher, credits, day, period}
        // 用來記住每個格子目前顯示哪一門（衝堂切換用）
        cellIndex: {} // key = `${day}|${periodRow}` -> number index
      };
    }
  }
  return {
    currentYear: 2,
    currentTerm: 1,
    semesters
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // 簡單補洞：如果你之後改版本，至少不會整個壞掉
    if (!parsed.semesters) return defaultState();

    // 如果少了某些學期，補上
    const base = defaultState();
    for (const k of Object.keys(base.semesters)) {
      if (!parsed.semesters[k]) parsed.semesters[k] = base.semesters[k];
      if (!parsed.semesters[k].cellIndex) parsed.semesters[k].cellIndex = {};
      if (!Array.isArray(parsed.semesters[k].courses)) parsed.semesters[k].courses = [];
    }
    if (!parsed.currentYear) parsed.currentYear = 2;
    if (!parsed.currentTerm) parsed.currentTerm = 1;
    return parsed;
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function semKey(year, term) {
  return `Y${year}_T${term}`;
}

function currentSemester() {
  return state.semesters[semKey(state.currentYear, state.currentTerm)];
}

// -------------------
// UI init
// -------------------
function initSelectors() {
  // year: 2~5
  yearSelect.innerHTML = "";
  for (let y = 2; y <= 5; y++) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = `大${y}`;
    yearSelect.appendChild(opt);
  }

  // term: 1/2
  termSelect.innerHTML = "";
  for (let t = 1; t <= 2; t++) {
    const opt = document.createElement("option");
    opt.value = String(t);
    opt.textContent = t === 1 ? "上學期" : "下學期";
    termSelect.appendChild(opt);
  }

  yearSelect.value = String(state.currentYear);
  termSelect.value = String(state.currentTerm);

  yearSelect.addEventListener("change", () => {
    state.currentYear = Number(yearSelect.value);
    saveState();
    clearEditing();
    renderAll();
  });
  termSelect.addEventListener("change", () => {
    state.currentTerm = Number(termSelect.value);
    saveState();
    clearEditing();
    renderAll();
  });

  exportCsvBtn.addEventListener("click", exportCsv);

  csvFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importCsv(text);
    csvFile.value = ""; // reset input
  });

  resetBtn.addEventListener("click", () => {
    const sem = currentSemester();
    sem.courses = [];
    sem.cellIndex = {};
    saveState();
    clearEditing();
    renderAll();
    toast("已清空本學期課表");
  });
}

function initPeriodOptions() {
  coursePeriod.innerHTML = "";
  for (const p of PERIODS) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    coursePeriod.appendChild(opt);
  }
}

// -------------------
// Form actions
// -------------------
courseForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const payload = {
    id: editingId.value ? editingId.value : `course_${crypto.randomUUID?.() ?? String(Date.now())}`,
    name: courseName.value.trim(),
    teacher: courseTeacher.value.trim(),
    credits: Number(courseCredits.value),
    day: courseDay.value,
    period: coursePeriod.value
  };

  if (!payload.name || !payload.teacher || Number.isNaN(payload.credits)) {
    toast("請把課名 / 教授 / 學分填完整");
    return;
  }

  const sem = currentSemester();
  const idx = sem.courses.findIndex(c => c.id === payload.id);
  if (idx >= 0) sem.courses[idx] = payload;
  else sem.courses.push(payload);

  // 如果你修改了 day/period，衝堂切換索引可能不合理，保守一點：清掉 cellIndex
  sem.cellIndex = {};

  saveState();
  clearEditing();
  renderAll();
  toast(idx >= 0 ? "已更新課程" : "已加入課程");
});

cancelEditBtn.addEventListener("click", clearEditing);

function clearEditing() {
  editingId.value = "";
  courseForm.querySelector("#saveBtn").textContent = "加入 / 更新";
  cancelEditBtn.disabled = true;

  // 不清空你剛輸入的也可以，但多數人希望回到空白
  courseName.value = "";
  courseTeacher.value = "";
  courseCredits.value = "";
  courseDay.value = "Mon";
  coursePeriod.value = PERIODS[0];
}

// -------------------
// Render
// -------------------
function renderAll() {
  renderTimetable();
  renderCourseList();
  renderCredits();
}

function renderCredits() {
  const sem = currentSemester();
  const total = sem.courses.reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
  creditTotalEl.textContent = stripTrailingZeros(total);
}

function renderTimetable() {
  const sem = currentSemester();

  // group by cell day|rowPeriod
  const cellMap = new Map(); // key => courses[]
  for (const c of sem.courses) {
    const rowPeriod = normalizeToRowPeriod(c.period);
    const key = `${c.day}|${rowPeriod}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key).push(c);
  }

  // build grid
  const grid = document.createElement("div");
  grid.className = "grid";

  // header row
  grid.appendChild(headCell("節次", true, true));
  for (const d of DAYS) grid.appendChild(headCell(d.label, true, false));

  for (const rowP of GRID_PERIOD_ROWS) {
    const time = PERIOD_TIME[rowP] ? ` (${PERIOD_TIME[rowP]})` : "";
    grid.appendChild(headCell(`${rowP}${time}`, false, true));

    for (const d of DAYS) {
      const key = `${d.key}|${rowP}`;
      const list = cellMap.get(key) ?? [];

      const slot = document.createElement("div");
      slot.className = "slot " + (list.length === 0 ? "empty" : "");
      slot.dataset.cellKey = key;

      if (list.length === 0) {
        slot.innerHTML = `<div class="badge"><span class="pill">空</span><span>點右側新增課程</span></div>`;
      } else {
        // choose which to show based on cellIndex
        const currentIdx = sem.cellIndex[key] ?? 0;
        const showIdx = ((currentIdx % list.length) + list.length) % list.length;
        const c = list[showIdx];

        const conflict = list.length > 1;
        slot.innerHTML = `
          <div class="badge">
            <span class="pill ${conflict ? "conflict" : ""}">${conflict ? `衝堂 ${showIdx+1}/${list.length}` : "課程"}</span>
            <span>${stripTrailingZeros(c.credits)} 學分</span>
          </div>
          <div class="courseTitle">${escapeHtml(c.name)}</div>
          <div class="courseMeta">${escapeHtml(c.teacher)}</div>
        `;

        if (conflict) {
          slot.title = "此格有多堂課，點一下可切換顯示";
        }
      }

      slot.addEventListener("click", () => {
        // toggle among conflicts
        const listNow = cellMap.get(key) ?? [];
        if (listNow.length <= 1) return;
        sem.cellIndex[key] = (sem.cellIndex[key] ?? 0) + 1;
        saveState();
        renderTimetable(); // only timetable needs rerender
      });

      const cell = document.createElement("div");
      cell.className = "cell";
      cell.appendChild(slot);
      grid.appendChild(cell);
    }
  }

  timetableEl.innerHTML = "";
  timetableEl.appendChild(grid);
}

function renderCourseList() {
  const sem = currentSemester();
  const sorted = [...sem.courses].sort((a,b) => {
    const dayOrder = DAYS.findIndex(d => d.key === a.day) - DAYS.findIndex(d => d.key === b.day);
    if (dayOrder !== 0) return dayOrder;
    return String(a.period).localeCompare(String(b.period), "zh-Hant");
  });

  if (sorted.length === 0) {
    courseListEl.innerHTML = `<div class="muted">目前本學期沒有課。用上方表單新增，或匯入 CSV。</div>`;
    return;
  }

  courseListEl.innerHTML = "";
  for (const c of sorted) {
    const item = document.createElement("div");
    item.className = "item";

    item.innerHTML = `
      <div class="left">
        <div class="courseTitle">${escapeHtml(c.name)} <span class="pill">${stripTrailingZeros(c.credits)}學分</span></div>
        <div class="courseMeta">${escapeHtml(c.teacher)}｜${dayLabel(c.day)} ${escapeHtml(c.period)}（顯示列：${normalizeToRowPeriod(c.period)}）</div>
      </div>
      <div class="right">
        <button class="smallBtn" data-act="edit">編輯</button>
        <button class="smallBtn danger" data-act="del">刪除</button>
      </div>
    `;

    item.querySelector('[data-act="edit"]').addEventListener("click", () => startEdit(c.id));
    item.querySelector('[data-act="del"]').addEventListener("click", () => deleteCourse(c.id));

    courseListEl.appendChild(item);
  }
}

function startEdit(id) {
  const sem = currentSemester();
  const c = sem.courses.find(x => x.id === id);
  if (!c) return;

  editingId.value = c.id;
  courseName.value = c.name;
  courseTeacher.value = c.teacher;
  courseCredits.value = String(c.credits);
  courseDay.value = c.day;
  coursePeriod.value = c.period;

  courseForm.querySelector("#saveBtn").textContent = "更新課程";
  cancelEditBtn.disabled = false;
  toast("進入編輯模式");
}

function deleteCourse(id) {
  const sem = currentSemester();
  sem.courses = sem.courses.filter(c => c.id !== id);
  sem.cellIndex = {}; // 清掉切換索引避免殘留
  saveState();
  if (editingId.value === id) clearEditing();
  renderAll();
  toast("已刪除課程");
}

// -------------------
// CSV import/export
// -------------------
function exportCsv() {
  // export ALL semesters to one CSV (比較方便備份/搬家)
  const rows = [];
  rows.push(["year","term","day","period","name","teacher","credits","id"].join(","));

  for (const key of Object.keys(state.semesters)) {
    const sem = state.semesters[key];
    for (const c of sem.courses) {
      rows.push([
        sem.year,
        sem.term,
        c.day,
        csvEscape(c.period),
        csvEscape(c.name),
        csvEscape(c.teacher),
        stripTrailingZeros(c.credits),
        csvEscape(c.id)
      ].join(","));
    }
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "timetable.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  toast("已匯出 timetable.csv（包含所有學期）");
}

function importCsv(text) {
  const parsed = parseCsv(text);
  if (parsed.length === 0) {
    toast("CSV 內容是空的或格式不正確");
    return;
  }

  // Expect header
  const header = parsed[0].map(h => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const need = ["year","term","day","period","name","teacher","credits","id"];
  for (const col of need) {
    if (idx(col) === -1) {
      toast(`CSV 缺少欄位：${col}`);
      return;
    }
  }

  // Reset all courses then import (保守：避免混到舊資料)
  for (const k of Object.keys(state.semesters)) {
    state.semesters[k].courses = [];
    state.semesters[k].cellIndex = {};
  }

  for (let i = 1; i < parsed.length; i++) {
    const r = parsed[i];
    if (r.length === 1 && String(r[0]).trim() === "") continue;

    const year = Number(r[idx("year")]);
    const term = Number(r[idx("term")]);
    const key = semKey(year, term);
    if (!state.semesters[key]) continue;

    const course = {
      id: String(r[idx("id")] ?? `course_${Date.now()}_${i}`),
      day: String(r[idx("day")] ?? "Mon"),
      period: String(r[idx("period")] ?? "1-2"),
      name: String(r[idx("name")] ?? ""),
      teacher: String(r[idx("teacher")] ?? ""),
      credits: Number(r[idx("credits")] ?? 0),
    };

    // basic validate
    if (!course.name) continue;
    state.semesters[key].courses.push(course);
  }

  saveState();
  clearEditing();
  renderAll();
  toast("已匯入 CSV（已覆蓋原本資料）");
}

// -------------------
// Helpers
// -------------------
function headCell(text, isTop, isLeft) {
  const d = document.createElement("div");
  d.className = "head";
  if (!isTop) d.className = "cell rowHead";
  if (isTop && isLeft) d.className = "head rowHead";
  d.textContent = text;
  return d;
}

function dayLabel(key) {
  return (DAYS.find(d => d.key === key)?.label) ?? key;
}

// 你的課可能選「1」「2」這種，課表列用「1-2」這種：這邊做映射
function normalizeToRowPeriod(period) {
  const p = String(period).trim();
  // 你的課表列就是單一節次（1~9/A/B），所以直接回傳
  return p;
}

function stripTrailingZeros(num) {
  const n = Number(num);
  if (Number.isNaN(n)) return "0";
  return (Math.round(n * 100) / 100).toString().replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function csvEscape(s) {
  const v = String(s ?? "");
  if (/[",\n]/.test(v)) return `"${v.replaceAll('"', '""')}"`;
  return v;
}

// Minimal CSV parser (handles quotes)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch === "\r") { /* ignore */ }
      else cur += ch;
    }
  }
  row.push(cur);
  rows.push(row);

  // trim trailing empty rows
  while (rows.length && rows[rows.length - 1].every(x => String(x).trim() === "")) rows.pop();
  return rows;
}
