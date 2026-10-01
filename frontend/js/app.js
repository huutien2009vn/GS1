import { api } from "./api.js";
import { HealthBleClient, VitalSimulator } from "./ble.js";
import { TrendChart } from "./chart.js";
import { hydrateIcons } from "./icons.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const CONDITIONS = [["hypertension", "Tăng huyết áp"], ["diabetes", "Đái tháo đường"], ["cardiovascular", "Bệnh tim mạch"], ["stroke", "Đột quỵ"], ["dyslipidemia", "Rối loạn mỡ máu"], ["breast_cancer", "Ung thư vú"], ["colorectal_cancer", "Ung thư đại trực tràng"]];
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
const LEVELS = { safe: "Trong ngưỡng an toàn", attention: "Cần chú ý", alert: "Nên đi khám sớm", emergency: "Nguy hiểm", watch: "Cần theo dõi" };
const SUMMARY_FALLBACK = { safe: "Các chỉ số vừa đo chưa chạm ngưỡng cảnh báo.", attention: "Có chỉ số cần theo dõi. Đo lại vào lần sau và ghi chép đều đặn.", alert: "Nguy cơ tổng hợp ở mức cao. Nên sắp xếp đi khám.", emergency: "Có chỉ số ở mức nguy hiểm." };
const SOURCE_NAMES = { manual: "Nhập tay", ble: "Máy đo Bluetooth", simulation: "Dữ liệu mẫu" };
const ZONES = {
  systolic: { min: 80, max: 200, zones: [[80, 140, "safe"], [140, 180, "attention"], [180, 200, "alert"]] },
  heart_rate: { min: 30, max: 170, zones: [[30, 40, "alert"], [40, 50, "attention"], [50, 110, "safe"], [110, 150, "attention"], [150, 170, "alert"]] },
  spo2: { min: 85, max: 100, zones: [[85, 90, "alert"], [90, 95, "attention"], [95, 100, "safe"]] },
  glucose: { min: 40, max: 320, zones: [[40, 54, "alert"], [54, 70, "attention"], [70, 180, "safe"], [180, 300, "attention"], [300, 320, "alert"]] },
};
const TRENDS = {
  bp: { unit: "mmHg", band: null, thresholds: [{ value: 140, color: "#0b57a4", label: "Ngưỡng cao tâm thu 140" }, { value: 90, color: "#3d8fd6", label: "Ngưỡng cao tâm trương 90" }], min: 60, max: 160, series: [["systolic", "Tâm thu", "#0b57a4"], ["diastolic", "Tâm trương", "#3d8fd6"]] },
  heart_rate: { unit: "lần/phút", band: [50, 110], min: 45, max: 120, series: [["heart_rate", "Nhịp tim", "#0b57a4"]] },
  spo2: { unit: "%", band: [95, 100], min: 88, max: 100, series: [["spo2", "SpO₂", "#0b57a4"]] },
  glucose: { unit: "mg/dL", band: [70, 180], min: 50, max: 220, series: [["glucose", "Đường huyết", "#0b57a4"]] },
};
const trendCharts = {};
const isEmergency = result => Boolean(result?.alerts?.some(a => a.severity === "alert"));
const levelOf = result => isEmergency(result) ? "emergency" : result.risk_level;
const isReal = record => (record.vitals?.source || "manual") !== "simulation";
const DOCUMENT_TYPES = { lab_result: "Kết quả xét nghiệm", prescription: "Đơn thuốc", discharge_note: "Giấy ra viện", imaging_report: "Kết quả chẩn đoán hình ảnh", vaccination: "Tiêm chủng", other: "Tài liệu sức khỏe" };
const FLAG_NAMES = { normal: "Trong khoảng tham chiếu", high: "Cao", low: "Thấp", abnormal: "Cần xem lại", unknown: "Chưa rõ" };
const state = { viewing: null, own: null, care: { patients: [], caregivers: [] }, user: null, health: null, records: [], result: null, risk: null, step: 0, editing: false, rating: 0,
  medicalRecords: [], pendingMedical: null, documentAiEnabled: false, aiProvider: "AI", previewUrl: null,
  deviceSource: null, deviceValues: {}, deviceTimes: {}, samples: [], deviceEpoch: 0, authEpoch: 0, busy: false, view: "dashboard" };
let ble = null;
let simulator = null;
let freshnessTimer = null;
const accountChannel = "BroadcastChannel" in window ? new BroadcastChannel("genesense-account") : null;

