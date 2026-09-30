import { api } from "./api.js";
import { HealthBleClient, VitalSimulator } from "./ble.js";
import { VitalChart } from "./chart.js";
import { hydrateIcons } from "./icons.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const CONDITIONS = [["hypertension", "Tăng huyết áp"], ["diabetes", "Đái tháo đường"], ["cardiovascular", "Bệnh tim mạch"], ["stroke", "Đột quỵ"]];
const MEMBERS = [
  { id: "father", label: "Bố", relation: "father", side: "immediate" },
  { id: "mother", label: "Mẹ", relation: "mother", side: "immediate" },
  { id: "sibling", label: "Anh chị em ruột", relation: "sibling", side: "immediate" },
  { id: "paternal-grandfather", label: "Ông nội", relation: "grandfather", side: "paternal" },
  { id: "paternal-grandmother", label: "Bà nội", relation: "grandmother", side: "paternal" },
  { id: "maternal-grandfather", label: "Ông ngoại", relation: "grandfather", side: "maternal" },
  { id: "maternal-grandmother", label: "Bà ngoại", relation: "grandmother", side: "maternal" },
];
const METRICS = [
  { key: "systolic", label: "Huyết áp", unit: "mmHg" },
  { key: "heart_rate", label: "Nhịp tim", unit: "lần/phút" },
  { key: "spo2", label: "Oxy trong máu (SpO₂)", unit: "%" },
  { key: "glucose", label: "Đường huyết", unit: "mg/dL" },
];
const KEYS = ["heart_rate", "systolic", "diastolic", "spo2", "glucose"];
const LEVELS = { safe: "Không có cảnh báo", attention: "Cần chú ý", alert: "Nên đi khám sớm", emergency: "Nguy hiểm" };
const SUMMARY_FALLBACK = { safe: "Các chỉ số vừa đo chưa chạm ngưỡng cảnh báo.", attention: "Có chỉ số cần theo dõi. Đo lại vào lần sau và ghi chép đều đặn.", alert: "Nguy cơ tổng hợp ở mức cao. Nên sắp xếp đi khám.", emergency: "Có chỉ số ở mức nguy hiểm." };
const SOURCE_NAMES = { manual: "Nhập tay", ble: "Máy đo Bluetooth", simulation: "Dữ liệu mẫu" };
const isEmergency = result => Boolean(result?.alerts?.some(a => a.severity === "alert"));
const levelOf = result => isEmergency(result) ? "emergency" : result.risk_level;
const isReal = record => (record.vitals?.source || "manual") !== "simulation";
const DOCUMENT_TYPES = { lab_result: "Kết quả xét nghiệm", prescription: "Đơn thuốc", discharge_note: "Giấy ra viện", imaging_report: "Kết quả chẩn đoán hình ảnh", vaccination: "Tiêm chủng", other: "Tài liệu sức khỏe" };
const FLAG_NAMES = { normal: "Trong khoảng", high: "Cao", low: "Thấp", abnormal: "Cần xem lại", unknown: "Chưa rõ" };
const state = { user: null, health: null, records: [], result: null, step: 0, editing: false, rating: 0,
  medicalRecords: [], pendingMedical: null, documentAiEnabled: false, aiProvider: "AI", previewUrl: null,
  deviceSource: null, deviceValues: {}, deviceTimes: {}, samples: [], deviceEpoch: 0, authEpoch: 0, busy: false, view: "dashboard" };
let ble = null;
let simulator = null;
let freshnessTimer = null;
const chart = new VitalChart($("#vital-chart"));
const accountChannel = "BroadcastChannel" in window ? new BroadcastChannel("genesense-account") : null;

