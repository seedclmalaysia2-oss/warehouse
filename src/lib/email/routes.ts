// Email routes for purchase orders — shared by the settings page (client) and
// the API (server). No server-only imports here.
//
// outward — BOC orders sent to SEED HQ Japan. The rules come from HQ's own
//           order workbook (SEED BOC ORDER SHEET.xlsx, 利用案内 sheet, v1.0
//           2026/09/15): send to SCM 管理購買G at kanri_koubai@seed.co.jp, put
//           "BOC" in the subject, keep the file as Excel.
// inward  — purchase orders customers send to us. The settings say where they
//           arrive, who is told, and what acknowledgement goes back.
export type RouteKey = "outward" | "inward";

export type RouteSettings = {
  enabled: boolean;
  mailbox: string;
  toList: string[];
  ccList: string[];
  bccList: string[];
  subjectTemplate: string;
  bodyTemplate: string;
  attachmentName: string;
  autoAck: boolean;
};

export const HQ_ORDER_ADDRESS = "kanri_koubai@seed.co.jp";

// Our identity in HQ's customer master (Master sheet of the order workbook).
export const OUR_COMPANY = {
  name: "SEED CONTACT LENS(M)",
  code: "2003004100",
  currency: "JPY",
};

export const DEFAULTS: Record<RouteKey, RouteSettings> = {
  outward: {
    enabled: true,
    mailbox: "",
    toList: [HQ_ORDER_ADDRESS],
    ccList: [],
    bccList: [],
    subjectTemplate: "BOC Order — SEED CONTACT LENS(M) — {poNo} — {date}",
    bodyTemplate: [
      "Dear SCM Purchasing Group (管理購買G),",
      "",
      "Please find attached our BOC order.",
      "",
      "Company: {companyName} (customer code {companyCode})",
      "Order No.: {poNo}",
      "Order date: {date}",
      "Lens: {lensName}",
      "Total quantity: {totalQty}",
      "",
      "Kindly confirm the delivery date when available.",
      "",
      "Best regards,",
      "{senderName}",
      "{companyName}",
    ].join("\n"),
    attachmentName: "SEED BOC ORDER SHEET {poNo}.xlsx",
    autoAck: false,
  },
  inward: {
    enabled: true,
    mailbox: "",
    toList: [],
    ccList: [],
    bccList: [],
    subjectTemplate: "Received — your purchase order {poNo}",
    bodyTemplate: [
      "Dear {customerName},",
      "",
      "Thank you. We have received your purchase order {poNo} dated {date}.",
      "Our team will confirm stock and delivery shortly.",
      "",
      "Best regards,",
      "{senderName}",
      "{companyName}",
    ].join("\n"),
    attachmentName: "",
    autoAck: false,
  },
};

export type Placeholder = { key: string; label: string };

export const PLACEHOLDERS: Record<RouteKey, Placeholder[]> = {
  outward: [
    { key: "poNo", label: "Order No." },
    { key: "date", label: "Order date" },
    { key: "lensName", label: "Lens name" },
    { key: "totalQty", label: "Total qty" },
    { key: "companyName", label: "Our company" },
    { key: "companyCode", label: "Customer code" },
    { key: "senderName", label: "Sender" },
  ],
  inward: [
    { key: "poNo", label: "Customer PO No." },
    { key: "date", label: "PO date" },
    { key: "customerName", label: "Customer" },
    { key: "companyName", label: "Our company" },
    { key: "senderName", label: "Sender" },
  ],
};

/** Illustrative values for the preview and the test email — not real orders. */
export function sampleValues(route: RouteKey, senderName: string): Record<string, string> {
  return {
    poNo: route === "outward" ? "MY-BOC-0001" : "PO-10234",
    date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    lensName: "BREATH-O CORRECT",
    totalQty: "12",
    companyName: OUR_COMPANY.name,
    companyCode: OUR_COMPANY.code,
    customerName: "Sample Optical",
    senderName,
  };
}

/** Replaces {key} tokens. Unknown tokens are left visible so mistakes show. */
export function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

export function unknownTokens(template: string, route: RouteKey): string[] {
  const known = new Set(PLACEHOLDERS[route].map(p => p.key));
  return [...template.matchAll(/\{(\w+)\}/g)].map(m => m[1]).filter(k => !known.has(k));
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
export const isEmail = (s: string) => EMAIL.test(s.trim());

export type Issue = { field: keyof RouteSettings; message: string };

/** Validation shared by the form (live) and the API (authoritative). */
export function validate(route: RouteKey, s: RouteSettings): Issue[] {
  const issues: Issue[] = [];
  if (s.mailbox && !isEmail(s.mailbox)) issues.push({ field: "mailbox", message: "Not a valid email address." });
  for (const field of ["toList", "ccList", "bccList"] as const) {
    const bad = s[field].filter(e => !isEmail(e));
    if (bad.length) issues.push({ field, message: `Not valid: ${bad.join(", ")}` });
  }
  if (!s.subjectTemplate.trim()) issues.push({ field: "subjectTemplate", message: "Subject can't be empty." });
  if (!s.bodyTemplate.trim()) issues.push({ field: "bodyTemplate", message: "Message can't be empty." });
  for (const field of ["subjectTemplate", "bodyTemplate", "attachmentName"] as const) {
    const unknown = unknownTokens(s[field], route);
    if (unknown.length) issues.push({ field, message: `Unknown placeholder: ${unknown.map(u => `{${u}}`).join(", ")}` });
  }

  if (route === "outward") {
    if (s.toList.length === 0) issues.push({ field: "toList", message: "Add at least one recipient." });
    // HQ: 「ご依頼時は、メール件名に「BOC」を記載のうえ送付してください。」
    if (!s.subjectTemplate.includes("BOC")) issues.push({ field: "subjectTemplate", message: "HQ requires \"BOC\" in the subject." });
    // HQ: 「ファイルは可能な限りExcel形式のまま送付してください。」
    if (!/\.xlsx?$/i.test(s.attachmentName.trim())) issues.push({ field: "attachmentName", message: "HQ asks for the order sheet as Excel (.xlsx)." });
  } else {
    if (s.enabled && !s.mailbox) issues.push({ field: "mailbox", message: "Enter the address customers send POs to." });
  }
  return issues;
}