function toast(text, type = "") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = text;
  $("#toast-region").append(el);
  setTimeout(() => {
    el.classList.add("leaving");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }, 4500);
}
// Plays the exit animation before the native close, so "close" listeners still fire once, at the end.
function closeDialog(dialog) {
  if (!dialog.open || dialog.classList.contains("closing")) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { dialog.close(); return; }
  dialog.classList.add("closing");
  const done = () => { dialog.classList.remove("closing"); if (dialog.open) dialog.close(); };
  dialog.addEventListener("animationend", done, { once: true });
  setTimeout(done, 250);
}
function confirmAction(title, body = "Không thể khôi phục sau khi xóa.", okLabel = "Xóa") {
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = title;
  $("#confirm-body").textContent = body;
  $("#confirm-ok").textContent = okLabel;
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "yes"), { once: true }));
}
function errorAt(id, text = "") {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("hidden", !text);
}
function screen(name) {
  ["loading", "login", "onboarding", "app", "report"].forEach(key => $("#" + key + "-screen").classList.toggle("hidden", key !== name));
  if (name !== "app") document.title = "GeneSense - Theo dõi sức khỏe";
  window.scrollTo(0, 0);
}
const toDate = raw => { const value = String(raw ?? "").replace(/(\.\d{3})\d+/, "$1"); return new Date(value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value) ? value : value + "Z"); };
function date(value, time = true) {
  const parsed = toDate(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(parsed);
}
// Vietnamese number format: decimal comma, at most one decimal; "%" sits directly after the number.
const NUMBER_FORMAT = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const num = value => NUMBER_FORMAT.format(value);
const withUnit = (value, unit) => value + (unit === "%" ? "" : " ") + unit;
function valueOf(key, values = {}) {
  if (values[key] == null) return "-";
  if (key === "systolic") return Math.round(values.systolic) + "/" + (values.diastolic == null ? "-" : Math.round(values.diastolic));
  return key === "spo2" ? num(values[key]) : Math.round(values[key]).toString();
}
function statusOf(key, v) {
  if (v[key] == null) return ["neutral", "Chưa đo"];
  const n = v[key];
  if (key === "heart_rate") return n < 40 || n > 150 ? ["alert", "Nguy hiểm"] : n < 50 || n > 110 ? ["attention", "Cần chú ý"] : ["safe", "Trong ngưỡng an toàn"];
  if (key === "spo2") return n < 90 ? ["alert", "Nguy hiểm"] : n < 95 ? ["attention", "Thấp, cần chú ý"] : ["safe", "Trong ngưỡng an toàn"];
  if (key === "systolic") return n >= 180 || v.diastolic >= 120 ? ["alert", "Nguy hiểm"] : n >= 140 || v.diastolic >= 90 ? ["attention", "Cao, cần chú ý"] : ["safe", "Trong ngưỡng an toàn"];
  if (key === "glucose") return n < 54 || n > 300 ? ["alert", "Nguy hiểm"] : n < 70 || n > 180 ? ["attention", "Cần chú ý"] : ["safe", "Trong ngưỡng an toàn"];
  return ["safe", "Trong ngưỡng an toàn"];
}
function personalize() {
  $$("[data-user-name]").forEach(el => el.textContent = state.user.display_name);
  $("#greeting").textContent = state.viewing ? "Hồ sơ của " + state.viewing.name : "Xin chào, " + state.user.display_name;
  $("#demo-banner").classList.toggle("hidden", !state.user.is_demo);
  // Only trial accounts may create sample readings, so a real account's history never holds invented numbers.
  $("#simulate-ble").classList.toggle("hidden", !state.user.is_demo);
  const today = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" }).format(new Date());
  $("#today-date").textContent = today.charAt(0).toUpperCase() + today.slice(1);
}
function navigate(view) {
  if (!state.user || !state.health) return;
  state.view = ["dashboard", "records", "history", "genetics", "profile"].includes(view) && !(state.viewing && view === "records") ? view : "dashboard";
  $$(".view").forEach(el => el.classList.toggle("hidden", el.id !== state.view + "-view"));
  $$("[data-nav]").forEach(button => {
    button.classList.toggle("active", button.dataset.nav === state.view);
    if (button.dataset.nav === state.view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.title = { dashboard: "Hôm nay", records: "Giấy tờ sức khỏe", history: "Lịch sử đo", genetics: "Di truyền", profile: "Hồ sơ" }[state.view] + " - GeneSense";
  window.history.replaceState(null, "", "#" + state.view);
  if (state.view === "profile") renderProfile();
  if (state.view === "genetics") renderGenetics();
  if (state.view === "records") renderMedicalRecords();
  if (state.view === "history") { renderHistory(); renderTips(); renderTrends(); }
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
      return '<div class="family-member" data-member="' + member.id + '"><div class="member-top"><strong>' + member.label + '</strong><label class="visually-hidden" for="knowledge-' + member.id + '">Tiền sử ' + member.label + '</label><select id="knowledge-' + member.id + '" data-knowledge><option value="unknown"' + (knowledge === "unknown" ? " selected" : "") + '>Chưa rõ</option><option value="none"' + (knowledge === "none" ? " selected" : "") + '>Không có bệnh đã biết</option><option value="known"' + (knowledge === "known" ? " selected" : "") + '>Có bệnh đã biết</option></select></div><div class="chips"' + (knowledge === "known" ? "" : " hidden") + '>' + conditionChips(member.id, saved?.conditions) + "</div>" + (member.id === "sibling" ? '<label class="member-count"' + (knowledge === "known" ? "" : " hidden") + '>Số anh chị em mắc bệnh<input type="number" inputmode="numeric" data-affected min="1" max="10" value="' + (saved?.affected_count || 1) + '"></label>' : "") + "</div>";
    }).join("");
  }
  $("#onboarding-exit").textContent = state.editing ? "Về hồ sơ" : "Đăng xuất";
  $("#onboarding-title").textContent = state.editing ? "Sửa hồ sơ sức khỏe" : "Khai báo hồ sơ sức khỏe";
  state.step = 0;
  showStep();
  updateBmi();
}
function updateBmi() {
  const h = Number($("#height").value) / 100, w = Number($("#weight").value);
  $("#bmi-output").textContent = h > 0 && w > 0 ? "Chỉ số BMI: " + num(w / h ** 2) : "Chỉ số BMI được tính từ chiều cao và cân nặng.";
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
        affected_count: knowledge === "known" ? Math.min(10, Math.max(1, Math.round(Number(el.querySelector("[data-affected]")?.value) || 1))) : 1,
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
    await Promise.all([refreshRecords(), refreshCare(), refreshRisk()]);
    navigate(wasEditing ? state.editReturn : "dashboard");
    toast(wasEditing ? "Đã lưu hồ sơ." : "Đã lưu hồ sơ. Bạn có thể ghi chỉ số đầu tiên.");
  } catch (error) { errorAt("#onboarding-error", error.message); }
  finally { button.disabled = false; button.innerHTML = original; }
}

