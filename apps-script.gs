/**
 * Google Apps Script backend with 4-digit password security
 * Passwords are stored as TEXT (not numbers) to ensure proper matching
 */

const SHEET_EVENTS = "Events";
const SHEET_ENROLLMENTS = "Enrollments";
const TZ_HK = "Asia/Hong_Kong";
const FMT_STORE = "yyyy-MM-dd HH:mm:ss";
const FMT_DISPLAY = "d MMM yyyy, HH:mm:ss";

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateSheet_(ss, SHEET_EVENTS, [
    "eventId", "title", "maxSeats", "opensAt", "closesAt", "active", "createdAt",
  ]);
  getOrCreateSheet_(ss, SHEET_ENROLLMENTS, [
    "enrollmentId", "eventId", "name", "password", "enrolledAt", "status", "token",
  ]);
  
  // Format password column as plain text
  const enrollSheet = ss.getSheetByName(SHEET_ENROLLMENTS);
  if (enrollSheet) {
    enrollSheet.getRange("D:D").setNumberFormat("@");
    Logger.log("Password column formatted as Plain Text");
  }
}

function doGet(e) {
  return handleRequest_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  const params = {};
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(k => params[k] = e.parameter[k]);
  }
  if (e && e.postData && e.postData.contents) {
    try {
      const json = JSON.parse(e.postData.contents);
      Object.keys(json).forEach(k => params[k] = json[k]);
    } catch (err) {}
  }
  return handleRequest_(params);
}

function handleRequest_(params) {
  try {
    const action = (params.action || "").toString().toLowerCase();
    let result;

    if (action === "list") {
      result = listEvent_(params.eventId);
    } else if (action === "enroll") {
      result = enroll_(params);
    } else if (action === "cancel") {
      result = cancel_(params);
    } else if (action === "cancelbyname") {
      result = cancelByName_(params);
    } else if (action === "createevent") {
      result = createEvent_(params);
    } else {
      result = { ok: false, error: "Unknown action." };
    }
    
    return jsonResponse_(result);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

function listEvent_(eventId) {
  const event = getEvent_(eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const enrollments = getActiveEnrollments_(eventId);
  const maxSeats = Number(event.maxSeats) || 0;

  // Password is NOT included in the list - only name and time
  const list = enrollments.map(function (row, index) {
    const position = index + 1;
    const confirmed = maxSeats > 0 ? position <= maxSeats : true;
    return {
      position: position,
      name: row.name,
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
    confirmedCount: list.filter(e => e.status === "confirmed").length,
    waitlistCount: list.filter(e => e.status === "waitlist").length,
    isOpen: isEnrollmentOpen_(event, new Date()),
  };
}

function enroll_(params) {
  const eventId = (params.eventId || "").toString().trim();
  const name = (params.name || "").toString().trim();
  const password = (params.password || "").toString().trim();

  if (!eventId || !name) {
    return { ok: false, error: "eventId and name are required." };
  }
  
  if (!password || password.length !== 4 || !/^\d{4}$/.test(password)) {
    return { ok: false, error: "Password must be exactly 4 digits." };
  }

  const event = getEvent_(eventId);
  if (!event) return { ok: false, error: "Event not found." };
  if (event.active === "false" || event.active === false) {
    return { ok: false, error: "This event is closed." };
  }
  if (!isEnrollmentOpen_(event, new Date())) {
    return { ok: false, error: "Enrollment is not open right now." };
  }

  const enrollments = getActiveEnrollments_(eventId);
  const duplicate = enrollments.some(row => row.name.toLowerCase() === name.toLowerCase());
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
    password: password,  // Will be stored as text via appendEnrollment_
    enrolledAt: enrolledAt,
    status: "active",
    token: token,
  });

  const updated = listEvent_(eventId);
  const me = updated.enrollments.find(e => e.name === name);

  return {
    ok: true,
    token: token,
    enrollment: me,
    message: me && me.status === "waitlist" ? "Added to waitlist." : "You are enrolled. Remember your 4-digit password!",
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

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === eventId && data[i][6] === token && data[i][5] === "active") {
      sheet.getRange(i + 1, 6).setValue("cancelled");
      const updated = listEvent_(eventId);
      return {
        ok: true,
        message: "Enrollment cancelled.",
        event: updated.event,
        enrollments: updated.enrollments,
      };
    }
  }

  return { ok: false, error: "Enrollment not found or already cancelled." };
}

function cancelByName_(params) {
  const eventId = (params.eventId || "").toString().trim();
  const name = (params.name || "").toString().trim();
  const inputPassword = (params.password || "").toString().trim();

  if (!eventId || !name) {
    return { ok: false, error: "eventId and name are required." };
  }
  
  if (!inputPassword || inputPassword.length !== 4 || !/^\d{4}$/.test(inputPassword)) {
    return { ok: false, error: "Password must be exactly 4 digits." };
  }

  const sheet = getSheet_(SHEET_ENROLLMENTS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === eventId && data[i][5] === "active") {
      const rowName = data[i][2];
      const rowPassword = data[i][3];
      
      // Convert stored password to string for comparison (handles both text and numbers)
      const storedPasswordStr = String(rowPassword);
      
      if (rowName.toLowerCase() === name.toLowerCase() && storedPasswordStr === inputPassword) {
        sheet.getRange(i + 1, 6).setValue("cancelled");
        const updated = listEvent_(eventId);
        return {
          ok: true,
          message: "Enrollment cancelled.",
          event: updated.event,
          enrollments: updated.enrollments,
        };
      }
    }
  }

  return { ok: false, error: "No active enrollment found with matching name and password." };
}

function createEvent_(params) {
  const eventId = (params.eventId || "").toString().trim();
  const title = (params.title || "").toString().trim();
  const maxSeats = Number(params.maxSeats) || 0;
  const opensAt = (params.opensAt || "").toString().trim();
  const closesAt = (params.closesAt || "").toString().trim();
  const adminKey = (params.adminKey || "").toString();

  const key = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  if (!key) {
    PropertiesService.getScriptProperties().setProperty("ADMIN_KEY", Utilities.getUuid().replace(/-/g, "").slice(0, 16));
  }
  const expectedKey = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  
  if (!adminKey || adminKey !== expectedKey) {
    return { ok: false, error: "Invalid admin key." };
  }

  if (!eventId || !title || maxSeats < 1) {
    return { ok: false, error: "eventId, title, and maxSeats (>= 1) are required." };
  }

  if (getEvent_(eventId)) {
    return { ok: false, error: "Event ID already exists." };
  }

  const sheet = getSheet_(SHEET_EVENTS);
  sheet.appendRow([
    eventId, title, maxSeats,
    normalizeDateInput_(opensAt),
    normalizeDateInput_(closesAt),
    "true",
    formatDateHK_(new Date()),
  ]);

  return { ok: true, eventId: eventId, message: "Event created." };
}

function getAdminKey() {
  let key = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, "").slice(0, 16);
    PropertiesService.getScriptProperties().setProperty("ADMIN_KEY", key);
  }
  Logger.log("ADMIN_KEY: " + key);
  return key;
}

