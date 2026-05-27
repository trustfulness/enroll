/**
 * Google Apps Script backend (free).
 *
 * Setup:
 * 1. New Google Sheet → Extensions → Apps Script → paste this file.
 * 2. Run setup() once (authorize). Creates Events + Enrollments sheets.
 * 3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * 4. Copy the /exec URL into config.js as apiUrl.
 *
 * Admin: create events with action=createEvent (see README).
 */

const SHEET_EVENTS = "Events";
const SHEET_ENROLLMENTS = "Enrollments";
const TZ_HK = "Asia/Hong_Kong";
const FMT_STORE = "yyyy-MM-dd HH:mm:ss";
const FMT_DISPLAY = "d MMM yyyy, HH:mm";

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateSheet_(ss, SHEET_EVENTS, [
    "eventId",
    "title",
    "maxSeats",
    "opensAt",
    "closesAt",
    "active",
    "createdAt",
  ]);
  getOrCreateSheet_(ss, SHEET_ENROLLMENTS, [
    "enrollmentId",
    "eventId",
    "name",
    "phone",
    "enrolledAt",
    "status",
    "token",
  ]);
}

function doGet(e) {
  return handleRequest_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  const params = {};
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function (k) {
      params[k] = e.parameter[k];
    });
  }
  if (e && e.postData && e.postData.contents) {
    try {
      const json = JSON.parse(e.postData.contents);
      Object.keys(json).forEach(function (k) {
        params[k] = json[k];
      });
    } catch (err) {
      // ignore non-JSON body
    }
  }
  return handleRequest_(params);
}

function handleRequest_(params) {
  try {
    const action = (params.action || "").toString().toLowerCase();
    let result;

    switch (action) {
      case "list":
        result = listEvent_(params.eventId);
        break;
      case "enroll":
        result = enroll_(params);
        break;
      case "cancel":
        result = cancel_(params);
        break;
      case "createevent":
        result = createEvent_(params);
        break;
      default:
        result = { ok: false, error: "Unknown action. Use list, enroll, cancel, or createEvent." };
    }

    return jsonResponse_(result);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

function listEvent_(eventId) {
  const event = getEvent_(eventId);
  if (!event) {
    return { ok: false, error: "Event not found." };
  }

  const enrollments = getActiveEnrollments_(eventId);
  const maxSeats = Number(event.maxSeats) || 0;
  const now = new Date();

  const list = enrollments.map(function (row, index) {
    const position = index + 1;
    const confirmed = maxSeats > 0 ? position <= maxSeats : true;
    return {
      position: position,
      name: row.name,
      phone: row.phone || "",
      enrolledAt: formatDateHKDisplay_(row.enrolledAt),
      status: confirmed ? "confirmed" : "waitlist",
    };
  });

  return {
    ok: true,
    event: {
      eventId: event.eventId,
      title: event.title,
      maxSeats: maxSeats,
      opensAt: formatDateHKDisplay_(event.opensAt),
      closesAt: formatDateHKDisplay_(event.closesAt),
      createdAt: formatDateHKDisplay_(event.createdAt),
      active: event.active !== "false" && event.active !== false,
    },
    enrollments: list,
    confirmedCount: list.filter(function (e) {
      return e.status === "confirmed";
    }).length,
    waitlistCount: list.filter(function (e) {
      return e.status === "waitlist";
    }).length,
    isOpen: isEnrollmentOpen_(event, now),
  };
}

function enroll_(params) {
  const eventId = (params.eventId || "").toString().trim();
  const name = (params.name || "").toString().trim();
  const phone = (params.phone || "").toString().trim();

  if (!eventId || !name) {
    return { ok: false, error: "eventId and name are required." };
  }

  const event = getEvent_(eventId);
  if (!event) {
    return { ok: false, error: "Event not found." };
  }
  if (event.active === "false" || event.active === false) {
    return { ok: false, error: "This event is closed." };
  }
  if (!isEnrollmentOpen_(event, new Date())) {
    return { ok: false, error: "Enrollment is not open right now." };
  }

  const enrollments = getActiveEnrollments_(eventId);
  const duplicate = enrollments.some(function (row) {
    return samePerson_(row, name, phone);
  });
  if (duplicate) {
    return { ok: false, error: "You are already enrolled for this event." };
  }

  const token = Utilities.getUuid();
  const enrolledAt = formatDateHK_(new Date());
  const enrollmentId = Utilities.getUuid();

  appendEnrollment_({
    enrollmentId: enrollmentId,
    eventId: eventId,
    name: name,
    phone: phone,
    enrolledAt: enrolledAt,
    status: "active",
    token: token,
  });

  const updated = listEvent_(eventId);
  const me = updated.enrollments.find(function (e) {
    return e.name === name && (phone ? e.phone === phone : true);
  });

  return {
    ok: true,
    token: token,
    enrollment: me,
    message: me && me.status === "waitlist" ? "Added to waitlist." : "You are enrolled.",
    event: updated.event,
    enrollments: updated.enrollments,
  };
}

function cancel_(params) {
  const eventId = (params.eventId || "").toString().trim();
  const token = (params.token || "").toString().trim();

  if (!eventId || !token) {
    return { ok: false, error: "eventId and token are required." };
  }

  const sheet = getSheet_(SHEET_ENROLLMENTS);
  const data = sheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === eventId && data[i][7] === token && data[i][6] === "active") {
      sheet.getRange(i + 1, 7).setValue("cancelled");
      found = true;
      break;
    }
  }

  if (!found) {
    return { ok: false, error: "Enrollment not found or already cancelled." };
  }

  const updated = listEvent_(eventId);
  return {
    ok: true,
    message: "Enrollment cancelled. Queue updated.",
    event: updated.event,
    enrollments: updated.enrollments,
  };
}