function rangeBar(key, value) {
  const scale = ZONES[key];
  const pos = v => ((Math.min(scale.max, Math.max(scale.min, v)) - scale.min) / (scale.max - scale.min) * 100).toFixed(1);
  return '<div class="range" aria-hidden="true">' + scale.zones.map(([from, to, level]) => '<span class="range-zone ' + level + '" style="left:' + pos(from) + "%;width:" + (pos(to) - pos(from)).toFixed(1) + '%"></span>').join("") + '<span class="range-mark" style="left:' + pos(value) + '%"></span></div>';
}
function renderMetrics() {
  const values = state.result?.measured_vitals || {};
  $("#metric-grid").innerHTML = METRICS.map(m => {
    const [level, status] = statusOf(m.key, values);
    const measured = values[m.key] != null;
    const flag = level === "attention" || level === "alert" ? '<span class="reading-flag flag-' + level + '">' + status + "</span>" : "";
    return '<div class="reading"><span class="reading-name">' + m.label + "</span>" + (measured ? '<span class="reading-value">' + valueOf(m.key, values) + "<small>" + m.unit + "</small></span>" + rangeBar(m.key, values[m.key]) : '<span class="reading-value empty">Chưa đo</span>') + flag + "</div>";
  }).join("");
}
// Stock photos (Pexels, self-hosted) chosen by the tip's topic; order matters ("thuốc lá" before generic words).
const TIP_IMAGES = [
  [/thuốc lá|hút thuốc|bỏ thuốc|cai thuốc/, "smoking"],
  [/spo₂|spo2|oxy/, "oximeter"],
  [/nhịp tim/, "pulse"],
  [/nhạt|muối|nước mắm/, "salt"],
  [/huyết áp/, "blood-pressure"],
  [/đường huyết|đường máu|tiểu đường|đái tháo đường|trước ăn|sau ăn/, "glucose"],
  [/uống đủ nước|cốc nước/, "water"],
  [/ngủ/, "sleep"],
  [/hít thở|thở chậm/, "breathing"],
  [/vận động|đi bộ|tập|chạy|thể dục/, "activity"],
  [/(?<!\p{L})ăn(?!\p{L})|rau|khẩu phần|cân nặng|đồ uống/u, "diet"],
  [/gia đình|bố mẹ|người thân/, "family"],
];
const tipImage = tip => {
  if (tip.image) return "/assets/tips/" + tip.image + ".jpg";
  const text = (tip.title + " " + tip.action).toLowerCase();
  return "/assets/tips/" + (TIP_IMAGES.find(([pattern]) => pattern.test(text))?.[1] || "logbook") + ".jpg";
};
// One general habit per calendar day, the same for the whole day and independent of readings.
const DAILY_TIPS = [
  { title: "Uống đủ nước", action: "Uống khoảng 6 đến 8 cốc nước trong ngày, chia đều từ sáng đến tối.", reason: "Nếu bác sĩ dặn hạn chế nước (bệnh tim, thận), hãy theo lời dặn đó.", image: "water" },
  { title: "Ngủ đủ giấc", action: "Đi ngủ trước 23 giờ và ngủ 7 đến 8 tiếng.", reason: "Thiếu ngủ làm huyết áp và đường huyết khó ổn định.", image: "sleep" },
  { title: "Thêm rau vào bữa ăn", action: "Ăn một bát rau xanh trong bữa trưa và bữa tối.", reason: "Rau giúp no lâu và giảm lượng muối, tinh bột trong bữa.", image: "diet" },
  { title: "Đi bộ sau bữa ăn", action: "Đi bộ nhẹ 10 phút sau bữa tối.", reason: "Vận động nhẹ sau ăn giúp đường huyết lên chậm hơn.", image: "routine" },
  { title: "Nêm nhạt hơn một chút", action: "Bớt nửa thìa nước mắm hoặc muối khi nấu hôm nay.", reason: "Ăn nhạt dần giúp kiểm soát huyết áp.", image: "salt" },
  { title: "Hít thở chậm", action: "Ngồi yên, hít vào 4 giây, thở ra 6 giây, trong 5 phút.", reason: "Thở chậm giúp cơ thể thư giãn trước khi đo chỉ số.", image: "breathing" },
  { title: "Hỏi thăm người thân", action: "Gọi cho bố mẹ hoặc anh chị em và hỏi thêm về sức khỏe trong gia đình.", reason: "Tiền sử gia đình càng rõ, đánh giá càng sát.", image: "family" },
];
const dailyTip = () => DAILY_TIPS[Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000) % DAILY_TIPS.length];
const tipCard = (tip, image, label = "") => '<article class="tip-card' + (label ? " daily" : "") + '"><img src="' + image + '" alt="" width="160" height="160" loading="lazy" decoding="async"><div>' + (label ? '<p class="tip-label">' + label + "</p>" : "") + "<h3>" + esc(tip.title) + "</h3><p>" + esc(tip.action) + "</p>" + (tip.reason ? '<p class="note">' + esc(tip.reason) + "</p>" : "") + "</div></article>";
function renderTips() {
  const tips = state.result?.insight.tips || [
    { title: "Bắt đầu với một chỉ số", action: "Có thể chỉ nhập huyết áp hoặc nhịp tim. Không cần đủ tất cả chỉ số.", image: "blood-pressure" },
    { title: "Đo trong cùng điều kiện", action: "Ngồi nghỉ 5 phút trước khi đo và làm theo hướng dẫn của máy đo." },
    { title: "Hỏi thêm người thân", action: "Nếu chưa rõ tiền sử bệnh trong gia đình, hãy hỏi bố mẹ rồi cập nhật hồ sơ." },
  ];
  const daily = dailyTip();
  const cards = tips.slice(0, 4).map(tip => tipCard(tip, tipImage(tip)));
  const dailyCard = tipCard(daily, tipImage(daily), "Gợi ý hôm nay");
  $("#tip-list").innerHTML = cards.join("") + dailyCard;
  // Today shows only the top personal tip and the daily one; advice must not compete with the emergency panel.
  $("#today-tips").innerHTML = (cards[0] || "") + dailyCard;
  $("#today-advice").classList.toggle("hidden", isEmergency(state.result));
  // During the 24h watch window the stored "all fine" follow-up would contradict Today.
  const followUp = state.result && !isEmergency(state.result) && recentEmergency() ? "" : state.result?.insight.follow_up || "";
  $("#follow-up").textContent = followUp;
  $("#follow-up").classList.toggle("hidden", !followUp);
}
function alertsMarkup(result) {
  return result.alerts.filter(a => a.severity !== "safe").map(a => '<div class="alert-item ' + a.severity + '"><strong>' + esc(a.metric) + ":</strong> " + esc(a.message) + "</div>").join("");
}
function renderEmergency(r) {
  const on = isEmergency(r);
  $("#emergency-panel").classList.toggle("hidden", !on);
  if (!on) return;
  const values = r.measured_vitals || {};
  const lines = METRICS.filter(m => statusOf(m.key, values)[0] === "alert").map(m => m.label + ": " + withUnit(valueOf(m.key, values), m.unit));
  $("#emergency-title").textContent = "Chỉ số ở mức nguy hiểm";
  $("#emergency-list").innerHTML = lines.map(line => "<li>" + esc(line) + "</li>").join("") + "<li>Đo lúc " + esc(date(r.created_at)) + "</li>";
}
function renderDashboard() {
  const r = state.result;
  // Hold an amber "watch" state for 24h after any dangerous real reading, even if a newer one is normal.
  const recent = r && !isEmergency(r) ? recentEmergency() : null;
  const level = r ? (recent ? "watch" : levelOf(r)) : "neutral";
  renderEmergency(r);
  const status = $("#risk-status");
  status.className = "status-word " + ({ emergency: "alert", watch: "attention" }[level] || level);
  status.textContent = r ? LEVELS[level] : "Chưa có dữ liệu";
  $("#risk-summary").textContent = !r ? "Nhập chỉ số từ máy đo để xem đánh giá đầu tiên." : level === "emergency" ? SUMMARY_FALLBACK.emergency : level === "watch" ? "Lần đo mới nhất đã trở lại ngưỡng an toàn, nhưng trong 24 giờ qua có lần đo ở mức nguy hiểm." : r.insight.summary || SUMMARY_FALLBACK[level];
  $("#result-date").textContent = r ? "Đo lúc " + date(r.created_at) + ", " + SOURCE_NAMES[r.measurement_source].toLowerCase() : "";
  // While the emergency panel is up it is the only call to action; the score would read as reassurance.
  $("#score-details").classList.toggle("hidden", !r || level === "emergency");
  $("#new-measurement").classList.toggle("hidden", level === "emergency");
  $("#recent-emergency").classList.toggle("hidden", !recent);
  if (recent) $("#recent-emergency").textContent = "Lần đo lúc " + date(recent.created_at) + " ở mức nguy hiểm. Đo lại sau 1 giờ. Nếu lại ở mức nguy hiểm hoặc có triệu chứng, liên hệ bác sĩ ngay trong hôm nay.";
  $("#result-alerts").innerHTML = r && level !== "emergency" ? alertsMarkup(r) : "";
  renderScores();
  renderMetrics();
  renderTips();
}
function renderTrends() {
  const source = state.result?.measurement_source;
  // Every source shares one chart: typed-in, Bluetooth and sample readings.
  const rows = state.records.slice(0, 30).reverse();
  $("#chart-context").textContent = source ? "Tối đa 30 lần đo gần nhất" : "";
  for (const [id, spec] of Object.entries(TRENDS)) {
    const card = $('[data-trend="' + id + '"]');
    const points = rows.filter(row => spec.series.every(([key]) => row.vitals[key] != null));
    card.querySelector(".trend-empty").classList.toggle("hidden", points.length > 0);
    const host = card.querySelector(".trend-chart");
    host.classList.toggle("hidden", !points.length);
    card.querySelector(".trend-legend")?.classList.toggle("hidden", !points.length);
    const last = points.at(-1);
    const latest = last ? spec.series.map(([key]) => num(last.vitals[key])).join("/") + (spec.unit === "%" ? "" : " ") + spec.unit : "";
    card.querySelector(".trend-latest").textContent = last ? "Gần nhất: " + latest : "";
    $("#trend-" + id + "-summary").textContent = last ? points.length + " lần đo. Gần nhất " + latest + " lúc " + date(last.created_at) + "." : "";
    if (!points.length) continue;
    trendCharts[id] ||= new TrendChart(host);
    trendCharts[id].set({ unit: spec.unit, band: spec.band, thresholds: spec.thresholds, min: spec.min, max: spec.max, times: points.map(row => toDate(row.created_at)),
      series: spec.series.map(([key, label, color]) => ({ label, color, values: points.map(row => row.vitals[key]) })) });
  }
}
function pickCurrent(rows) {
  return rows[0] || null;
}
async function refreshRecords() {
  const epoch = state.authEpoch;
  try {
    const rows = await reader().history();
    if (epoch !== state.authEpoch) return;
    const current = pickCurrent(rows);
    const result = current ? await reader().assessment(current.id) : null;
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
function recentEmergency() {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return state.records.find(row => recordLevel(row) === "emergency" && toDate(row.created_at).getTime() >= since) || null;
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
    const readings = METRICS.filter(m => record.vitals[m.key] != null).map(m => withUnit(valueOf(m.key, record.vitals), m.unit)).join(", ");
    const level = recordLevel(record);
    return "<tr><td>" + esc(date(record.created_at)) + '<span class="source">' + esc(SOURCE_NAMES[record.vitals.source || "manual"]) + "</span></td><td>" + esc(readings) + '</td><td><span class="tag ' + (level === "emergency" ? "alert" : level) + '">' + LEVELS[level] + '</span></td><td><button class="link-button" data-record="' + esc(record.id) + '">Xem chi tiết</button></td></tr>';
  }).join("") + "</tbody></table>";
}
async function deleteAssessment(id) {
  if (state.viewing) return;
  if (!id || !await confirmAction("Xóa lần đo này?")) return;
  try {
    await api.deleteAssessment(id);
    closeDialog($("#result-dialog"));
    await Promise.all([refreshRecords(), refreshRisk()]);
    if (state.view === "history") renderTrends();
    toast("Đã xóa lần đo.");
  } catch (error) { toast(error.message, "error"); }
}
async function showResult(id) {
  const epoch = state.authEpoch;
  try {
    const r = await reader().assessment(id);
    if (epoch !== state.authEpoch) return;
    const level = levelOf(r);
    $("#result-detail").innerHTML = '<p class="note">Đo lúc ' + date(r.created_at) + ", " + esc(SOURCE_NAMES[r.measurement_source].toLowerCase()) + '</p><span class="tag ' + (level === "emergency" ? "alert" : level) + '">' + LEVELS[level] + "</span>" + (level === "emergency" ? '<p style="margin-top:16px"><a class="btn primary" href="tel:115">Gọi cấp cứu 115</a></p>' : "") + '<p style="margin-top:16px">' + esc(r.insight.summary) + '</p><div class="result-detail-vitals">' + METRICS.map(m => "<div><span>" + m.label + "</span><strong>" + (r.measured_vitals?.[m.key] == null ? "Chưa đo" : withUnit(valueOf(m.key, r.measured_vitals), m.unit)) + "</strong></div>").join("") + "</div>" + alertsMarkup(r) + (r.insight.follow_up ? '<p class="note">' + esc(r.insight.follow_up) + "</p>" : "");
    $("#delete-assessment").dataset.id = r.id;
    $("#result-dialog").showModal();
  } catch (error) { toast(error.message, "error"); }
}
function bmiLabel(bmi) {
  // Asian cut-offs (WHO Western Pacific), as used by Vietnamese health guidance.
  return bmi < 18.5 ? "Thiếu cân" : bmi < 23 ? "Bình thường" : bmi < 25 ? "Thừa cân" : "Béo phì";
}
function familyNode(h, member, extraClass = "") {
  const conditionName = key => CONDITIONS.find(([id]) => id === key)?.[1];
  const saved = h.family_history.find(row => row.member_id === member.id);
  const known = saved?.knowledge === "known" && saved.conditions?.length;
  const kind = known ? "known" : saved?.knowledge === "none" ? "none" : "unknown";
  const text = known ? (saved.affected_count > 1 ? saved.affected_count + " người: " : "") + saved.conditions.map(conditionName).join(", ") : kind === "none" ? "Không có bệnh đã biết" : "Chưa rõ";
  return '<div class="ft-node ' + kind + " " + extraClass + '"><span class="ft-rel">' + member.label + '</span><span class="ft-state">' + esc(text) + "</span></div>";
}
function familySummary(h) {
  const conditionName = key => CONDITIONS.find(([id]) => id === key)?.[1];
  const known = h.family_history.filter(row => row.knowledge === "known" && row.conditions?.length);
  const unknown = MEMBERS.length - h.family_history.filter(row => row.knowledge === "known" || row.knowledge === "none").length;
  const tally = {};
  known.forEach(row => row.conditions.forEach(key => { tally[key] = (tally[key] || 0) + (row.affected_count || 1); }));
  const parts = [];
  parts.push(known.length ? known.reduce((sum, row) => sum + (row.affected_count || 1), 0) + " người thân có bệnh đã biết: " + Object.entries(tally).map(([key, count]) => conditionName(key) + " (" + count + " người)").join(", ") + "." : "Chưa khai báo người thân nào có bệnh đã biết.");
  if (unknown) parts.push(unknown + " người chưa rõ tiền sử. Hỏi thêm gia đình để hồ sơ đầy đủ hơn.");
  return parts.map(text => "<p>" + esc(text) + "</p>").join("");
}
function renderProfile() {
  const h = state.health, p = h.profile;
  const conditionName = key => CONDITIONS.find(([id]) => id === key)?.[1];
  const conditions = p.known_conditions.map(conditionName).filter(Boolean);
  const bmi = p.weight_kg / (p.height_cm / 100) ** 2;
  const sex = { female: "Nữ", male: "Nam", other: "Khác / không khai báo" }[p.sex] || "Không khai báo";
  $("#profile-content").innerHTML =
    '<article class="panel"><h2>' + esc(h.display_name) + '</h2><p class="note">' + esc(state.viewing ? "Hồ sơ được chia sẻ, chỉ xem" : state.user.email || "Hồ sơ mẫu") + '</p>' +
    '<dl class="facts facts-2col">' +
      "<div><dt>Tuổi</dt><dd>" + p.age + "</dd></div><div><dt>Giới tính</dt><dd>" + sex + "</dd></div>" +
      "<div><dt>Chiều cao</dt><dd>" + num(p.height_cm) + " cm</dd></div><div><dt>Cân nặng</dt><dd>" + num(p.weight_kg) + " kg</dd></div>" +
      "<div><dt>BMI</dt><dd>" + num(bmi) + ' <span class="fact-note">' + bmiLabel(bmi) + "</span></dd></div><div><dt>Vận động</dt><dd>" + p.activity_minutes_week + " phút mỗi tuần</dd></div>" +
      "<div><dt>Bệnh đã chẩn đoán</dt><dd>" + esc(conditions.join(", ") || "Không khai báo") + "</dd></div><div><dt>Hút thuốc</dt><dd>" + (p.smoker ? "Có" : "Không") + "</dd></div>" +
      (state.viewing ? "" : "<div><dt>Dùng AI giải thích kết quả</dt><dd>" + (h.ai_consent ? "Đã cho phép" : "Chưa cho phép") + "</dd></div>") +
    "</dl>" + (h.personal_notes ? "<h3>Ghi chú</h3><p>" + esc(h.personal_notes) + "</p>" : "") + "</article>" +
    '<article class="panel"><h2>Tiền sử bệnh trong gia đình</h2><div class="ft-summary">' + familySummary(h) + '</div><button class="link-button" data-nav="genetics">Xem sơ đồ gia đình và nguy cơ theo từng bệnh</button></article>';
}