function isEnrollmentOpen_(event, now) {
  if (event.active === "false" || event.active === false) return false;
  if (event.opensAt) {
    const open = parseStoredDate_(event.opensAt);
    if (open && now < open) return false;
  }
  if (event.closesAt) {
    const close = parseStoredDate_(event.closesAt);
    if (close && now > close) return false;
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
        password: data[i][3],
        enrolledAt: data[i][4],
        status: data[i][5],
        token: data[i][6],
      });
    }
  }

  rows.sort((a, b) => {
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
  const sheet = getSheet_(SHEET_ENROLLMENTS);
  
  // Ensure password column is formatted as plain text
  sheet.getRange("D:D").setNumberFormat("@");
  
  // Append row with apostrophe to force text storage
  sheet.appendRow([
    row.enrollmentId,
    row.eventId,
    row.name,
    "'" + row.password,  // Apostrophe forces Google Sheets to store as text
    row.enrolledAt,
    row.status,
    row.token,
  ]);
}

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
  let s = String(value).trim().replace(/\s+HKT$/i, "").trim();
  if (!s) return null;
  try {
    const iso = new Date(s);
    if (!isNaN(iso.getTime())) return iso;
  } catch (err) {}
  try {
    return Utilities.parseDate(s, TZ_HK, FMT_STORE);
  } catch (err) {}
  try {
    return Utilities.parseDate(s, TZ_HK, FMT_DISPLAY);
  } catch (err) {}
  return null;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" not found. Run setup() first.');
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

// ============ MAINTENANCE FUNCTIONS ============

/**
 * Run this ONCE to fix existing passwords to text format
 */
function fixExistingPasswordsToText() {
  const sheet = getSheet_(SHEET_ENROLLMENTS);
  
  // Format column D as plain text
  sheet.getRange("D:D").setNumberFormat("@");
  
  const lastRow = sheet.getLastRow();
  let fixedCount = 0;
  
  for (let i = 2; i <= lastRow; i++) {
    const cell = sheet.getRange(i, 4);
    const value = cell.getValue();
    
    // If it's a number, convert to text
    if (typeof value === 'number') {
      const textValue = value.toString();
      cell.setValue("'" + textValue);
      fixedCount++;
      Logger.log("Row " + i + ": Converted " + value + " to text");
    }
  }
  
  Logger.log("Fixed " + fixedCount + " passwords. All now stored as text.");
}

/**
 * Verify password storage type
 */
function verifyPasswordStorage() {
  const sheet = getSheet_(SHEET_ENROLLMENTS);
  const data = sheet.getDataRange().getValues();
  
  Logger.log("=== PASSWORD STORAGE VERIFICATION ===");
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] === "active") {
      const pwd = data[i][3];
      Logger.log("Name: " + data[i][2]);
      Logger.log("  Password: '" + pwd + "'");
      Logger.log("  Type: " + typeof pwd);
      Logger.log("  Is String: " + (typeof pwd === 'string'));
    }
  }
}

/**
 * Debug - check sheet structure
 */
function debugSheetStructure() {
  const sheet = getSheet_(SHEET_ENROLLMENTS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log("=== ENROLLMENTS SHEET STRUCTURE ===");
  Logger.log("Columns: " + sheet.getLastColumn());
  Logger.log("Headers: " + JSON.stringify(headers));
  Logger.log("Column D format: " + sheet.getRange("D:D").getNumberFormat());
}
