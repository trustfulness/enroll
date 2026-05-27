(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const eventId = (params.get("e") || params.get("event") || "").trim();
  const forceDemo = params.get("demo") === "1";
  const apiUrl = (window.ENROLL_CONFIG?.apiUrl || "").trim();
  const isDemo = forceDemo || !apiUrl;

  const STORAGE_TOKEN = "enroll_token_" + (eventId || "default");
  const STORAGE_PROFILE = "enroll_profile";
  const DEMO_STORAGE = "enroll_demo_data";
  const TZ_HK = "Asia/Hong_Kong";

  const $ = (sel) => document.querySelector(sel);

  const els = {
    demoBanner: $("#demoBanner"),
    configBanner: $("#configBanner"),
    eventTitle: $("#eventTitle"),
    eventSubtitle: $("#eventSubtitle"),
    statusBadge: $("#statusBadge"),
    enrollForm: $("#enrollForm"),
    nameInput: $("#name"),
    phoneInput: $("#phone"),
    enrollBtn: $("#enrollBtn"),
    cancelBtn: $("#cancelBtn"),
    refreshBtn: $("#refreshBtn"),
    queueList: $("#queueList"),
    queueEmpty: $("#queueEmpty"),
    confirmedStat: $("#confirmedStat"),
    waitlistStat: $("#waitlistStat"),
    mainContent: $("#mainContent"),
    loading: $("#loading"),
    noEvent: $("#noEvent"),
    myStatus: $("#myStatus"),
  };

  function showToast(message, type) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.className = "toast show" + (type ? " " + type : "");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }

  function parseHongKongDate(value) {
    if (!value) return null;
    const s = String(value)
      .trim()
      .replace(/\s+HKT$/i, "");
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
    return (
      d.toLocaleString("en-HK", {
        timeZone: TZ_HK,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }) + " HKT"
    );
  }

  function nowHongKongStored() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ_HK,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} HKT`;
  }

  function loadProfile() {
    try {
      const p = JSON.parse(localStorage.getItem(STORAGE_PROFILE) || "{}");
      if (p.name) els.nameInput.value = p.name;
      if (p.phone) els.phoneInput.value = p.phone;
    } catch (_) {}
  }

  function saveProfile() {
    localStorage.setItem(
      STORAGE_PROFILE,
      JSON.stringify({
        name: els.nameInput.value.trim(),
        phone: els.phoneInput.value.trim(),
      })
    );
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
    els.noEvent.querySelector("p").textContent =
      "Missing event ID. Use a link like ?e=sat-pickleball (ask your organizer for the correct link).";
    return null;
  }

  // ——— Demo backend (localStorage only) ———

  function demoLoad() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_STORAGE) || "{}");
    } catch (_) {
      return {};
    }
  }

  function demoSave(data) {
    localStorage.setItem(DEMO_STORAGE, JSON.stringify(data));
  }

  function demoEnsureEvent(data, eid) {
    if (!data.events) data.events = {};
    if (!data.enrollments) data.enrollments = {};
    if (!data.events[eid]) {
      data.events[eid] = {
        eventId: eid,
        title: eid === "demo" ? "Demo pickup game" : "Event " + eid,
        maxSeats: 10,
        opensAt: "",
        closesAt: "",
        active: true,
      };
    }
    if (!data.enrollments[eid]) data.enrollments[eid] = [];
    return data;
  }

  function demoApi(action, body, eid) {
    const data = demoEnsureEvent(demoLoad(), eid);
    const ev = data.events[eid];
    const list = data.enrollments[eid].filter((r) => r.status === "active");
    list.sort(
      (a, b) =>
        (parseHongKongDate(a.enrolledAt)?.getTime() || 0) -
        (parseHongKongDate(b.enrolledAt)?.getTime() || 0)
    );

    if (action === "list") {
      const maxSeats = Number(ev.maxSeats) || 0;
      const enrollments = list.map((row, i) => {
        const position = i + 1;
        const confirmed = maxSeats > 0 ? position <= maxSeats : true;
        return {
          position,
          name: row.name,
          phone: row.phone || "",
          enrolledAt: row.enrolledAt,
          status: confirmed ? "confirmed" : "waitlist",
        };
      });
      return Promise.resolve({
        ok: true,
        event: {
          eventId: ev.eventId,
          title: ev.title,
          maxSeats,
          opensAt: ev.opensAt || "",
          closesAt: ev.closesAt || "",
          active: ev.active !== false,
        },
        enrollments,
        confirmedCount: enrollments.filter((e) => e.status === "confirmed").length,
        waitlistCount: enrollments.filter((e) => e.status === "waitlist").length,
        isOpen: ev.active !== false,
      });
    }

    if (action === "enroll") {
      const name = (body.name || "").trim();
      const phone = (body.phone || "").trim();
      if (!name) return Promise.resolve({ ok: false, error: "Name is required." });

      const dup = list.some(
        (r) =>
          (phone && r.phone === phone) || r.name.toLowerCase() === name.toLowerCase()
      );
      if (dup) return Promise.resolve({ ok: false, error: "You are already enrolled." });

      const token = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      data.enrollments[eid].push({
        name,
        phone,
        enrolledAt: nowHongKongStored(),
        status: "active",
        token,
      });
      demoSave(data);
      return demoApi("list", {}, eid).then((updated) => {
        const me = updated.enrollments.find(
          (e) =>
            e.name === name && (!phone || !e.phone || e.phone === phone)
        );
        return {
          ok: true,
          token,
          enrollment: me,
          message: me?.status === "waitlist" ? "Added to waitlist." : "You are enrolled.",
          ...updated,
        };
      });
    }

    if (action === "cancel") {
      const token = (body.token || "").trim();
      const rows = data.enrollments[eid];
      const idx = rows.findIndex((r) => r.token === token && r.status === "active");
      if (idx < 0) return Promise.resolve({ ok: false, error: "Enrollment not found." });
      rows[idx].status = "cancelled";
      demoSave(data);
      return demoApi("list", {}, eid).then((updated) => ({
        ok: true,
        message: "Enrollment cancelled.",
        ...updated,
      }));
    }

    return Promise.resolve({ ok: false, error: "Unknown action" });
  }

  // ——— Google Apps Script API (GET — same as browser test URLs) ———

  async function apiCall(action, extra) {
    const eid = requireEventId();
    if (!eid) return { ok: false, error: "Missing event ID." };

    if (isDemo) {
      return demoApi(action, extra || {}, eid);
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
      throw new Error(
        "Cannot reach Google Apps Script. Check apiUrl in config.js and deployment (Anyone)."
      );
    }

    const text = await res.text();

    if (text.trim().startsWith("<")) {
      throw new Error(
        "Server returned HTML instead of JSON. Redeploy Apps Script as Web app (Anyone) and use the /exec URL."
      );
    }

    try {
      return JSON.parse(text);
    } catch (_) {
      throw new Error("Invalid JSON from server: " + text.slice(0, 120));
    }
  }

  function renderEvent(data) {
    if (!data.ok) {
      els.loading.classList.add("hidden");
      els.mainContent.classList.add("hidden");
      els.noEvent.classList.remove("hidden");
      els.noEvent.querySelector("p").textContent = data.error || "Event not found.";
      return;
    }

    const ev = data.event;
    els.eventTitle.textContent = ev.title;
    els.eventSubtitle.textContent =
      "Max " +
      ev.maxSeats +
      " spots · First come, first served" +
      (ev.opensAt ? " · Opens " + formatTime(ev.opensAt) : "") +
      (ev.closesAt ? " · Closes " + formatTime(ev.closesAt) : "");

    const open = data.isOpen;
    els.statusBadge.textContent = open ? "Enrollment open" : "Enrollment closed";
    els.statusBadge.className = "badge " + (open ? "open" : "closed");

    els.confirmedStat.textContent = data.confirmedCount ?? 0;
    els.waitlistStat.textContent = data.waitlistCount ?? 0;

    const profile = {
      name: els.nameInput.value.trim(),
      phone: els.phoneInput.value.trim(),
    };

    let myRow = null;
    data.enrollments.forEach((row) => {
      if (
        profile.name &&
        row.name.toLowerCase() === profile.name.toLowerCase() &&
        (!profile.phone || !row.phone || row.phone === profile.phone)
      ) {
        myRow = row;
      }
    });

    if (myRow) {
      els.myStatus.classList.remove("hidden");
      els.myStatus.textContent =
        "Your position: #" +
        myRow.position +
        " (" +
        (myRow.status === "confirmed" ? "confirmed" : "waitlist") +
        ") · " +
        formatTime(myRow.enrolledAt);
      els.cancelBtn.classList.remove("hidden");
    } else if (getToken()) {
      els.myStatus.classList.remove("hidden");
      els.myStatus.textContent =
        "You enrolled on this device. Tap Cancel to leave the queue.";
      els.cancelBtn.classList.remove("hidden");
    } else {
      els.myStatus.classList.add("hidden");
      els.cancelBtn.classList.add("hidden");
    }

    els.enrollBtn.disabled = !open;
    els.queueList.innerHTML = "";

    if (!data.enrollments.length) {
      els.queueEmpty.classList.remove("hidden");
    } else {
      els.queueEmpty.classList.add("hidden");
      data.enrollments.forEach((row) => {
        const li = document.createElement("li");
        li.className = "queue-item " + row.status;
        li.innerHTML =
          '<div class="position">' +
          row.position +
          "</div>" +
          '<div class="queue-body">' +
          '<p class="queue-name">' +
          escapeHtml(row.name) +
          "</p>" +
          '<p class="queue-meta">' +
          formatTime(row.enrolledAt) +
          (row.phone ? " · " + escapeHtml(row.phone) : "") +
          "</p>" +
          '<span class="status-pill ' +
          row.status +
          '">' +
          (row.status === "confirmed" ? "Confirmed" : "Waitlist") +
          "</span>" +
          "</div>";
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
    const phone = els.phoneInput.value.trim();
    if (!name) {
      showToast("Please enter your name.", "error");
      return;
    }

    els.enrollBtn.disabled = true;
    try {
      const data = await apiCall("enroll", { name, phone });
      if (!data.ok) {
        showToast(data.error || "Enrollment failed.", "error");
        return;
      }
      if (data.token) setToken(data.token);
      showToast(data.message || "Enrolled!", "success");
      renderEvent(data);
    } catch (err) {
      showToast(err.message || "Enrollment failed.", "error");
    } finally {
      els.enrollBtn.disabled = false;
    }
  }

  async function cancel() {
    if (!requireEventId()) return;
    const token = getToken();
    if (!token) {
      showToast("No enrollment found on this device.", "error");
      return;
    }
    if (!confirm("Cancel your enrollment for this event?")) return;

    els.cancelBtn.disabled = true;
    try {
      const data = await apiCall("cancel", { token });
      if (!data.ok) {
        showToast(data.error || "Cancel failed.", "error");
        return;
      }
      setToken("");
      showToast(data.message || "Cancelled.", "success");
      renderEvent(data);
    } catch (err) {
      showToast(err.message || "Cancel failed.", "error");
    } finally {
      els.cancelBtn.disabled = false;
    }
  }

  function init() {
    if (forceDemo) {
      els.demoBanner?.classList.remove("hidden");
    } else if (!apiUrl) {
      els.demoBanner?.classList.remove("hidden");
      if (els.configBanner) {
        els.configBanner.classList.remove("hidden");
        els.configBanner.textContent =
          "apiUrl is empty in config.js — enrollments will NOT save to Google Sheet. Add your /exec URL and redeploy.";
      }
    } else if (els.configBanner) {
      els.configBanner.classList.add("hidden");
    }

    if (!eventId && !forceDemo) {
      els.loading.classList.add("hidden");
      els.noEvent.classList.remove("hidden");
      els.noEvent.querySelector("p").textContent =
        "Add ?e=your-event-id to the URL (e.g. ?e=sat-pickleball).";
      loadProfile();
      return;
    }

    loadProfile();
    els.enrollForm.addEventListener("submit", (e) => {
      e.preventDefault();
      enroll();
    });
    els.cancelBtn.addEventListener("click", cancel);
    els.refreshBtn.addEventListener("click", refresh);
    refresh();
    setInterval(refresh, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