// Family-risk tab: a level per condition from who in the family has it, computed on the server from the current profile.
// tone = colour and shape (same vocabulary as the status word on Today), bars = filled steps of the 3-step meter.
const RISK_LEVELS = {
  very_high: { tone: "alert", label: "Rất cao", bars: 3 }, high: { tone: "attention", label: "Cao", bars: 2 }, moderate: { tone: "moderate", label: "Trung bình", bars: 1 },
  diagnosed: { tone: "diagnosed", label: "Đã được chẩn đoán" }, unknown: { tone: "neutral", label: "Chưa đủ thông tin" }, none: { tone: "neutral", label: "Chưa ghi nhận" },
};
const riskLevel = level => '<span class="status-word risk-level ' + RISK_LEVELS[level].tone + '">' + RISK_LEVELS[level].label + "</span>";
const riskMeter = level => '<span class="risk-meter ' + RISK_LEVELS[level].tone + '" aria-hidden="true">' + [1, 2, 3].map(n => "<i" + (n <= RISK_LEVELS[level].bars ? ' class="on"' : "") + "></i>").join("") + "</span>";
function riskWho(row) {
  const names = row.relatives.map(id => id === "sibling" && row.sibling_count > 1 ? row.sibling_count + " anh chị em ruột" : MEMBERS.find(m => m.id === id)?.label).filter(Boolean);
  return names.length ? '<p class="risk-who"><span class="risk-who-label">Người thân mắc bệnh</span>' + names.map(name => "<span>" + esc(name) + "</span>").join("") + "</p>" : "";
}
async function refreshRisk() {
  const epoch = state.authEpoch;
  try {
    const risk = await (state.viewing ? api.careRisk(state.viewing.id) : api.risk());
    if (epoch !== state.authEpoch) return;
    state.risk = risk;
  } catch { if (epoch === state.authEpoch) state.risk = null; }
  renderScores();
  if (state.view === "genetics") renderGenetics();
}
// The family and body scores come live from the profile, so they follow profile edits without a new reading.
function renderScores() {
  const s = state.risk?.scores || state.result?.scores;
  if (!s) return;
  const unknown = state.risk?.relatives_unknown || 0;
  $("#risk-score").textContent = s.overall == null ? "-" : Math.round(s.overall);
  $("#pgrs-score").textContent = state.risk && unknown === state.risk.relatives_total ? "Chưa rõ" : Math.round(s.pgrs);
  $("#brs-score").textContent = Math.round(s.brs);
  $("#vital-score").textContent = s.vitals == null ? "-" : Math.round(s.vitals);
  $("#score-family-note").textContent = unknown ? "Còn " + unknown + " người thân chưa rõ tiền sử, chưa được tính vào điểm tiền sử gia đình." : "";
  $("#score-family-note").classList.toggle("hidden", !unknown);
}
function renderGenetics() {
  const h = state.health, p = h.profile;
  const conditionName = key => CONDITIONS.find(([id]) => id === key)?.[1];
  const member = id => MEMBERS.find(m => m.id === id);
  const conditions = p.known_conditions.map(conditionName).filter(Boolean);
  const notes = [["Bên nội", h.paternal_notes], ["Bên ngoại", h.maternal_notes]].filter(([, text]) => text);
  const order = Object.keys(RISK_LEVELS);
  const rows = (state.risk?.conditions || []).slice().sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  const of = (...levels) => rows.filter(row => levels.includes(row.level));
  const raised = of("very_high", "high", "moderate"), diagnosed = of("diagnosed"), rest = of("unknown", "none");
  const high = of("very_high", "high").length;
  $("#genetics-lead").textContent = !state.risk ? "" : rows.every(row => row.level === "unknown") ? "Chưa đủ thông tin về tiền sử gia đình. Hãy hỏi thêm người thân rồi cập nhật." : high ? high + " bệnh có nguy cơ cao hơn do tiền sử gia đình." : "Chưa ghi nhận bệnh nào có nguy cơ cao do tiền sử gia đình.";
  const card = row => '<article class="risk-card ' + RISK_LEVELS[row.level].tone + '"><div class="risk-card-top">' + riskLevel(row.level) + (RISK_LEVELS[row.level].bars ? riskMeter(row.level) : "") + "</div><h3>" + conditionName(row.condition) + "</h3>" +
    (row.level === "diagnosed" ? "<p>Bệnh này đã có trong hồ sơ cá nhân.</p>" : "") + riskWho(row) + (row.advice ? '<p class="risk-do"><strong>Nên làm:</strong> ' + esc(row.advice) + "</p>" : "") + "</article>";
  const count = level => '<div class="' + RISK_LEVELS[level].tone + '"><dt>' + riskLevel(level) + "</dt><dd>" + of(level).length + " <small>bệnh</small></dd></div>";
  const section = (title, note, body) => '<section class="section genetics-section"><div class="section-heading"><h2>' + title + "</h2></div>" + (note ? '<p class="note">' + note + "</p>" : "") + body + "</section>";
  const risk = !state.risk
    ? '<article class="panel empty-state"><h3>Chưa tải được mức nguy cơ</h3><button class="btn outline" id="retry-risk">Thử lại</button></article>'
    : '<dl class="score-list risk-counts">' + count("very_high") + count("high") + count("moderate") + "</dl>" +
      (raised.length ? section("Bệnh cần lưu ý", "Xếp theo mức nguy cơ, cao nhất ở trên.", '<div class="risk-grid">' + raised.map(card).join("") + "</div>") : "") +
      (diagnosed.length ? section("Bệnh đã được chẩn đoán", "", '<div class="risk-grid">' + diagnosed.map(card).join("") + "</div>") : "") +
      (rest.length ? section("Các bệnh khác", "", '<div class="panel risk-rest">' + rest.map(row => '<div class="risk-rest-row"><strong>' + conditionName(row.condition) + "</strong>" + riskLevel(row.level) + "</div>").join("") + "</div>") : "") +
      '<div class="panel risk-key"><h3>Cách đọc mức nguy cơ</h3><ul>' +
        "<li>" + riskLevel("very_high") + riskMeter("very_high") + "<span>Từ hai người là bố, mẹ, anh chị em mắc bệnh; hoặc một người trong số đó cùng với ông bà.</span></li>" +
        "<li>" + riskLevel("high") + riskMeter("high") + "<span>Một người là bố, mẹ hoặc anh chị em mắc bệnh; hoặc hai ông bà cùng một bên.</span></li>" +
        "<li>" + riskLevel("moderate") + riskMeter("moderate") + "<span>Chỉ có ông hoặc bà mắc bệnh.</span></li></ul></div>";
  $("#genetics-content").innerHTML = risk +
    section("Sơ đồ gia đình", "", '<article class="panel"><div class="ft-summary">' + familySummary(h) + "</div>" +
    '<div class="family-tree" role="group" aria-label="Sơ đồ gia đình ba thế hệ">' +
      '<span class="ft-side ft-side-p">Bên nội</span><span class="ft-side ft-side-m">Bên ngoại</span>' +
      familyNode(h, member("paternal-grandfather"), "ft-pgf") + familyNode(h, member("paternal-grandmother"), "ft-pgm") +
      familyNode(h, member("maternal-grandfather"), "ft-mgf") + familyNode(h, member("maternal-grandmother"), "ft-mgm") +
      '<span class="ft-join ft-join-p"></span><span class="ft-join ft-join-m"></span>' +
      familyNode(h, member("father"), "ft-father") + familyNode(h, member("mother"), "ft-mother") +
      '<span class="ft-join ft-join-c"></span>' +
      '<div class="ft-children"><div class="ft-node you ' + (conditions.length ? "known" : "none") + '"><span class="ft-rel">' + (state.viewing ? esc(h.display_name) : "Bạn") + '</span><span class="ft-state">' + esc(conditions.join(", ") || "Không khai báo bệnh") + "</span></div>" + familyNode(h, member("sibling")) + "</div>" +
    "</div>" +
    '<ul class="ft-legend"><li><span class="ft-key known"></span>Có bệnh đã biết</li><li><span class="ft-key none"></span>Không có bệnh đã biết</li><li><span class="ft-key unknown"></span>Chưa rõ</li></ul>' +
    notes.map(([title, text]) => "<h3>Ghi chú " + title.toLowerCase() + "</h3><p>" + esc(text) + "</p>").join("") + "</article>") +
    '<p class="note">Thông tin tham khảo để trao đổi với bác sĩ, không phải chẩn đoán hay kết quả xét nghiệm gen. Tiền sử gia đình không quyết định tất cả: lối sống và việc theo dõi đều đặn vẫn làm thay đổi nguy cơ.</p>';
}

