/**
 * Google Apps Script — Marquee 1 Google Sheets Export / Sync Bridge
 * Paste this script into Extensions > Apps Script inside your Google Sheet.
 * Exports bookings to CSV/JSON or pushes directly to Supabase REST API.
 */
function syncBookingsToSupabase() {
  var SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
  var SUPABASE_SERVICE_KEY = 'YOUR_SERVICE_ROLE_KEY'; // Keep private in Script Properties!
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[0]) continue;

    var payload = {
      customer_name: String(row[0]),
      customer_phone: String(row[1]),
      customer_nic: String(row[2]),
      customer_address: String(row[3] || 'Karachi'),
      event_type: String(row[4] || 'Baraat'),
      event_date: Utilities.formatDate(new Date(row[5]), 'Asia/Karachi', 'yyyy-MM-dd'),
      start_time: String(row[6] || '19:00'),
      end_time: String(row[7] || '23:00'),
      floors: String(row[8] || 'First').split(',').map(function(s) { return s.trim(); }),
      guests_count: Number(row[9] || 250),
      hall_rent: Number(row[10] || 180000),
      status: String(row[11] || 'Tentative'),
      notes: String(row[12] || '')
    };

    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/bookings', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
        Prefer: 'return=representation'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  }
}
