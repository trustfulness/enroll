(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const eventId = (params.get("e") || params.get("event") || "").trim();
  const apiUrl = (window.ENROLL_CONFIG?.apiUrl || "").trim();
  const urlLang = params.get("lang") || "";

  const STORAGE_TOKEN = "enroll_token_" + (eventId || "default");
  const STORAGE_PROFILE = "enroll_profile";
  const STORAGE_LANG = "enroll_language";
  const TZ_HK = "Asia/Hong_Kong";

  // Language strings
  const translations = {
    en: {
      loading: "Loading enrollment list…",
      noEventTitle: "Event not found",
      noEventMissing: "Missing event ID. Use a link like ?e=sat-pickleball",
      noEventConfig: "System not configured. Please contact event organizer.",
      refresh: "Refresh",
      footer: "Share this page in your WhatsApp group · Auto-refreshes every 30s",
      confirmedLabel: "Confirmed",
      waitlistLabel: "Waitlist",
      queueTitle: "Queue",
      emptyQueue: "No enrollments yet. Be the first!",
      yourStatus: "Your position: #{{position}} ({{status}}) · {{time}}",
      yourStatusDevice: "You enrolled on this device. Tap Cancel to leave the queue.",
      enrollTitle: "Enroll",
      ruleText: "Fair rule: order is by enrollment <strong>time on this page</strong>. Everyone sees the same list. Cancel if you cannot attend so the next person can move up.",
      nameLabel: "Your name *",
      passwordLabel: "4-digit password *",
      passwordHint: "Choose a 4-digit password (e.g., 1234) to secure your enrollment",
      namePlaceholder: "e.g. Alex",
      passwordPlaceholder: "****",
      enrollBtn: "Enroll",
      cancelBtn: "Cancel my spot",
      cancelHelpText: "Having trouble canceling? Cancel by entering your name and password:",
      cancelNamePlaceholder: "Enter your full name",
      cancelPasswordPlaceholder: "4-digit password",
      cancelByNameBtn: "Cancel by Name + Password",
      errorNameRequired: "Please enter your name.",
      errorPasswordRequired: "Please enter a 4-digit password.",
      errorPasswordInvalid: "Password must be exactly 4 digits (0-9).",
      errorEnrollFailed: "Enrollment failed.",
      errorCancelFailed: "Cancel failed.",
      errorAlreadyEnrolled: "You are already enrolled for this event.",
      errorEventClosed: "This event is closed.",
      errorNotOpen: "Enrollment is not open right now.",
      errorNoToken: "No enrollment found on this device.",
      errorApiNotConfigured: "API not configured. Please contact organizer.",
      errorNameRequiredForCancel: "Please enter your name and password to cancel.",
      errorNoActiveEnrollment: "No active enrollment found matching your name and password.",
      confirmCancel: "Cancel your enrollment for this event?",
      confirmCancelByName: "Are you sure you want to cancel enrollment for '{{name}}'?",
      successEnrolled: "Enrolled! Remember your 4-digit password for cancellation.",
      successWaitlist: "Added to waitlist. Remember your password for cancellation.",
      successCancelled: "Enrollment cancelled.",
      statusOpen: "Enrollment open",
      statusClosed: "Enrollment closed",
      maxSpots: "Max {{seats}} spots · First come, first served",
      opensAt: " · Opens {{time}}",
      closesAt: " · Closes {{time}}",
    },
    zh: {
      loading: "載入報名名單中…",
      noEventTitle: "活動未找到",
      noEventMissing: "缺少活動 ID。請使用類似 ?e=sat-pickleball 的連結",
      noEventConfig: "系統未配置，請聯繫活動組織者。",
      refresh: "刷新",
      footer: "在 WhatsApp 群組中分享此頁面 · 每 30 秒自動刷新",
      confirmedLabel: "已確認",
      waitlistLabel: "候補",
      queueTitle: "排隊名單",
      emptyQueue: "暫無報名。成為第一個！",
      yourStatus: "您的位置：#{{position}} ({{status}}) · {{time}}",
      yourStatusDevice: "您已在此裝置上報名。點擊取消離開隊伍。",
      enrollTitle: "報名",
      ruleText: "公平規則：順序按此頁面的<strong>報名時間</strong>排序。所有人看到相同名單。如無法出席請取消，讓下一位補上。",
      nameLabel: "您的姓名 *",
      passwordLabel: "4位數字密碼 *",
      passwordHint: "請設定4位數字密碼（例如：1234）用於取消報名",
      namePlaceholder: "例如：陳大明",
      passwordPlaceholder: "****",
      enrollBtn: "報名",
      cancelBtn: "取消我的名額",
      cancelHelpText: "取消遇到問題？請輸入您的姓名和密碼：",
      cancelNamePlaceholder: "請輸入您的全名",
      cancelPasswordPlaceholder: "4位數字密碼",
      cancelByNameBtn: "以姓名+密碼取消",
      errorNameRequired: "請輸入您的姓名。",
      errorPasswordRequired: "請輸入4位數字密碼。",
      errorPasswordInvalid: "密碼必須是4位數字（0-9）。",
      errorEnrollFailed: "報名失敗。",
      errorCancelFailed: "取消失敗。",
      errorAlreadyEnrolled: "您已報名此活動。",
      errorEventClosed: "此活動已截止報名。",
      errorNotOpen: "目前不在報名開放時間。",
      errorNoToken: "此裝置上未找到報名記錄。",
      errorApiNotConfigured: "系統未配置，請聯繫活動組織者。",
      errorNameRequiredForCancel: "請輸入您的姓名和密碼以取消報名。",
      errorNoActiveEnrollment: "找不到與姓名和密碼匹配的有效報名記錄。",
      confirmCancel: "確定取消您的報名名額嗎？",
      confirmCancelByName: "確定要取消『{{name}}』的報名嗎？",
      successEnrolled: "報名成功！請記住您的4位數字密碼以便取消。",
      successWaitlist: "已加入候補名單。請記住您的密碼以便取消。",
      successCancelled: "已取消報名。",
      statusOpen: "報名開放中",
      statusClosed: "報名已截止",
      maxSpots: "最多 {{seats}} 個名額 · 先到先得",
      opensAt: " · 開放時間 {{time}}",
      closesAt: " · 截止時間 {{time}}",
    }
  };

  let currentLang = "en";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    eventTitle: $("#eventTitle"),
    eventSubtitle: $("#eventSubtitle"),
    statusBadge: $("#statusBadge"),
    enrollForm: $("#enrollForm"),
    nameInput: $("#name"),
    passwordInput: $("#password"),
    enrollBtn: $("#enrollBtn"),
    cancelBtn: $("#cancelBtn"),
    cancelByNameBtn: $("#cancelByNameBtn"),
    cancelNameInput: $("#cancelNameInput"),
    cancelPasswordInput: $("#cancelPasswordInput"),
    refreshBtn: $("#refreshBtn"),
    queueList: $("#queueList"),
    queueEmpty: $("#queueEmpty"),
    confirmedStat: $("#confirmedStat"),
    waitlistStat: $("#waitlistStat"),
    mainContent: $("#mainContent"),
    loading: $("#loading"),
    noEvent: $("#noEvent"),
    myStatus: $("#myStatus"),
    queueTitle: $("#queueTitle"),
    enrollTitle: $("#enrollTitle"),
    ruleText: $("#ruleText"),
    nameLabel: $("#nameLabel"),
    passwordLabel: $("#passwordLabel"),
    passwordHint: $("#passwordHint"),
    footer: $("#footer"),
    confirmedLabel: $("#confirmedLabel"),
    waitlistLabel: $("#waitlistLabel"),
    cancelHelpText: $("#cancelHelpText"),
  };

  function t(key, replacements = {}) {
    let text = translations[currentLang][key] || translations.en[key] || key;
    Object.keys(replacements).forEach(r => {
      text = text.replace(new RegExp(`{{${r}}}`, 'g'), replacements[r]);
    });
    return text;
  }

  function updateUILanguage() {
    if (els.queueTitle) els.queueTitle.textContent = t("queueTitle");
    if (els.enrollTitle) els.enrollTitle.textContent = t("enrollTitle");
    if (els.ruleText) els.ruleText.innerHTML = t("ruleText");
    if (els.nameLabel) els.nameLabel.textContent = t("nameLabel");
    if (els.passwordLabel) els.passwordLabel.textContent = t("passwordLabel");
    if (els.passwordHint) els.passwordHint.textContent = t("passwordHint");
    if (els.enrollBtn) els.enrollBtn.textContent = t("enrollBtn");
    if (els.cancelBtn) els.cancelBtn.textContent = t("cancelBtn");
    if (els.refreshBtn) els.refreshBtn.textContent = t("refresh");
    if (els.footer) els.footer.innerHTML = t("footer");
    if (els.confirmedLabel) els.confirmedLabel.textContent = t("confirmedLabel");
    if (els.waitlistLabel) els.waitlistLabel.textContent = t("waitlistLabel");
    if (els.cancelByNameBtn) els.cancelByNameBtn.textContent = t("cancelByNameBtn");
    if (els.cancelHelpText) els.cancelHelpText.textContent = t("cancelHelpText");
    if (els.cancelNameInput) els.cancelNameInput.placeholder = t("cancelNamePlaceholder");
    if (els.cancelPasswordInput) els.cancelPasswordInput.placeholder = t("cancelPasswordPlaceholder");
    
    if (els.nameInput) els.nameInput.placeholder = t("namePlaceholder");
    if (els.passwordInput) els.passwordInput.placeholder = t("passwordPlaceholder");
    
    if (els.queueEmpty) els.queueEmpty.textContent = t("emptyQueue");
    
    if (els.loading && els.loading.classList.contains("hidden") === false) {
      els.loading.textContent = t("loading");
    }
    
    const langBtns = $$(".lang-btn");
    langBtns.forEach(btn => {
      if (btn.dataset.lang === currentLang) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  function setLanguage(lang) {
    if (translations[lang]) {
      currentLang = lang;
      localStorage.setItem(STORAGE_LANG, lang);
      updateUILanguage();
      if (window._lastEventData) {
        renderEvent(window._lastEventData);
      }
    }
  }

  function showToast(message, type) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.className = "toast show" + (type ? " " + type : "");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove("show");
    }, 4000);
  }

  function parseHongKongDate(value) {
    if (!value) return null;
    const s = String(value).trim().replace(/\s+HKT$/i, "");
    const iso = new Date(s);
    if (!isNaN(iso.getTime()) && (s.includes("T") || s.endsWith("Z"))) {
      return iso;
    }
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5], +(m[6] || 0)));
    }
    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatTime(value) {
    if (!value) return "";
    const s = String(value).trim();
    if (s.endsWith("HKT")) return s;
    const d = parseHongKongDate(value);
    if (!d || isNaN(d.getTime())) return String(value);
    return d.toLocaleString("en-HK", {
      timeZone: TZ_HK,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " HKT";
  }

  function loadProfile() {
    try {
      const p = JSON.parse(localStorage.getItem(STORAGE_PROFILE) || "{}");
      if (p.name) els.nameInput.value = p.name;
      // Don't autofill password for security
    } catch (_) {}
  }

  function saveProfile() {
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify({
      name: els.nameInput.value.trim(),
      // Password not saved for security
    }));
  }

  function getToken() {
    return localStorage.getItem(STORAGE_TOKEN) || "";
  }

  function setToken(token) {
    if (token) localStorage.setItem(STORAGE_TOKEN, token);
    else localStorage.removeItem(STORAGE_TOKEN);
  }

  function requireEventId() {
    if (eventId) return eventId;
    els.loading.classList.add("hidden");
    els.noEvent.classList.remove("hidden");
    if (els.noEvent && els.noEvent.querySelector("p")) {
      els.noEvent.querySelector("p").innerHTML = t("noEventMissing");
    }
    return null;
  }

  async function apiCall(action, extra) {
    const eid = requireEventId();
    if (!eid) return { ok: false, error: "Missing event ID." };

    if (!apiUrl) {
      return { ok: false, error: "API not configured" };
    }

    const base = apiUrl.replace(/\/$/, "");
    const query = new URLSearchParams({ action, eventId: eid });
    Object.keys(extra || {}).forEach((k) => {
      const v = extra[k];
      if (v !== undefined && v !== null && String(v) !== "") {
        query.append(k, String(v));
      }
    });

    const url = base + "?" + query.toString();

    let res;
    try {
      res = await fetch(url, { method: "GET", redirect: "follow" });
    } catch (err) {
      throw new Error("Cannot reach Google Apps Script.");
    }

    const text = await res.text();

    if (text.trim().startsWith("<")) {
      throw new Error("Server returned HTML. Redeploy Apps Script as Web app.");
    }

    try {
      return JSON.parse(text);
    } catch (_) {
      throw new Error("Invalid JSON from server.");
    }
  }

  function renderEvent(data) {
    window._lastEventData = data;
    
    if (!data.ok) {
      els.loading.classList.add("hidden");
      els.mainContent.classList.add("hidden");
      els.noEvent.classList.remove("hidden");
      if (els.noEvent && els.noEvent.querySelector("p")) {
        els.noEvent.querySelector("p").textContent = data.error || t("noEventTitle");
      }
      return;
    }

    const ev = data.event;
    
    let eventSubtitle = t("maxSpots", { seats: ev.maxSeats });
    if (ev.opensAt) eventSubtitle += t("opensAt", { time: formatTime(ev.opensAt) });
    if (ev.closesAt) eventSubtitle += t("closesAt", { time: formatTime(ev.closesAt) });
    
    els.eventTitle.textContent = ev.title;
    els.eventSubtitle.textContent = eventSubtitle;

    const open = data.isOpen;
    els.statusBadge.textContent = open ? t("statusOpen") : t("statusClosed");
    els.statusBadge.className = "badge " + (open ? "open" : "closed");

    els.confirmedStat.textContent = data.confirmedCount ?? 0;
    els.waitlistStat.textContent = data.waitlistCount ?? 0;

    const profileName = els.nameInput.value.trim();

    let myRow = null;
    data.enrollments.forEach((row) => {
      if (profileName && row.name.toLowerCase() === profileName.toLowerCase()) {
        myRow = row;
      }
    });

    if (myRow) {
      els.myStatus.classList.remove("hidden");
      const statusText = myRow.status === "confirmed" ? t("confirmedLabel") : t("waitlistLabel");
      els.myStatus.textContent = t("yourStatus", {
        position: myRow.position,
        status: statusText,
        time: formatTime(myRow.enrolledAt)
      });
      els.cancelBtn.classList.remove("hidden");
      els.cancelBtn.textContent = t("cancelBtn");
    } else {
      els.myStatus.classList.add("hidden");
      els.cancelBtn.classList.add("hidden");
    }

    els.enrollBtn.disabled = !open;
    els.enrollBtn.textContent = t("enrollBtn");
    els.queueList.innerHTML = "";

    if (!data.enrollments.length) {
      els.queueEmpty.classList.remove("hidden");
      els.queueEmpty.textContent = t("emptyQueue");
    } else {
      els.queueEmpty.classList.add("hidden");
      data.enrollments.forEach((row) => {
        const li = document.createElement("li");
        li.className = "queue-item " + row.status;
        const statusText = row.status === "confirmed" ? t("confirmedLabel") : t("waitlistLabel");
        li.innerHTML = '<div class="position">' + row.position + '</div>' +
          '<div class="queue-body">' +
          '<p class="queue-name">' + escapeHtml(row.name) + '</p>' +
          '<p class="queue-meta">' + formatTime(row.enrolledAt) + '</p>' +
          '<span class="status-pill ' + row.status + '">' + statusText + '</span>' +
          '</div>';
        els.queueList.appendChild(li);
      });
    }

    els.loading.classList.add("hidden");
    els.noEvent.classList.add("hidden");
    els.mainContent.classList.remove("hidden");
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  async function refresh() {
    if (!requireEventId()) return;
    els.refreshBtn.disabled = true;
    try {
      const data = await apiCall("list", {});
      renderEvent(data);
    } catch (err) {
      showToast(err.message || "Could not load list.", "error");
    } finally {
      els.refreshBtn.disabled = false;
    }
  }

  async function enroll() {
    if (!requireEventId()) return;
    saveProfile();
    const name = els.nameInput.value.trim();
    const password = els.passwordInput ? els.passwordInput.value.trim() : "";
    
    if (!name) {
      showToast(t("errorNameRequired"), "error");
      return;
    }
    
    if (!password) {
      showToast(t("errorPasswordRequired"), "error");
      return;
    }
    
    if (!/^\d{4}$/.test(password)) {
      showToast(t("errorPasswordInvalid"), "error");
      return;
    }

    els.enrollBtn.disabled = true;
    try {
      const data = await apiCall("enroll", { name, password });
      if (!data.ok) {
        showToast(data.error || t("errorEnrollFailed"), "error");
        return;
      }
      if (data.token) setToken(data.token);
      const message = data.enrollment?.status === "waitlist" ? t("successWaitlist") : t("successEnrolled");
      showToast(message, "success");
      renderEvent(data);
      if (els.passwordInput) els.passwordInput.value = "";
    } catch (err) {
      showToast(err.message || t("errorEnrollFailed"), "error");
    } finally {
      els.enrollBtn.disabled = false;
    }
  }

  async function cancel() {
    if (!requireEventId()) return;
    
    const name = els.nameInput.value.trim();
    const password = els.passwordInput ? els.passwordInput.value.trim() : "";
    
    if (!name || !password) {
      showToast(t("errorNameRequiredForCancel"), "error");
      return;
    }
    
    if (!confirm(t("confirmCancelByName", { name: name }))) return;

    els.cancelBtn.disabled = true;
    try {
      const data = await apiCall("cancelbyname", { name, password });
      if (!data.ok) {
        showToast(data.error || t("errorCancelFailed"), "error");
        return;
      }
      setToken("");
      showToast(t("successCancelled"), "success");
      renderEvent(data);
      if (els.passwordInput) els.passwordInput.value = "";
    } catch (err) {
      showToast(err.message || t("errorCancelFailed"), "error");
    } finally {
      els.cancelBtn.disabled = false;
    }
  }

  async function cancelByName() {
    if (!requireEventId()) return;
    
    const name = els.cancelNameInput ? els.cancelNameInput.value.trim() : "";
    const password = els.cancelPasswordInput ? els.cancelPasswordInput.value.trim() : "";
    
    if (!name || !password) {
      showToast(t("errorNameRequiredForCancel"), "error");
      return;
    }
    
    if (!/^\d{4}$/.test(password)) {
      showToast(t("errorPasswordInvalid"), "error");
      return;
    }
    
    if (!confirm(t("confirmCancelByName", { name: name }))) return;

    if (els.cancelByNameBtn) els.cancelByNameBtn.disabled = true;
    
    try {
      const data = await apiCall("cancelbyname", { name, password });
      if (!data.ok) {
        showToast(data.error || t("errorCancelFailed"), "error");
        return;
      }
      setToken("");
      showToast(t("successCancelled"), "success");
      renderEvent(data);
      if (els.cancelNameInput) els.cancelNameInput.value = "";
      if (els.cancelPasswordInput) els.cancelPasswordInput.value = "";
    } catch (err) {
      showToast(err.message || t("errorCancelFailed"), "error");
    } finally {
      if (els.cancelByNameBtn) els.cancelByNameBtn.disabled = false;
    }
  }

  function setupLanguageButtons() {
    const langBtns = $$(".lang-btn");
    langBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const lang = btn.dataset.lang;
        if (lang === "en" || lang === "zh") {
          setLanguage(lang);
        }
      });
    });
  }

  function init() {
    const savedLang = localStorage.getItem(STORAGE_LANG);
    if (urlLang === "zh" || urlLang === "zh-CN" || urlLang === "zh-TW" || urlLang === "zh-HK") {
      currentLang = "zh";
    } else if (urlLang === "en") {
      currentLang = "en";
    } else if (savedLang && translations[savedLang]) {
      currentLang = savedLang;
    } else {
      const browserLang = navigator.language || navigator.userLanguage;
      currentLang = browserLang.startsWith("zh") ? "zh" : "en";
    }
    
    updateUILanguage();
    setupLanguageButtons();

    if (!apiUrl) {
      showToast(t("errorApiNotConfigured"), "error");
      if (els.loading) els.loading.classList.add("hidden");
      if (els.noEvent) {
        els.noEvent.classList.remove("hidden");
        if (els.noEvent.querySelector("p")) {
          els.noEvent.querySelector("p").innerHTML = t("noEventConfig");
        }
      }
      return;
    }

    if (!eventId) {
      if (els.loading) els.loading.classList.add("hidden");
      if (els.noEvent) {
        els.noEvent.classList.remove("hidden");
        if (els.noEvent.querySelector("p")) {
          els.noEvent.querySelector("p").innerHTML = t("noEventMissing");
        }
      }
      loadProfile();
      return;
    }

    loadProfile();
    if (els.enrollForm) {
      els.enrollForm.addEventListener("submit", (e) => {
        e.preventDefault();
        enroll();
      });
    }
    if (els.cancelBtn) els.cancelBtn.addEventListener("click", cancel);
    if (els.cancelByNameBtn) els.cancelByNameBtn.addEventListener("click", cancelByName);
    if (els.refreshBtn) els.refreshBtn.addEventListener("click", refresh);
    
    refresh();
    setInterval(refresh, 10000);
    setInterval(refresh, refreshInterval);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