// Doctor's report: an A4 page built from the user's readings, saved as PDF through the print dialog.
// ponytail: uses the readings already loaded (latest 100); add a date-range API if longer histories matter.
const reportCharts = {};
function reportRows(days) {
  const since = Date.now() - days * 86400000;
  return state.records.filter(row => toDate(row.created_at).getTime() >= since).reverse();
}
function reportSummary(rows) {
  // Same rounding as the readings table below, so the lowest and highest values can be found in it.
  const fix = (value, digits) => num(Number(value.toFixed(digits)));
  const stat = (values, digits = 0) => values.length ? { n: values.length, avg: fix(values.reduce((a, b) => a + b, 0) / values.length, digits), min: fix(Math.min(...values), digits), max: fix(Math.max(...values), digits) } : null;
  const flagged = key => rows.filter(row => ["attention", "alert"].includes(statusOf(key, row.vitals)[0])).length;
  const bp = rows.filter(row => row.vitals.systolic != null && row.vitals.diastolic != null);
  const sys = stat(bp.map(row => row.vitals.systolic)), dia = stat(bp.map(row => row.vitals.diastolic));
  // Lowest and highest are whole readings (picked by systolic), so the pair shown was really measured together.
  const pair = row => Math.round(row.vitals.systolic) + "/" + Math.round(row.vitals.diastolic);
  const bySys = bp.slice().sort((x, y) => x.vitals.systolic - y.vitals.systolic);
  const line = (label, unit, s, over) => "<tr><td>" + label + "</td><td>" + unit + "</td>" + (s ? "<td>" + s.n + "</td><td>" + s.avg + "</td><td>" + s.min + "</td><td>" + s.max + "</td><td>" + over + "</td>" : '<td colspan="5">Không có số đo trong kỳ</td>') + "</tr>";
  const single = (key, label, unit, digits) => line(label, unit, stat(rows.filter(row => row.vitals[key] != null).map(row => row.vitals[key]), digits), flagged(key));
  return line("Huyết áp", "mmHg", sys && { n: sys.n, avg: sys.avg + "/" + dia.avg, min: pair(bySys[0]), max: pair(bySys.at(-1)) }, flagged("systolic")) +
    single("heart_rate", "Nhịp tim", "lần/phút", 0) + single("spo2", "Oxy trong máu (SpO₂)", "%", 1) + single("glucose", "Đường huyết", "mg/dL", 0);
}
function renderReport() {
  const days = Number($("#report-days").value);
  const rows = reportRows(days);
  // Only the latest 100 readings are loaded; say so when the period reaches further back than they do.
  const oldest = state.records.length >= 100 ? toDate(state.records.at(-1).created_at) : null;
  const cut = oldest && oldest.getTime() > Date.now() - days * 86400000;
  const h = state.health, p = h.profile, now = new Date();
  const conditionName = key => CONDITIONS.find(([id]) => id === key)?.[1];
  const pad = n => String(n).padStart(2, "0");
  const code = "GS-" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" + pad(now.getHours()) + pad(now.getMinutes());
  const bmi = p.weight_kg / (p.height_cm / 100) ** 2;
  const sex = { female: "Nữ", male: "Nam", other: "Không khai báo" }[p.sex] || "Không khai báo";
  const cell = (key, v) => v[key] == null ? "" : valueOf(key, v);
  const mark = v => { const levels = METRICS.map(m => statusOf(m.key, v)[0]); return levels.includes("alert") ? "Nguy hiểm" : levels.includes("attention") ? "Cần chú ý" : ""; };
  const family = MEMBERS.map(m => {
    const saved = h.family_history.find(row => row.member_id === m.id);
    const text = saved?.knowledge === "known" && saved.conditions?.length ? saved.conditions.map(conditionName).join(", ") : saved?.knowledge === "none" ? "Không có bệnh đã biết" : "Chưa rõ";
    return "<tr><td>" + m.label + "</td><td>" + esc(text) + "</td></tr>";
  }).join("");
  const notice = "Phiếu do người dùng tự ghi bằng ứng dụng GeneSense. Không phải kết quả khám bệnh, không có giá trị chẩn đoán.";
  $("#report-sheet").innerHTML =
    '<header class="report-head"><div><strong>GeneSense</strong><br>Ứng dụng theo dõi sức khỏe tại nhà</div><div class="report-meta">Mã phiếu: ' + code + "<br>Ngày lập: " + esc(date(now.toISOString(), false)) + "</div></header>" +
    '<h1 id="report-title">PHIẾU TỔNG HỢP CHỈ SỐ SỨC KHỎE TẠI NHÀ</h1><p class="report-period">Kỳ báo cáo: ' + days + " ngày, đến ngày " + esc(date(now.toISOString(), false)) + '</p><p class="report-notice">' + notice + "</p>" +
    (cut ? '<p class="report-notice">Phiếu chỉ gồm 100 lần đo gần nhất, từ ' + esc(date(oldest.toISOString())) + ". Các lần đo cũ hơn trong kỳ không có trong phiếu.</p>" : "") +
    "<h2>I. Thông tin người dùng</h2>" +
    '<table class="report-table report-info"><tbody><tr><th>Họ tên</th><td>' + esc(h.display_name) + "</td><th>Tuổi</th><td>" + p.age + "</td><th>Giới tính</th><td>" + sex + "</td></tr>" +
    "<tr><th>Chiều cao</th><td>" + num(p.height_cm) + " cm</td><th>Cân nặng</th><td>" + num(p.weight_kg) + " kg</td><th>BMI</th><td>" + num(bmi) + " (" + bmiLabel(bmi) + ")</td></tr>" +
    "<tr><th>Bệnh đã chẩn đoán</th><td colspan=\"5\">" + esc(p.known_conditions.map(conditionName).filter(Boolean).join(", ") || "Không khai báo") + "</td></tr>" +
    "<tr><th>Hút thuốc</th><td>" + (p.smoker ? "Có" : "Không") + "</td><th>Vận động</th><td colspan=\"3\">" + p.activity_minutes_week + " phút mỗi tuần</td></tr></tbody></table>" +
    "<h2>II. Tiền sử bệnh trong gia đình</h2>" +
    '<table class="report-table"><thead><tr><th>Người thân</th><th>Bệnh đã biết</th></tr></thead><tbody>' + family + "</tbody></table>" +
    "<h2>III. Tổng hợp trong kỳ</h2>" +
    (rows.length ? '<table class="report-table report-num"><thead><tr><th>Chỉ số</th><th>Đơn vị</th><th>Số lần đo</th><th>Trung bình</th><th>Thấp nhất</th><th>Cao nhất</th><th>Số lần ngoài ngưỡng</th></tr></thead><tbody>' + reportSummary(rows) + "</tbody></table>" : "<p>Không có số đo trong kỳ này.</p>") +
    (rows.length ? "<h2>IV. Biểu đồ diễn biến</h2><div class=\"report-charts\">" + Object.keys(TRENDS).map(id => '<figure data-report-chart="' + id + '"><figcaption></figcaption><div class="trend-chart"></div></figure>').join("") + '</div><p class="report-small">Đường liền: tâm thu hoặc chỉ số chính. Đường đứt: tâm trương. Nền xám hoặc đường chấm: ngưỡng tham khảo.</p>' +
      "<h2>V. Bảng số đo chi tiết</h2>" +
      '<table class="report-table report-num"><thead><tr><th>Thời gian</th><th>Huyết áp (mmHg)</th><th>Nhịp tim (lần/phút)</th><th>SpO₂ (%)</th><th>Đường huyết (mg/dL)</th><th>Nguồn</th><th>Ghi chú</th></tr></thead><tbody>' +
      rows.slice().reverse().map(row => "<tr><td>" + esc(date(row.created_at)) + "</td><td>" + cell("systolic", row.vitals) + "</td><td>" + cell("heart_rate", row.vitals) + "</td><td>" + cell("spo2", row.vitals) + "</td><td>" + cell("glucose", row.vitals) + "</td><td>" + esc(SOURCE_NAMES[row.vitals.source || "manual"]) + "</td><td>" + mark(row.vitals) + "</td></tr>").join("") + "</tbody></table>" : "") +
    '<p class="report-notice report-end">' + notice + " Ngưỡng tham khảo dùng trong phiếu là ngưỡng minh họa của ứng dụng. Hãy mang phiếu này đến bác sĩ để được tư vấn.</p>";
  for (const [id, spec] of Object.entries(TRENDS)) {
    const figure = $('[data-report-chart="' + id + '"]');
    if (!figure) continue;
    const points = rows.filter(row => spec.series.every(([key]) => row.vitals[key] != null));
    figure.classList.toggle("hidden", !points.length);
    if (!points.length) continue;
    figure.querySelector("figcaption").textContent = { bp: "Huyết áp (mmHg)", heart_rate: "Nhịp tim (lần/phút)", spo2: "SpO₂ (%)", glucose: "Đường huyết (mg/dL)" }[id];
    reportCharts[id] = new TrendChart(figure.querySelector(".trend-chart"));
    reportCharts[id].set({ unit: spec.unit, band: spec.band, thresholds: spec.thresholds?.map(t => ({ ...t, color: "#555" })), min: spec.min, max: spec.max, times: points.map(row => toDate(row.created_at)),
      series: spec.series.map(([key, label], index) => ({ label, color: "#000", dash: index ? "6 4" : "", values: points.map(row => row.vitals[key]) })) });
  }
}
function openReport() { screen("report"); document.title = "Phiếu tổng hợp - GeneSense"; renderReport(); }