function createEvent_(params) {
  const eventId = (params.eventId || "").toString().trim();
  const title = (params.title || "").toString().trim();
  const maxSeats = Number(params.maxSeats) || 0;
  const opensAt = (params.opensAt || "").toString().trim();
  const closesAt = (params.closesAt || "").toString().trim();
  const adminKey = (params.adminKey || "").toString();

  const expectedKey = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  if (!expectedKey) {
    PropertiesService.getScriptProperties().setProperty(
      "ADMIN_KEY",
      Utilities.getUuid().replace(/-/g, "").slice(0, 16)
    );
  }
  const key = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  if (!adminKey || adminKey !== key) {
    return {
      ok: false,
      error: "Invalid admin key. Run getAdminKey() once in the script editor to see your key.",
    };
  }

  if (!eventId || !title || maxSeats < 1) {
    return { ok: false, error: "eventId, title, and maxSeats (>= 1) are required." };
  }

  if (getEvent_(eventId)) {
    return { ok: false, error: "Event ID already exists. Use a different eventId." };
  }

  const sheet = getSheet_(SHEET_EVENTS);
  sheet.appendRow([
    eventId,
    title,
    maxSeats,
    normalizeDateInput_(opensAt),
    normalizeDateInput_(closesAt),
    "true",
    formatDateHK_(new Date()),
  ]);

  return {
    ok: true,
    eventId: eventId,
    enrollUrl: "Share: your-page/index.html?e=" + eventId,
    message: "Event created.",
  };
}

function getAdminKey() {
  const key =
    PropertiesService.getScriptProperties().getProperty("ADMIN_KEY") ||
    (function () {
      const k = Utilities.getUuid().replace(/-/g, "").slice(0, 16);
      PropertiesService.getScriptProperties().setProperty("ADMIN_KEY", k);
      return k;
    })();
  Logger.log("ADMIN_KEY: " + key);
  return key;
}

function isEnrollmentOpen_(event, now) {
  if (event.active === "false" || event.active === false) {
    return false;
  }
  if (event.opensAt) {
    const open = parseStoredDate_(event.opensAt);
    if (open && now < open) {
      return false;
    }
  }
  if (event.closesAt) {
    const close = parseStoredDate_(event.closesAt);
    if (close && now > close) {
      return false;
    }
  }
  return true;
}