function toast(text, type = "") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = text;
  $("#toast-region").append(el);
  setTimeout(() => el.remove(), 4500);
}
function errorAt(id, text = "") {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("hidden", !text);
}
function screen(name) {
  ["loading", "login", "onboarding", "app"].forEach(key => $("#" + key + "-screen").classList.toggle("hidden", key !== name));
  if (name !== "app") document.title = "GeneSense - Theo dõi sức khỏe";
  window.scrollTo(0, 0);
}
function date(value, time = true) {
  const parsed = new Date(value?.endsWith?.("Z") || /[+-]\d{2}:\d{2}$/.test(value) ? value : value + "Z");
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(parsed);
}
function valueOf(key, values = {}) {
  if (values[key] == null) return "-";
  if (key === "systolic") return Math.round(values.systolic) + "/" + (values.diastolic == null ? "-" : Math.round(values.diastolic));
  return key === "spo2" ? String(Math.round(values[key] * 10) / 10) : Math.round(values[key]).toString();
}
function statusOf(key, v) {
  if (v[key] == null) return ["neutral", "Chưa đo"];
  const n = v[key];
  if (key === "heart_rate") return n < 40 || n > 150 ? ["alert", "Nguy hiểm"] : n < 50 || n > 110 ? ["attention", "Cần chú ý"] : ["safe", "Trong ngưỡng"];
  if (key === "spo2") return n < 90 ? ["alert", "Nguy hiểm"] : n < 95 ? ["attention", "Thấp, cần chú ý"] : ["safe", "Trong ngưỡng"];
  if (key === "systolic") return n >= 180 || v.diastolic >= 120 ? ["alert", "Nguy hiểm"] : n >= 140 || v.diastolic >= 90 ? ["attention", "Cao, cần chú ý"] : ["safe", "Trong ngưỡng"];
  if (key === "glucose") return n < 54 || n > 300 ? ["alert", "Nguy hiểm"] : n < 70 || n > 180 ? ["attention", "Cần chú ý"] : ["safe", "Trong ngưỡng"];
  return ["safe", "Trong ngưỡng"];
}
function personalize() {
  $$("[data-user-name]").forEach(el => el.textContent = state.user.display_name);
  $("#greeting").textContent = "Xin chào, " + state.user.display_name;
  $("#demo-banner").classList.toggle("hidden", !state.user.is_demo);
  const today = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" }).format(new Date());
  $("#today-date").textContent = today.charAt(0).toUpperCase() + today.slice(1);
}
function navigate(view) {
  if (!state.user || !state.health) return;
  state.view = ["dashboard", "records", "history", "profile"].includes(view) ? view : "dashboard";
  $$(".view").forEach(el => el.classList.toggle("hidden", el.id !== state.view + "-view"));
  $$("[data-nav]").forEach(button => {
    button.classList.toggle("active", button.dataset.nav === state.view);
    if (button.dataset.nav === state.view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.title = { dashboard: "Hôm nay", records: "Giấy tờ sức khỏe", history: "Lịch sử đo", profile: "Hồ sơ" }[state.view] + " - GeneSense";
  window.history.replaceState(null, "", "#" + state.view);
  if (state.view === "profile") renderProfile();
  if (state.view === "records") renderMedicalRecords();
  if (state.view === "history") { renderHistory(); renderTips(); requestAnimationFrame(renderChart); }
  window.scrollTo(0, 0);
}

function conditionChips(name, selected = []) {
  return CONDITIONS.map(([value, label]) => '<label><input type="checkbox" name="' + name + '" value="' + value + '"' + (selected.includes(value) ? " checked" : "") + "><span>" + label + "</span></label>").join("");
}
function fillWizard(health = null) {
  $("#onboarding-form").reset();
  $("#display-name").value = health?.display_name || (state.user.is_demo ? "" : state.user.display_name);
  const p = health?.profile;
  ["age", "sex"].forEach(key => $("#" + key).value = p?.[key] ?? "");
  $("#height").value = p?.height_cm ?? "";
  $("#weight").value = p?.weight_kg ?? "";
  $("#activity").value = p?.activity_minutes_week ?? 0;
  $("#smoker").checked = p?.smoker ?? false;
  $("#personal-notes").value = health?.personal_notes || "";
  $("#paternal-notes").value = health?.paternal_notes || "";
  $("#maternal-notes").value = health?.maternal_notes || "";
  $("#health-consent").checked = health?.health_consent ?? false;
  $("#ai-consent").checked = health?.ai_consent ?? false;
  $("#personal-conditions").innerHTML = conditionChips("personal_conditions", p?.known_conditions);
  for (const side of ["immediate", "paternal", "maternal"]) {
    $("#family-" + side).innerHTML = MEMBERS.filter(m => m.side === side).map(member => {
      const saved = health?.family_history?.find(item => item.member_id === member.id);
      const knowledge = saved?.knowledge || "unknown";
      return '<div class="family-member" data-member="' + member.id + '"><div class="member-top"><strong>' + member.label + '</strong><label class="visually-hidden" for="knowledge-' + member.id + '">Tiền sử ' + member.label + '</label><select id="knowledge-' + member.id + '" data-knowledge><option value="unknown"' + (knowledge === "unknown" ? " selected" : "") + '>Chưa rõ</option><option value="none"' + (knowledge === "none" ? " selected" : "") + '>Không có bệnh đã biết</option><option value="known"' + (knowledge === "known" ? " selected" : "") + '>Có bệnh đã biết</option></select></div><div class="chips"' + (knowledge === "known" ? "" : " hidden") + '>' + conditionChips(member.id, saved?.conditions) + "</div></div>";
    }).join("");
  }
  $("#onboarding-exit").textContent = state.editing ? "Về hồ sơ" : "Đăng xuất";
  state.step = 0;
  showStep();
  updateBmi();
}
function updateBmi() {
  const h = Number($("#height").value) / 100, w = Number($("#weight").value);
  $("#bmi-output").textContent = h > 0 && w > 0 ? "Chỉ số BMI: " + (w / h ** 2).toFixed(1) : "Chỉ số BMI được tính từ chiều cao và cân nặng.";
}
function showStep() {
  $$("[data-step]").forEach(el => el.hidden = Number(el.dataset.step) !== state.step);
  $$("[data-step-indicator]").forEach(el => { el.classList.toggle("active", Number(el.dataset.stepIndicator) === state.step); el.classList.toggle("done", Number(el.dataset.stepIndicator) < state.step); });
  $("#step-caption").textContent = "Bước " + (state.step + 1) + " trên 3";
  $("#onboarding-progress").value = state.step + 1;
  $("#step-back").hidden = state.step === 0;
  $("#step-next").textContent = state.step === 2 ? (state.editing ? "Lưu thay đổi" : "Hoàn tất") : "Tiếp tục";
  errorAt("#onboarding-error");
}
function validCurrentStep() {
  const active = $('[data-step="' + state.step + '"]');
  const invalid = [...active.querySelectorAll("input, select, textarea")].find(el => !el.checkValidity());
  if (invalid) { invalid.reportValidity(); invalid.focus(); return false; }
  const missing = [...active.querySelectorAll("[data-member]")].find(el => el.querySelector("select").value === "known" && !el.querySelector("input:checked"));
  if (missing) {
    errorAt("#onboarding-error", "Hãy chọn bệnh đã biết cho " + MEMBERS.find(m => m.id === missing.dataset.member).label + ", hoặc chọn “Chưa rõ” và ghi chú thêm.");
    missing.querySelector("select").focus();
    return false;
  }
  return true;
}
function readWizard() {
  return {
    display_name: $("#display-name").value.trim(),
    profile: { age: Number($("#age").value), sex: $("#sex").value, height_cm: Number($("#height").value), weight_kg: Number($("#weight").value),
      smoker: $("#smoker").checked, activity_minutes_week: Number($("#activity").value), known_conditions: $$('#personal-conditions input:checked').map(el => el.value) },
    family_history: MEMBERS.map(m => {
      const el = $('[data-member="' + m.id + '"]');
      const knowledge = el.querySelector("select").value;
      return { member_id: m.id, relation: m.relation, side: m.side, knowledge,
        conditions: knowledge === "known" ? [...el.querySelectorAll("input:checked")].map(box => box.value) : [] };
    }),
    personal_notes: $("#personal-notes").value.trim(), paternal_notes: $("#paternal-notes").value.trim(), maternal_notes: $("#maternal-notes").value.trim(),
    ai_consent: $("#ai-consent").checked, health_consent: $("#health-consent").checked,
  };
}
async function nextStep(event) {
  event.preventDefault();
  if (!validCurrentStep()) return;
  if (state.step < 2) {
    state.step++;
    showStep();
    $("#onboarding-form").scrollIntoView({ block: "start" });
    return;
  }
  const button = $("#step-next");
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = "Đang lưu…";
  const epoch = state.authEpoch;
  try {
    const data = await api.saveProfile(readWizard());
    if (state.authEpoch !== epoch) return;
    state.user = data.user; state.health = data.health;
    const wasEditing = state.editing;
    state.editing = false;
    personalize();
    screen("app");
    await refreshRecords();
    navigate(wasEditing ? "profile" : "dashboard");
    toast(wasEditing ? "Đã lưu hồ sơ." : "Đã lưu hồ sơ. Bạn có thể ghi chỉ số đầu tiên.");
  } catch (error) { errorAt("#onboarding-error", error.message); }
  finally { button.disabled = false; button.innerHTML = original; }
}

function renderMetrics() {
  const values = state.result?.measured_vitals || {};
  $("#metric-grid").innerHTML = METRICS.map(m => {
    const [level, status] = statusOf(m.key, values);
    const measured = values[m.key] != null;
    const flag = level === "attention" || level === "alert" ? '<span class="reading-flag flag-' + level + '">' + status + "</span>" : "";
    return '<div class="reading"><span class="reading-name">' + m.label + "</span>" + (measured ? '<span class="reading-value">' + valueOf(m.key, values) + "<small>" + m.unit + "</small></span>" : '<span class="reading-value empty">Chưa đo</span>') + flag + "</div>";
  }).join("");
}
function renderTips() {
  const tips = state.result?.insight.tips || [
    { title: "Bắt đầu với một chỉ số", action: "Có thể chỉ nhập huyết áp hoặc nhịp tim. Không cần đủ tất cả chỉ số." },
    { title: "Đo trong cùng điều kiện", action: "Ngồi nghỉ 5 phút trước khi đo và làm theo hướng dẫn của máy đo." },
    { title: "Hỏi thêm người thân", action: "Nếu chưa rõ tiền sử bệnh trong gia đình, hãy hỏi bố mẹ rồi cập nhật hồ sơ." },
  ];
  $("#tip-list").innerHTML = tips.slice(0, 4).map(tip => "<li><strong>" + esc(tip.title) + ".</strong> " + esc(tip.action) + "</li>").join("");
  $("#follow-up").textContent = state.result?.insight.follow_up || "";
}
function alertsMarkup(result) {
  return result.alerts.filter(a => a.severity !== "safe").map(a => '<div class="alert-item ' + a.severity + '"><strong>' + esc(a.metric) + ":</strong> " + esc(a.message) + "</div>").join("");
}
function renderEmergency(r) {
  const on = isEmergency(r);
  $("#emergency-panel").classList.toggle("hidden", !on);
  if (!on) return;
  const values = r.measured_vitals || {};
  const lines = METRICS.filter(m => statusOf(m.key, values)[0] === "alert").map(m => m.label + ": " + valueOf(m.key, values) + " " + m.unit);
  $("#emergency-title").textContent = "Chỉ số ở mức nguy hiểm";
  $("#emergency-list").innerHTML = lines.map(line => "<li>" + esc(line) + "</li>").join("") + "<li>Đo lúc " + esc(date(r.created_at)) + "</li>";
}
function renderDashboard() {
  const r = state.result;
  const level = r ? levelOf(r) : "neutral";
  renderEmergency(r);
  const status = $("#risk-status");
  status.className = "status-word " + (level === "emergency" ? "alert" : level);
  status.textContent = r ? LEVELS[level] : "Chưa có dữ liệu";
  $("#risk-summary").textContent = r ? (level === "emergency" ? SUMMARY_FALLBACK.emergency : r.insight.summary || SUMMARY_FALLBACK[level]) : "Nhập chỉ số từ máy đo để xem đánh giá đầu tiên.";
  $("#result-date").textContent = r ? "Đo lúc " + date(r.created_at) + ", " + SOURCE_NAMES[r.measurement_source].toLowerCase() + (r.measurement_source === "simulation" ? " (không phải dữ liệu thật)" : "") : "";
  $("#score-details").classList.toggle("hidden", !r);
  $("#result-alerts").innerHTML = r && level !== "emergency" ? alertsMarkup(r) : "";
  if (r) {
    $("#risk-score").textContent = Math.round(r.scores.overall);
    ["pgrs", "brs", "vital"].forEach(key => { $("#" + key + "-score").textContent = Math.round(r.scores[key === "vital" ? "vitals" : key]); });
  }
  const hiddenSims = r && isReal({ vitals: { source: r.measurement_source } }) && state.records.some(row => !isReal(row));
  $("#measurement-context").textContent = r ? (hiddenSims ? "Không tính dữ liệu mẫu" : "") : "";
  renderMetrics();
}
function renderChart() {
  const key = $("#chart-metric").value;
  const source = state.result?.measurement_source;
  const rows = state.records.filter(row => (row.vitals.source || "manual") === source && row.vitals[key] != null).slice(0, 30).reverse();
  $("#chart-context").textContent = rows.length ? rows.length + " lần đo, " + (source === "simulation" ? "dữ liệu mẫu" : "dữ liệu của bạn") : "";
  $("#chart-empty").classList.toggle("hidden", rows.length > 0);
  chart.setData(key, rows.map(row => ({ value: row.vitals[key], timestamp: row.created_at })));
}
function pickCurrent(rows) {
  return rows.find(isReal) || rows[0] || null;
}
async function refreshRecords() {
  const epoch = state.authEpoch;
  try {
    const rows = await api.history();
    if (epoch !== state.authEpoch) return;
    const current = pickCurrent(rows);
    const result = current ? await api.assessment(current.id) : null;
    if (epoch !== state.authEpoch) return;
    state.records = rows; state.result = result;
    renderDashboard(); renderHistory();
  } catch (error) {
    if (epoch !== state.authEpoch) return;
    toast(error.message, "error");
    renderDashboard();
    $("#history-list").innerHTML = '<div class="empty-state"><h3>Chưa tải được lịch sử</h3><p>' + esc(error.message) + '</p><button class="btn outline" id="retry-history">Thử lại</button></div>';
  }
}
function recordLevel(record) {
  const v = record.vitals || {};
  return METRICS.some(m => statusOf(m.key, v)[0] === "alert") ? "emergency" : record.risk_level;
}
function renderHistory() {
  const filter = $("#history-filter").value;
  const records = state.records.filter(row => filter === "all" || (filter === "simulation" ? !isReal(row) : isReal(row)));
  if (!records.length) {
    $("#history-list").innerHTML = '<div class="empty-state"><h3>' + (state.records.length ? "Không có lần đo phù hợp" : "Chưa có lần đo nào") + '</h3><p>Các lần đo sẽ hiện ở đây sau khi bạn ghi chỉ số.</p><button class="btn outline" id="history-add">Ghi chỉ số</button></div>';
    return;
  }
  $("#history-list").innerHTML = '<table class="history-table"><thead><tr><th>Thời gian</th><th>Chỉ số</th><th>Kết quả</th><th><span class="visually-hidden">Thao tác</span></th></tr></thead><tbody>' + records.map(record => {
    const readings = METRICS.filter(m => record.vitals[m.key] != null).map(m => valueOf(m.key, record.vitals) + " " + m.unit).join(", ");
    const level = recordLevel(record);
    return "<tr><td>" + esc(date(record.created_at)) + '<span class="source">' + esc(SOURCE_NAMES[record.vitals.source || "manual"]) + "</span></td><td>" + esc(readings) + '</td><td><span class="tag ' + (level === "emergency" ? "alert" : level) + '">' + LEVELS[level] + '</span></td><td><button class="link-button" data-record="' + esc(record.id) + '">Xem chi tiết</button></td></tr>';
  }).join("") + "</tbody></table>";
}
async function showResult(id) {
  const epoch = state.authEpoch;
  try {
    const r = await api.assessment(id);
    if (epoch !== state.authEpoch) return;
    const level = levelOf(r);
    $("#result-detail").innerHTML = '<p class="note">Đo lúc ' + date(r.created_at) + ", " + esc(SOURCE_NAMES[r.measurement_source].toLowerCase()) + '</p><span class="tag ' + (level === "emergency" ? "alert" : level) + '">' + LEVELS[level] + "</span>" + (level === "emergency" ? '<p style="margin-top:16px"><a class="btn primary" href="tel:115">Gọi cấp cứu 115</a></p>' : "") + '<p style="margin-top:16px">' + esc(r.insight.summary) + '</p><div class="result-detail-vitals">' + METRICS.map(m => "<div><span>" + m.label + "</span><strong>" + (r.measured_vitals?.[m.key] == null ? "Chưa đo" : valueOf(m.key, r.measured_vitals) + " " + m.unit) + "</strong></div>").join("") + "</div>" + alertsMarkup(r) + (r.insight.follow_up ? '<p class="note">' + esc(r.insight.follow_up) + "</p>" : "");
    $("#result-dialog").showModal();
  } catch (error) { toast(error.message, "error"); }
}
function renderProfile() {
  const h = state.health, p = h.profile;
  const conditionName = key => CONDITIONS.find(([id]) => id === key)?.[1];
  const conditions = p.known_conditions.map(conditionName).filter(Boolean);
  const familySection = (side, title, notes) => '<article class="panel' + (side === "immediate" ? " full" : "") + '"><h2>' + title + '</h2><dl class="facts">' + MEMBERS.filter(m => m.side === side).map(m => {
    const saved = h.family_history.find(row => row.member_id === m.id);
    const text = saved?.knowledge === "none" ? "Không có bệnh đã biết" : saved?.conditions?.length ? saved.conditions.map(conditionName).join(", ") : "Chưa rõ";
    return "<dt>" + m.label + "</dt><dd>" + esc(text) + "</dd>";
  }).join("") + "</dl>" + (notes ? "<h3>Ghi chú</h3><p>" + esc(notes) + "</p>" : "") + "</article>";
  $("#profile-content").innerHTML = '<div class="profile-grid"><article class="panel full"><h2>' + esc(h.display_name) + '</h2><p class="note">' + esc(state.user.email || "Hồ sơ mẫu") + '</p><dl class="facts"><dt>Tuổi</dt><dd>' + p.age + "</dd><dt>Chiều cao</dt><dd>" + p.height_cm + " cm</dd><dt>Cân nặng</dt><dd>" + p.weight_kg + " kg</dd><dt>BMI</dt><dd>" + (p.weight_kg / (p.height_cm / 100) ** 2).toFixed(1) + "</dd><dt>Bệnh đã chẩn đoán</dt><dd>" + esc(conditions.join(", ") || "Không khai báo") + "</dd><dt>Vận động</dt><dd>" + p.activity_minutes_week + " phút mỗi tuần</dd><dt>Hút thuốc</dt><dd>" + (p.smoker ? "Có" : "Không") + "</dd><dt>Dùng AI giải thích kết quả</dt><dd>" + (h.ai_consent ? "Đã cho phép" : "Chưa cho phép") + "</dd></dl>" + (h.personal_notes ? "<h3>Ghi chú</h3><p>" + esc(h.personal_notes) + "</p>" : "") + "</article>" + familySection("immediate", "Bố, mẹ và anh chị em") + familySection("paternal", "Bên nội", h.paternal_notes) + familySection("maternal", "Bên ngoại", h.maternal_notes) + "</div>";
}

function analysisMarkup(analysis) {
  const metricRows = analysis.metrics?.length ? '<div class="extracted-metrics">' + analysis.metrics.map(metric => {
    const badge = metric.flag === "normal" ? "safe" : metric.flag === "unknown" ? "neutral" : "attention";
    return '<div><span><strong>' + esc(metric.name) + '</strong><small>' + esc(metric.reference_range ? "Tham chiếu: " + metric.reference_range : "Không có khoảng tham chiếu") + '</small></span><span class="metric-value">' + esc(metric.value) + " " + esc(metric.unit) + '</span><span class="tag ' + badge + '">' + esc(FLAG_NAMES[metric.flag] || "Chưa rõ") + "</span></div>";
  }).join("") + "</div>" : "";
  const list = (title, values, tone = "") => values?.length ? '<section class="extracted-list ' + tone + '"><strong>' + title + '</strong><ul>' + values.map(value => "<li>" + esc(value) + "</li>").join("") + "</ul></section>" : "";
  const medications = analysis.medications?.length ? '<section class="extracted-list"><strong>Thuốc được ghi trên tài liệu</strong><ul>' + analysis.medications.map(item => "<li>" + esc(item.name) + (item.dose ? ", " + esc(item.dose) : "") + (item.frequency ? ", " + esc(item.frequency) : "") + "</li>").join("") + "</ul></section>" : "";
  return '<div class="analysis-summary"><div class="record-meta"><span>' + esc(DOCUMENT_TYPES[analysis.document_type] || "Tài liệu sức khỏe") + '</span><span>' + esc(analysis.document_date ? date(analysis.document_date, false) : "Không rõ ngày") + '</span><span>' + esc(analysis.provider || "Không rõ cơ sở") + '</span></div><h3>' + esc(analysis.title) + '</h3><p>' + esc(analysis.summary) + "</p></div>" + metricRows + list("Thông tin bệnh được ghi", analysis.conditions) + medications + list("Đề xuất được ghi trên tài liệu", analysis.recommendations) + list("Điểm cần kiểm tra lại", analysis.warnings, "warning") + '<p class="analysis-disclaimer">' + esc(analysis.disclaimer) + "</p>";
}

function renderMedicalRecords() {
  if (!state.medicalRecords.length) {
    $("#medical-record-list").innerHTML = '<article class="panel empty-state"><h2>Chưa có giấy tờ nào</h2><p class="note">Giấy tờ đã lưu sẽ hiện ở đây.</p></article>';
    return;
  }
  $("#medical-record-list").innerHTML = state.medicalRecords.map(record => {
    const a = record.analysis;
    const notable = (a.metrics || []).filter(metric => !["normal", "unknown"].includes(metric.flag)).length;
    return '<article class="panel medical-record"><div class="record-meta"><span>' + esc(DOCUMENT_TYPES[a.document_type] || "Tài liệu sức khỏe") + "</span><span>" + esc(a.document_date ? date(a.document_date, false) : date(record.created_at, false)) + "</span>" + (notable ? '<span class="tag attention">' + notable + " mục cần xem lại</span>" : "") + "</div><h2>" + esc(a.title) + "</h2><p>" + esc(a.summary) + '</p><details class="record-details"><summary>Xem nội dung đã lưu</summary>' + analysisMarkup(a) + '</details><div class="record-actions"><button class="delete-record" data-delete-record="' + esc(record.id) + '">Xóa</button></div></article>';
  }).join("");
}

async function refreshMedicalRecords() {
  const epoch = state.authEpoch;
  try {
    const records = await api.medicalRecords();
    if (epoch !== state.authEpoch) return;
    state.medicalRecords = records;
    renderMedicalRecords();
  } catch (error) {
    if (epoch !== state.authEpoch) return;
    $("#medical-record-list").innerHTML = '<article class="panel empty-state"><h2>Chưa tải được danh sách giấy tờ</h2><p>' + esc(error.message) + "</p></article>";
  }
}

function resetMedicalUpload() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  state.pendingMedical = null;
  $("#medical-document-file").value = "";
  $("#document-ai-consent").checked = false;
  $("#confirm-medical-record").checked = false;
  $("#document-preview").removeAttribute("src");
  $("#document-preview").classList.add("hidden");
  $(".document-drop").classList.remove("has-file");
  $("#upload-stage").classList.remove("hidden");
  $("#review-stage").classList.add("hidden");
  $("#analyze-document").disabled = true;
  $("#save-medical-record").disabled = true;
  errorAt("#document-error");
  errorAt("#record-save-error");
}

function updateDocumentButton() {
  const file = $("#medical-document-file").files[0];
  $("#analyze-document").disabled = !state.documentAiEnabled || !file || !$("#document-ai-consent").checked || state.busy;
}

function openMedicalUpload() {
  resetMedicalUpload();
  $("#medical-upload-dialog").showModal();
}

function selectMedicalImage() {
  const file = $("#medical-document-file").files[0];
  errorAt("#document-error");
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  $("#document-preview").classList.add("hidden");
  $(".document-drop").classList.remove("has-file");
  if (!file) { updateDocumentButton(); return; }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    errorAt("#document-error", "Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
    $("#medical-document-file").value = "";
  } else if (file.size > 8 * 1024 * 1024) {
    errorAt("#document-error", "Ảnh vượt quá giới hạn 8 MB.");
    $("#medical-document-file").value = "";
  } else {
    state.previewUrl = URL.createObjectURL(file);
    $("#document-preview").src = state.previewUrl;
    $("#document-preview").classList.remove("hidden");
    $(".document-drop").classList.add("has-file");
  }
  updateDocumentButton();
}

async function analyzeMedicalDocument() {
  const file = $("#medical-document-file").files[0];
  if (!file || !$("#document-ai-consent").checked || state.busy) return;
  state.busy = true;
  const button = $("#analyze-document");
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = "Đang đọc ảnh…";
  errorAt("#document-error");
  const body = new FormData();
  body.append("file", file);
  body.append("consent", "true");
  const epoch = state.authEpoch;
  try {
    const result = await api.analyzeMedicalRecord(body);
    if (epoch !== state.authEpoch) return;
    state.pendingMedical = result;
    $("#document-analysis-preview").innerHTML = analysisMarkup(result.analysis) + '<p class="privacy-result">' + esc(result.privacy_note) + "</p>";
    $("#upload-stage").classList.add("hidden");
    $("#review-stage").classList.remove("hidden");
  } catch (error) { errorAt("#document-error", error.message); }
  finally { state.busy = false; button.innerHTML = original; updateDocumentButton(); }
}

async function saveMedicalRecord() {
  if (!state.pendingMedical || !$("#confirm-medical-record").checked || state.busy) return;
  state.busy = true;
  const button = $("#save-medical-record");
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = "Đang lưu…";
  const epoch = state.authEpoch;
  try {
    const saved = await api.saveMedicalRecord({ analysis: state.pendingMedical.analysis, document_hash: state.pendingMedical.document_hash, health_consent: true });
    if (epoch !== state.authEpoch) return;
    state.medicalRecords = [saved, ...state.medicalRecords.filter(record => record.id !== saved.id)];
    $("#medical-upload-dialog").close();
    renderMedicalRecords();
    navigate("records");
    toast("Đã lưu giấy tờ.");
  } catch (error) { errorAt("#record-save-error", error.message); }
  finally { state.busy = false; button.innerHTML = original; button.disabled = !$("#confirm-medical-record").checked; }
}

async function deleteMedicalRecord(id) {
  if (!window.confirm("Xóa giấy tờ này? Không thể khôi phục sau khi xóa.")) return;
  try {
    await api.deleteMedicalRecord(id);
    state.medicalRecords = state.medicalRecords.filter(record => record.id !== id);
    renderMedicalRecords();
    toast("Đã xóa giấy tờ.");
  } catch (error) { toast(error.message, "error"); }
}

function openMeasurement(mode = "manual") {
  errorAt("#measurement-error");
  $("#measurement-dialog").showModal();
  setMeasureMode(mode);
}
function setMeasureMode(mode) {
  $("#manual-panel").hidden = mode !== "manual";
  $("#device-panel").hidden = mode !== "device";
  $$("[data-measure-mode]").forEach(button => button.classList.toggle("active", button.dataset.measureMode === mode));
  if (mode === "manual") stopStreams();
  errorAt("#measurement-error");
}
function freshValues() {
  const now = Date.now();
  const values = Object.fromEntries(KEYS.map(key => [key, now - (state.deviceTimes[key] || 0) <= 30000 ? state.deviceValues[key] ?? null : null]));
  if ((values.systolic == null) !== (values.diastolic == null)) { values.systolic = null; values.diastolic = null; }
  return values;
}
function stopStreams() {
  state.deviceEpoch++;
  simulator?.stop(); ble?.disconnect();
  simulator = null; ble = null;
  if (freshnessTimer) clearInterval(freshnessTimer);
  freshnessTimer = null;
  state.deviceSource = null; state.deviceValues = {}; state.deviceTimes = {}; state.samples = [];
  $("#device-values").classList.add("hidden"); $("#device-values").innerHTML = "";
  $("#save-device").disabled = true;
  $("#disconnect-device").classList.add("hidden");
  $("#device-name").textContent = "Kết nối máy đo qua Bluetooth";
  $("#device-message").textContent = "Bật Bluetooth trên máy đo, đặt gần điện thoại rồi bấm Kết nối.";
}
function renderDevice() {
  const v = freshValues();
  const hasData = KEYS.some(key => v[key] != null);
  $("#save-device").disabled = !hasData || state.busy;
  $("#device-values").classList.toggle("hidden", !hasData);
  $("#device-values").innerHTML = METRICS.map(m => {
    const [severity, text] = statusOf(m.key, v);
    return "<div><span>" + m.label + "</span><strong>" + valueOf(m.key, v) + " " + m.unit + '</strong> <span class="tag ' + severity + '">' + text + "</span></div>";
  }).join("");
  if (!hasData && state.deviceSource) $("#device-message").textContent = "Đang chờ chỉ số từ máy đo. Chỉ số cũ hơn 30 giây sẽ không được lưu.";
}
function ingest(detail, epoch) {
  if (epoch !== state.deviceEpoch || !state.user) return;
  for (const [key, value] of Object.entries(detail.values)) {
    if (!KEYS.includes(key) || !Number.isFinite(value)) continue;
    state.deviceValues[key] = value; state.deviceTimes[key] = Date.now();
  }
  state.samples.push({ ...freshValues(), timestamp: new Date().toISOString() });
  if (state.samples.length > 60) state.samples.shift();
  renderDevice();
}
async function connectBle() {
  stopStreams();
  const epoch = state.deviceEpoch;
  ble = new HealthBleClient(5);
  state.deviceSource = "ble";
  ble.addEventListener("data", event => ingest(event.detail, epoch));
  ble.addEventListener("connected", event => {
    if (epoch !== state.deviceEpoch) return;
    $("#device-name").textContent = event.detail.name;
    $("#device-message").textContent = "Đã kết nối. Hãy bắt đầu đo trên máy.";
    $("#disconnect-device").classList.remove("hidden");
  });
  ble.addEventListener("disconnected", () => {
    if (epoch !== state.deviceEpoch) return;
    stopStreams();
    $("#device-message").textContent = "Máy đo đã ngắt kết nối. Bấm Kết nối để thử lại.";
  });
  ble.addEventListener("error", () => { if (epoch === state.deviceEpoch) errorAt("#measurement-error", "Chưa đọc được chỉ số. Hãy thử đo lại."); });
  $("#connect-ble").disabled = true;
  errorAt("#measurement-error");
  try {
    await ble.connect();
    if (epoch === state.deviceEpoch) freshnessTimer = setInterval(renderDevice, 3000);
  } catch (error) {
    if (epoch !== state.deviceEpoch) return;
    stopStreams();
    errorAt("#measurement-error", error.name === "NotFoundError" ? "Chưa chọn máy đo. Hãy thử lại hoặc dùng Nhập tay." : error.message);
  } finally { $("#connect-ble").disabled = false; }
}
function startSimulation() {
  stopStreams();
  state.deviceSource = "simulation";
  const epoch = state.deviceEpoch;
  simulator = new VitalSimulator(5);
  simulator.addEventListener("data", event => ingest(event.detail, epoch));
  simulator.start();
  $("#device-name").textContent = "Dữ liệu mẫu";
  $("#device-message").textContent = "Chỉ số được tạo tự động để dùng thử, không phải số đo thật. Lần đo mẫu không thay đổi tình trạng trên trang Hôm nay.";
  $("#disconnect-device").classList.remove("hidden");
  freshnessTimer = setInterval(renderDevice, 3000);
}
async function saveMeasurement(values, source, samples = []) {
  if (state.busy) return;
  if (!KEYS.some(key => values[key] != null)) { errorAt("#measurement-error", "Hãy nhập ít nhất một chỉ số vừa đo."); return; }
  if ((values.systolic == null) !== (values.diastolic == null)) { errorAt("#measurement-error", "Huyết áp cần cả số trên (tâm thu) và số dưới (tâm trương)."); return; }
  if (values.systolic != null && values.systolic <= values.diastolic) { errorAt("#measurement-error", "Số tâm thu cần lớn hơn số tâm trương. Hãy kiểm tra lại máy đo."); return; }
  state.busy = true;
  const epoch = state.authEpoch;
  const button = source === "manual" ? $('#measurement-form button[type="submit"]') : $("#save-device");
  const original = button.innerHTML;
  button.disabled = true; button.textContent = "Đang lưu…";
  errorAt("#measurement-error");
  try {
    const r = await api.assess({ vitals: { ...values, timestamp: new Date().toISOString() }, source, samples });
    if (epoch !== state.authEpoch) return;
    const record = { id: r.id, created_at: r.created_at, risk_level: r.risk_level, overall_score: r.scores.overall, vitals: { ...values, source } };
    state.records = [record, ...state.records].slice(0, 30);
    // Simulated data never replaces a real reading as the current status.
    if (isReal(record) || !state.records.some(isReal)) state.result = r;
    $("#measurement-dialog").close();
    $("#measurement-form").reset();
    stopStreams();
    renderDashboard(); renderHistory(); navigate("dashboard");
    toast(state.result?.id !== r.id ? "Đã lưu lần đo mẫu vào Lịch sử đo. Tình trạng hôm nay vẫn theo số đo thật." : "Đã lưu chỉ số.");
  } catch (error) { errorAt("#measurement-error", error.message); }
  finally { state.busy = false; button.disabled = false; button.innerHTML = original; if (source !== "manual") renderDevice(); }
}
async function submitManual(event) {
  event.preventDefault();
  const form = $("#measurement-form");
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const values = Object.fromEntries(KEYS.map(key => [key, data.get(key)?.trim() ? Number(data.get(key)) : null]));
  await saveMeasurement(values, "manual");
}
function clearAccount() {
  state.authEpoch++;
  stopStreams();
  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
  state.user = null; state.health = null; state.records = []; state.result = null; state.medicalRecords = []; state.editing = false; state.rating = 0;
  resetMedicalUpload();
  $("#profile-content").innerHTML = ""; $("#history-list").innerHTML = ""; $("#medical-record-list").innerHTML = ""; $("#result-detail").innerHTML = "";
  $("#onboarding-form").reset(); $("#measurement-form").reset(); $("#feedback-form").reset();
  $("#toast-region").innerHTML = "";
}
async function signOut() {
  try {
    await api.logout();
    clearAccount(); screen("login");
    accountChannel?.postMessage("signed-out");
    window.history.replaceState(null, "", "/");
  } catch (error) { toast(error.message, "error"); }
}
function editProfile() {
  state.editing = true; fillWizard(state.health); screen("onboarding");
}
async function enterAccount(user) {
  state.user = user;
  const epoch = ++state.authEpoch;
  const data = await api.profile();
  if (epoch !== state.authEpoch) return;
  state.health = data.health; state.user = data.user;
  if (!user.onboarding_completed || !data.health) {
    state.editing = false; fillWizard(); screen("onboarding");
  } else {
    personalize(); screen("app");
    renderDashboard();
    await Promise.all([refreshRecords(), refreshMedicalRecords()]);
    navigate(location.hash.slice(1) || "dashboard");
  }
}
async function boot() {
  screen("loading");
  $("#retry-boot").classList.add("hidden");
  try {
    const config = await api.authConfig();
    state.documentAiEnabled = Boolean(config.document_ai_enabled);
    state.aiProvider = config.ai_provider || "AI";
    $("#document-ai-provider").textContent = state.aiProvider;
    $("#upload-record").disabled = !state.documentAiEnabled;
    $("#records-ai-off").classList.toggle("hidden", state.documentAiEnabled);
    $("#google-login").disabled = !config.google_enabled;
    $("#demo-entry").classList.toggle("hidden", !config.demo_enabled);
    const loginError = new URLSearchParams(location.search).get("auth_error");
    errorAt("#login-message", loginError ? "Chưa đăng nhập được với Google. Hãy thử lại hoặc chọn tài khoản khác." : !config.google_enabled ? "Đăng nhập bằng Google chưa được bật trên máy chủ này." : "");
    if (loginError) window.history.replaceState(null, "", "/");
    let user;
    try { user = await api.me(); } catch (error) { if (error.status !== 401) throw error; }
    if (user) await enterAccount(user);
    else screen("login");
  } catch (error) {
    $("#loading-screen p").textContent = error.message;
    $("#retry-boot").classList.remove("hidden");
  }
}

function bindEvents() {
  $("#google-login").addEventListener("click", () => { location.assign("/api/auth/google"); });
  $("#demo-login").addEventListener("click", async () => {
    const button = $("#demo-login"); button.disabled = true;
    try { await enterAccount(await api.demo()); accountChannel?.postMessage("account-changed"); }
    catch (error) { errorAt("#login-message", error.message); }
    finally { button.disabled = false; }
  });
  $("#retry-boot").addEventListener("click", boot);
  $("#logout").addEventListener("click", signOut);
  $("#onboarding-exit").addEventListener("click", () => { if (state.editing) { state.editing = false; screen("app"); navigate("profile"); } else signOut(); });
  $("#onboarding-form").addEventListener("submit", nextStep);
  $("#onboarding-form").addEventListener("change", event => {
    if (event.target.matches("[data-knowledge]")) {
      const chips = event.target.closest("[data-member]").querySelector(".chips");
      chips.hidden = event.target.value !== "known";
      if (chips.hidden) chips.querySelectorAll("input").forEach(input => input.checked = false);
    }
  });
  $("#step-back").addEventListener("click", () => { state.step = Math.max(0, state.step - 1); showStep(); });
  ["height", "weight"].forEach(id => $("#" + id).addEventListener("input", updateBmi));
  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-nav]");
    if (nav) navigate(nav.dataset.nav);
    const close = event.target.closest("[data-close]");
    if (close) $("#" + close.dataset.close).close();
    const record = event.target.closest("[data-record]");
    if (record) showResult(record.dataset.record);
    const deleteRecord = event.target.closest("[data-delete-record]");
    if (deleteRecord) deleteMedicalRecord(deleteRecord.dataset.deleteRecord);
    if (event.target.closest("[data-open-upload]")) openMedicalUpload();
    if (event.target.closest("[data-open-measurement]")) openMeasurement();
    if (event.target.closest("#history-add")) openMeasurement();
    if (event.target.closest("#retry-history")) refreshRecords();
  });
  $("#edit-profile").addEventListener("click", editProfile);
  $("#new-measurement").addEventListener("click", () => openMeasurement());
  $("#upload-record").addEventListener("click", openMedicalUpload);
  $("#medical-document-file").addEventListener("change", selectMedicalImage);
  $("#document-ai-consent").addEventListener("change", updateDocumentButton);
  $("#analyze-document").addEventListener("click", analyzeMedicalDocument);
  $("#analyze-another").addEventListener("click", resetMedicalUpload);
  $("#confirm-medical-record").addEventListener("change", event => { $("#save-medical-record").disabled = !event.target.checked || state.busy; });
  $("#save-medical-record").addEventListener("click", saveMedicalRecord);
  $("#medical-upload-dialog").addEventListener("close", resetMedicalUpload);
  $$("[data-measure-mode]").forEach(button => button.addEventListener("click", () => setMeasureMode(button.dataset.measureMode)));
  $("#measurement-dialog").addEventListener("close", stopStreams);
  $("#measurement-form").addEventListener("submit", submitManual);
  $("#connect-ble").addEventListener("click", connectBle);
  $("#simulate-ble").addEventListener("click", startSimulation);
  $("#disconnect-device").addEventListener("click", stopStreams);
  $("#save-device").addEventListener("click", () => saveMeasurement(freshValues(), state.deviceSource || "ble", state.samples.slice()));
  $("#chart-metric").addEventListener("change", renderChart);
  $("#refresh-history").addEventListener("click", refreshRecords);
  $("#history-filter").addEventListener("change", renderHistory);
  $("#rating-buttons").innerHTML = [1, 2, 3, 4, 5].map(n => '<button type="button" data-rating="' + n + '" aria-pressed="false">' + n + "</button>").join("");
  $("#rating-buttons").addEventListener("click", event => {
    const button = event.target.closest("[data-rating]");
    if (!button) return;
    state.rating = Number(button.dataset.rating);
    $$("[data-rating]").forEach(el => { el.classList.toggle("active", Number(el.dataset.rating) <= state.rating); el.setAttribute("aria-pressed", String(Number(el.dataset.rating) === state.rating)); });
  });
  $("#feedback-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!state.rating) { toast("Hãy chọn mức độ hài lòng từ 1 đến 5.", "error"); return; }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    const epoch = state.authEpoch;
    try {
      await api.feedback({ rating: state.rating, message: $("#feedback-message").value.trim(), assessment_id: null });
      if (epoch !== state.authEpoch) return;
      $("#feedback-form").reset(); state.rating = 0;
      $$("[data-rating]").forEach(el => { el.classList.remove("active"); el.setAttribute("aria-pressed", "false"); });
      toast("Đã gửi góp ý. Xin cảm ơn.");
    } catch (error) { toast(error.message, "error"); }
    finally { button.disabled = false; }
  });
  window.addEventListener("session-expired", () => { clearAccount(); screen("login"); errorAt("#login-message", "Phiên đã hết hạn. Hãy đăng nhập lại để tiếp tục."); });
  accountChannel?.addEventListener("message", () => { clearAccount(); boot(); });
  window.addEventListener("pagehide", stopStreams);
  window.addEventListener("pageshow", event => { if (event.persisted) { clearAccount(); boot(); } });
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !state.user) return;
    try { const me = await api.me(); if (me.id !== state.user?.id) { clearAccount(); await boot(); } }
    catch (error) { if (error.status === 401) { clearAccount(); await boot(); } }
  });
}
hydrateIcons();
bindEvents();
if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/sw.js").catch(() => {});
boot();