// Family sharing. While viewing a relative, the same screens render that person's data read-only:
// state is swapped, writes are hidden (.own-only) and guarded, and reads go through the care endpoints.
const reader = () => state.viewing
  ? { history: () => api.careHistory(state.viewing.id), assessment: id => api.careAssessment(state.viewing.id, id) }
  : api;
async function refreshCare() {
  const epoch = state.authEpoch;
  try {
    const care = await api.careLinks();
    if (epoch !== state.authEpoch) return;
    state.care = care;
  } catch { /* sharing is optional; the rest of the app still works */ }
  renderCare();
}
function patientLevel(patient) {
  if (!patient.latest) return null;
  const level = recordLevel({ vitals: patient.latest.vitals, risk_level: patient.latest.risk_level });
  return level === "emergency" ? "emergency" : patient.recent_emergency_at ? "watch" : level;
}
function patientRow(patient) {
  const level = patientLevel(patient);
  const tag = level ? '<span class="tag ' + ({ emergency: "alert", watch: "attention" }[level] || level) + '">' + LEVELS[level] + "</span>" : '<span class="tag">Chưa có số đo</span>';
  return '<div class="care-row"><div class="care-row-main"><strong>' + esc(patient.display_name) + "</strong><span>" + tag + (patient.latest ? ' <span class="note">Đo lúc ' + esc(date(patient.latest.created_at)) + "</span>" : "") + '</span></div><div class="care-row-actions"><button class="btn outline" data-view-patient="' + esc(patient.patient_id) + '">Xem hồ sơ</button><button class="delete-record" data-remove-link="' + esc(patient.link_id) + '" data-remove-kind="patient">Ngừng theo dõi</button></div></div>';
}
function renderCare() {
  const { patients, caregivers } = state.care;
  $("#care-alerts").innerHTML = patients.map(patient => {
    const level = patientLevel(patient);
    if (level !== "emergency" && level !== "watch") return "";
    const when = date(level === "emergency" ? patient.latest.created_at : patient.recent_emergency_at);
    return '<div class="care-alert ' + (level === "watch" ? "watch" : "") + '" role="alert"><span>' + esc(patient.display_name) + (level === "emergency" ? " có chỉ số ở mức nguy hiểm, đo lúc " : " đã có lần đo ở mức nguy hiểm lúc ") + esc(when) + '.</span><span class="care-alert-actions"><button class="btn" data-view-patient="' + esc(patient.patient_id) + '">Xem hồ sơ</button>' + (level === "emergency" ? '<a class="btn" href="tel:115">Gọi cấp cứu 115</a>' : "") + "</span></div>";
  }).join("");
  $("#care-patients-section").classList.toggle("hidden", !patients.length);
  $("#care-patients").innerHTML = patients.map(patientRow).join("");
  $("#care-panel").innerHTML =
    "<h2>Chia sẻ với người thân</h2>" +
    '<p class="note">Người thân có mã sẽ xem được tình trạng, số đo, biểu đồ, thông tin cá nhân và tiền sử gia đình của bạn. Họ không sửa được gì và không xem được giấy tờ. Bạn có thể thu hồi bất cứ lúc nào.</p>' +
    '<button class="btn outline" id="care-create">Tạo mã chia sẻ</button><div id="care-code-box"></div>' +
    "<h3>Người đang xem được hồ sơ của bạn</h3>" +
    (caregivers.length ? '<div class="care-rows">' + caregivers.map(c => '<div class="care-row"><div class="care-row-main"><strong>' + esc(c.display_name) + '</strong><span class="note">Từ ' + esc(date(c.created_at, false)) + '</span></div><button class="delete-record" data-remove-link="' + esc(c.link_id) + '" data-remove-kind="caregiver">Thu hồi</button></div>').join("") + "</div>" : '<p class="note">Chưa chia sẻ với ai.</p>') +
    "<h3>Theo dõi người thân</h3>" +
    '<form id="care-form" class="care-form"><label>Nhập mã người thân gửi cho bạn<input id="care-code-input" autocomplete="off" autocapitalize="characters" maxlength="16" required></label><button class="btn primary" type="submit">Liên kết</button></form><p id="care-error" class="inline-message error hidden" role="alert"></p>' +
    (patients.length ? '<div class="care-rows">' + patients.map(patientRow).join("") + "</div>" : "");
}
async function createCareCode() {
  try {
    const invite = await api.careInvite();
    $("#care-code-box").innerHTML = '<p class="care-code">' + esc(invite.code.slice(0, 4) + " " + invite.code.slice(4)) + '</p><p class="note">Gửi mã này cho người thân. Mã dùng được một lần và hết hạn lúc ' + esc(date(invite.expires_at)) + ". Tạo mã mới sẽ hủy mã cũ.</p>";
  } catch (error) { toast(error.message, "error"); }
}
async function acceptCareCode(event) {
  event.preventDefault();
  errorAt("#care-error");
  try {
    const linked = await api.careAccept($("#care-code-input").value.trim());
    await refreshCare();
    toast("Đã liên kết với " + linked.display_name + ".");
  } catch (error) { errorAt("#care-error", error.message); }
}
async function removeCareLink(id, kind) {
  const ok = kind === "caregiver"
    ? await confirmAction("Thu hồi quyền xem?", "Người này sẽ không xem được hồ sơ của bạn nữa.", "Thu hồi")
    : await confirmAction("Ngừng theo dõi?", "Bạn sẽ không xem được hồ sơ của người này nữa.", "Ngừng theo dõi");
  if (!ok) return;
  try { await api.careRemove(id); await refreshCare(); toast(kind === "caregiver" ? "Đã thu hồi quyền xem." : "Đã ngừng theo dõi."); }
  catch (error) { toast(error.message, "error"); }
}
async function viewPatient(patientId) {
  const patient = state.care.patients.find(p => p.patient_id === patientId);
  if (!patient || state.viewing) return;
  try {
    const shared = await api.careProfile(patientId);
    state.own = { health: state.health, records: state.records, result: state.result, risk: state.risk };
    state.viewing = { id: patientId, name: shared.display_name };
    state.health = shared.health; state.records = []; state.result = null; state.risk = null;
    document.body.classList.add("viewing");
    $("#viewing-text").textContent = "Bạn đang xem hồ sơ của " + shared.display_name + ". Chỉ xem, không sửa được.";
    $("#viewing-banner").classList.remove("hidden");
    personalize();
    await Promise.all([refreshRecords(), refreshRisk()]);
    navigate("dashboard");
  } catch (error) { toast(error.message, "error"); }
}
async function exitViewing() {
  if (!state.viewing) return;
  Object.assign(state, state.own, { viewing: null, own: null });
  document.body.classList.remove("viewing");
  $("#viewing-banner").classList.add("hidden");
  personalize(); renderDashboard(); renderHistory();
  navigate("dashboard");
  refreshCare();
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
  if (state.viewing) return;
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
    closeDialog($("#medical-upload-dialog"));
    renderMedicalRecords();
    navigate("records");
    toast("Đã lưu giấy tờ.");
  } catch (error) { errorAt("#record-save-error", error.message); }
  finally { state.busy = false; button.innerHTML = original; button.disabled = !$("#confirm-medical-record").checked; }
}

