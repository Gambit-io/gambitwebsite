/**
 * Gillis demo feedback -> Google Sheet
 * ------------------------------------
 * Wires the feedback form in demo/gillis.html to a Google Sheet.
 *
 * SETUP (about 5 minutes):
 *  1. Create a new Google Sheet (e.g. "Gillis Demo Feedback").
 *     In row 1, add these headers (order matters):
 *       Timestamp | Rating | Area | Feedback | Name | Tenant | Source | Page
 *  2. In that Sheet: Extensions > Apps Script.
 *  3. Delete any starter code, paste THIS file, and Save.
 *  4. Deploy > New deployment > gear icon > Web app.
 *       - Description: Gillis feedback
 *       - Execute as: Me
 *       - Who has access: Anyone
 *     Click Deploy, authorize when prompted, and copy the Web app URL
 *     (it ends in /exec).
 *  5. In demo/gillis.html, set:
 *       const GILLIS_FEEDBACK_URL = 'https://script.google.com/macros/s/XXXX/exec';
 *     Commit + deploy. Submissions now append a row to the Sheet.
 *
 * Note: the browser posts with mode:'no-cors' (fire-and-forget), so no
 * CORS headers are needed here. If you change the columns above, update
 * the appendRow order below to match.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Feedback') || ss.getSheets()[0];
    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.rating || '',
      data.area || '',
      data.feedback || '',
      data.name || '',
      data.tenant || '',
      data.source || '',
      data.page || ''
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Optional: lets you open the /exec URL in a browser to confirm it is live.
function doGet() {
  return ContentService
    .createTextOutput('Gillis feedback endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}
