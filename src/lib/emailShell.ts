// Shared scaffold for every FluxWork email. Email-client-safe: table layout,
// inline styles only, and the logo is drawn with table cells so no image loads.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

const LOGO = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="width:40px;height:40px;background:#0e5c63;border-radius:11px;text-align:center;vertical-align:middle;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:26px;color:#eef1f1;">F</div>
        <div style="height:2px;margin:-3px 9px 0;background:#e0b36a;border-radius:2px;line-height:2px;font-size:0;">&nbsp;</div>
      </td>
      <td style="padding-left:11px;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#0f1a1c;">FluxWork</td>
    </tr></table>`;

export function renderEmailShell({
  preheader,
  card,
  footer,
}: {
  /** Hidden inbox-preview text, pre-escaped by the caller. */
  preheader: string;
  card: string;
  footer: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#eef1f1;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f1;">
    <tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;">
        <tr><td style="padding:0 4px 22px;">${LOGO}</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #dce2e1;border-top:3px solid #b9791f;border-radius:16px;padding:36px 34px;">
          ${card}
        </td></tr>
        <tr><td style="padding:22px 6px 0;">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