async function deleteMedicalRecord(id) {
  if (!await confirmAction("Xóa giấy tờ này?")) return;
  try {
    await api.deleteMedicalRecord(id);
    state.medicalRecords = state.medicalRecords.filter(record => record.id !== id);
    renderMedicalRecords();
    toast("Đã xóa giấy tờ.");
  } catch (error) { toast(error.message, "error"); }
}

function openMeasurement(mode = "manual") {
  if (state.viewing) return;
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
    return "<div><span>" + m.label + "</span><strong>" + withUnit(valueOf(m.key, v), m.unit) + '</strong> <span class="tag ' + severity + '">' + text + "</span></div>";
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
  $("#device-message").textContent = "Chỉ số được tạo tự động để dùng thử, không phải số đo thật.";
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
    state.records = [record, ...state.records].slice(0, 100);
    state.result = r;
    closeDialog($("#measurement-dialog"));
    $("#measurement-form").reset();
    stopStreams();
    renderDashboard(); renderHistory(); navigate("dashboard");
    refreshRisk();
    if (isEmergency(r)) $("#emergency-title").focus();
    else toast("Đã lưu chỉ số.");
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
  state.viewing = null; state.own = null; state.care = { patients: [], caregivers: [] }; document.body.classList.remove("viewing");
  $("#viewing-banner").classList.add("hidden"); $("#viewing-text").textContent = "";
  state.user = null; state.health = null; state.records = []; state.result = null; state.risk = null; state.medicalRecords = []; state.editing = false; state.rating = 0;
  resetMedicalUpload();
  $("#profile-content").innerHTML = ""; $("#genetics-content").innerHTML = ""; $("#history-list").innerHTML = ""; $("#medical-record-list").innerHTML = ""; $("#result-detail").innerHTML = "";
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
// step 1 opens the wizard straight at the family pages; the user returns to the tab they came from.
function editProfile(step = 0) {
  if (state.viewing) return;
  state.editing = true; state.editReturn = state.view; fillWizard(state.health);
  state.step = step; showStep();
  screen("onboarding");
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
    await Promise.all([refreshRecords(), refreshMedicalRecords(), refreshCare(), refreshRisk()]);
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
    errorAt("#login-message", loginError ? "Chưa đăng nhập được với Google. Hãy thử lại hoặc chọn tài khoản khác." : !config.google_enabled ? "Đăng nhập bằng Google sẽ có trong bản chính thức." : "");
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
  $("#onboarding-exit").addEventListener("click", () => { if (state.editing) { state.editing = false; screen("app"); navigate(state.editReturn); } else signOut(); });
  $("#onboarding-form").addEventListener("submit", nextStep);
  $("#onboarding-form").addEventListener("change", event => {
    if (event.target.matches("[data-knowledge]")) {
      const chips = event.target.closest("[data-member]").querySelector(".chips");
      chips.hidden = event.target.value !== "known";
      if (chips.hidden) chips.querySelectorAll("input").forEach(input => input.checked = false);
      const count = chips.parentElement.querySelector(".member-count");
      if (count) count.hidden = chips.hidden;
    }
  });
  $("#step-back").addEventListener("click", () => { state.step = Math.max(0, state.step - 1); showStep(); });
  ["height", "weight"].forEach(id => $("#" + id).addEventListener("input", updateBmi));
  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-nav]");
    if (nav) navigate(nav.dataset.nav);
    const close = event.target.closest("[data-close]");
    if (close) closeDialog($("#" + close.dataset.close));
    const record = event.target.closest("[data-record]");
    if (record) showResult(record.dataset.record);
    const deleteRecord = event.target.closest("[data-delete-record]");
    if (deleteRecord) deleteMedicalRecord(deleteRecord.dataset.deleteRecord);
    if (event.target.closest("[data-open-upload]")) openMedicalUpload();
    const viewTarget = event.target.closest("[data-view-patient]");
    if (viewTarget) viewPatient(viewTarget.dataset.viewPatient);
    const removeTarget = event.target.closest("[data-remove-link]");
    if (removeTarget) removeCareLink(removeTarget.dataset.removeLink, removeTarget.dataset.removeKind);
    if (event.target.closest("#care-create")) createCareCode();
    if (event.target.closest("#exit-viewing")) exitViewing();
    if (event.target.closest("[data-open-measurement]")) openMeasurement();
    if (event.target.closest("#history-add")) openMeasurement();
    if (event.target.closest("#retry-history")) refreshRecords();
    if (event.target.closest("#retry-risk")) refreshRisk();
  });
  $("#edit-profile").addEventListener("click", () => editProfile());
  $("#edit-family").addEventListener("click", () => editProfile(1));
  document.addEventListener("submit", event => { if (event.target.id === "care-form") acceptCareCode(event); });
  $$("dialog").forEach(dialog => dialog.addEventListener("cancel", event => { event.preventDefault(); closeDialog(dialog); }));
  $("#delete-assessment").addEventListener("click", event => deleteAssessment(event.currentTarget.dataset.id));
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
  $("#refresh-history").addEventListener("click", refreshRecords);
  $("#open-report").addEventListener("click", openReport);
  $("#report-days").addEventListener("change", renderReport);
  $("#report-print").addEventListener("click", () => window.print());
  $("#report-back").addEventListener("click", () => { screen("app"); navigate("history"); });
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
  // Links like the header logo only change the hash; route on every hash change (also back/forward).
  window.addEventListener("hashchange", () => { if (state.user && state.health) navigate(location.hash.slice(1) || "dashboard"); });
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