function getActiveEnrollments_(eventId) {
  const sheet = getSheet_(SHEET_ENROLLMENTS);
  const data = sheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === eventId && data[i][5] === "active") {
      rows.push({
        enrollmentId: data[i][0],
        eventId: data[i][1],
        name: data[i][2],
        phone: data[i][3] || "",
        enrolledAt: data[i][4],
        status: data[i][5],
        token: data[i][6],
      });
    }
  }

  rows.sort(function (a, b) {
    const ta = parseStoredDate_(a.enrolledAt);
    const tb = parseStoredDate_(b.enrolledAt);
    return (ta ? ta.getTime() : 0) - (tb ? tb.getTime() : 0);
  });

  return rows;
}

function getEvent_(eventId) {
  const sheet = getSheet_(SHEET_EVENTS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId) {
      return {
        eventId: data[i][0],
        title: data[i][1],
        maxSeats: data[i][2],
        opensAt: data[i][3],
        closesAt: data[i][4],
        active: data[i][5],
        createdAt: data[i][6],
      };
    }
  }
  return null;
}

function appendEnrollment_(row) {
  getSheet_(SHEET_ENROLLMENTS).appendRow([
    row.enrollmentId,
    row.eventId,
    row.name,
    row.phone,
    row.enrolledAt,
    row.status,
    row.token,
  ]);
}

function samePerson_(row, name, phone) {
  if (phone && row.phone && row.phone === phone) {
    return true;
  }
  return row.name.toLowerCase() === name.toLowerCase();
}

/** Sheet storage: Hong Kong wall-clock time with HKT label */
function formatDateHK_(date) {
  return Utilities.formatDate(date, TZ_HK, FMT_STORE) + " HKT";
}

function formatDateHKDisplay_(value) {
  if (!value) return "";
  const d = parseStoredDate_(value);
  if (!d) return String(value);
  return Utilities.formatDate(d, TZ_HK, FMT_DISPLAY) + " HKT";
}

function normalizeDateInput_(value) {
  if (!value) return "";
  const d = parseStoredDate_(value);
  return d ? formatDateHK_(d) : String(value).trim();
}

function parseStoredDate_(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/\s+HKT$/i, "").trim();
  try {
    if (s.indexOf("T") >= 0 || s.indexOf("Z") >= 0) {
      const iso = new Date(s);
      if (!isNaN(iso.getTime())) return iso;
    }
  } catch (err) {}
  try {
    return Utilities.parseDate(s, TZ_HK, FMT_STORE);
  } catch (err2) {}
  try {
    return Utilities.parseDate(s, TZ_HK, FMT_DISPLAY);
  } catch (err3) {}
  try {
    const fallback = new Date(s);
    if (!isNaN(fallback.getTime())) return fallback;
  } catch (err4) {}
  return null;
}

/**
 * Run once in Apps Script editor to convert existing ISO dates in the sheet to HKT.
 * Extensions → Apps Script → select migrateSheetDatesToHK → Run
 */
function migrateSheetDatesToHK() {
  migrateColumn_(SHEET_EVENTS, 4); // opensAt
  migrateColumn_(SHEET_EVENTS, 5); // closesAt
  migrateColumn_(SHEET_EVENTS, 7); // createdAt
  migrateColumn_(SHEET_ENROLLMENTS, 6); // enrolledAt
  Logger.log("Migration complete. Dates are now stored as yyyy-MM-dd HH:mm:ss HKT");
}

function migrateColumn_(sheetName, col1Based) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, col1Based, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    const val = values[i][0];
    if (!val) continue;
    const d = parseStoredDate_(val);
    if (!d) continue;
    const formatted = formatDateHK_(d);
    if (String(val).trim() !== formatted) {
      sheet.getRange(i + 2, col1Based).setValue(formatted);
    }
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet "' + name + '" not found. Run setup() first.');
  }
  return sheet;
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}
