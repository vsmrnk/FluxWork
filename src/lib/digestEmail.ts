import { escapeHtml, renderEmailShell } from "@/lib/emailShell";
import { formatMoney } from "@/lib/invoice";
import { formatClock } from "@/lib/time";

export type DigestData = {
  /** e.g. "Jul 14 – Jul 20". */
  periodLabel: string;
  currency: string;
  earnings: number;
  trackedSeconds: number;
  billableSeconds: number;
  nonBillableSeconds: number;
  unbilledTotal: number;
  topProject: { name: string; seconds: number } | null;
  appUrl: string;
};

const INK = "#0f1a1c";
const INK2 = "#566468";
const INK3 = "#7e8a8d";
const LINE = "#dce2e1";
const TEAL = "#0e5c63";
const GREEN = "#176048";
const STEEL = "#5f6a6e";

function statRow(label: string, value: string): string {
  return `<tr>
            <td style="padding:11px 0;border-top:1px solid ${LINE};font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.07em;text-transform:uppercase;color:${INK3};">${escapeHtml(label)}</td>
            <td align="right" style="padding:11px 0;border-top:1px solid ${LINE};font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:${INK};">${value}</td>
          </tr>`;
}

export function renderDigestEmail(data: DigestData): { subject: string; html: string } {
  const {
    periodLabel,
    currency,
    earnings,
    trackedSeconds,
    billableSeconds,
    nonBillableSeconds,
    unbilledTotal,
    topProject,
    appUrl,
  } = data;

  const total = billableSeconds + nonBillableSeconds;
  const billPct = total > 0 ? Math.round((billableSeconds / total) * 100) : 0;
  const nonPct = 100 - billPct;

  const earned = escapeHtml(formatMoney(earnings, currency));
  const period = escapeHtml(periodLabel);
  const url = escapeHtml(appUrl);

  // Split bar — two proportional cells (accent = billable, steel = non-billable).
  const splitBar = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 8px;table-layout:fixed;"><tr>
            <td style="height:12px;background:${TEAL};border-radius:6px 0 0 6px;width:${billPct}%;font-size:0;line-height:12px;">&nbsp;</td>
            <td style="height:12px;background:${STEEL};border-radius:0 6px 6px 0;width:${nonPct}%;font-size:0;line-height:12px;">&nbsp;</td>
          </tr></table>`;

  const rows = [
    statRow("Tracked", escapeHtml(formatClock(trackedSeconds))),
    statRow(
      "Billable",
      `${escapeHtml(formatClock(billableSeconds))} <span style="color:${INK3};font-weight:400;">· ${billPct}%</span>`,
    ),
    statRow("Unbilled", escapeHtml(formatMoney(unbilledTotal, currency))),
    topProject
      ? statRow(
          "Top project",
          `<span style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;">${escapeHtml(
            topProject.name,
          )}</span> <span style="color:${INK3};">· ${escapeHtml(formatClock(topProject.seconds))}</span>`,
        )
      : "",
  ].join("\n          ");

  const card = `<div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${TEAL};font-weight:700;">Weekly review</div>
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:38px;line-height:1.05;margin:12px 0 0;color:${GREEN};">${earned}</h1>
          <div style="height:2px;width:56px;background:#b9791f;border-radius:2px;line-height:2px;font-size:0;margin:10px 0 0;">&nbsp;</div>
          <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${INK2};margin:12px 0 26px;">Earned &middot; ${period}</p>
          <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.07em;text-transform:uppercase;color:${INK3};font-weight:700;margin:0 0 2px;">Billable split</div>
          ${splitBar}
          <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.4;color:${INK3};margin:0 0 18px;">
            <span style="color:${TEAL};font-weight:700;">Billable ${escapeHtml(formatClock(billableSeconds))}</span>
            &nbsp;&nbsp;<span style="color:${STEEL};font-weight:700;">Non-billable ${escapeHtml(formatClock(nonBillableSeconds))}</span>
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
            ${rows}
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="border-radius:11px;background:${TEAL};">
              <a href="${url}" style="display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:11px;">Open FluxWork &rarr;</a>
            </td>
          </tr></table>`;

  const footer = `<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#7e8a8d;margin:0;">FluxWork &middot; time tracking &amp; invoicing for freelancers</p>
          <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9aa4a6;margin:6px 0 0;">You get this once a week. Turn it off in FluxWork &rarr; More.</p>`;

  const preheader = escapeHtml(
    `You earned ${formatMoney(earnings, currency)} and tracked ${formatClock(trackedSeconds)} this week.`,
  );

  const html = renderEmailShell({ preheader, card, footer });
  return { subject: `Your FluxWork week — ${periodLabel}`, html };
}
