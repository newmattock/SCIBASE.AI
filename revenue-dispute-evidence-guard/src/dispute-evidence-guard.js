import { createHash } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function asDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function daysUntil(later, now) {
  return Math.ceil((asDate(later).getTime() - asDate(now).getTime()) / DAY_MS);
}

function severityRank(severity) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity] ?? 4;
}

function byId(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

function buildFinding(kind, severity, subject, message, details = {}) {
  return {
    id: stableHash({ kind, subject, message, details }),
    kind,
    severity,
    subject,
    message,
    details
  };
}

function missingEvidence(payment) {
  const provided = new Set(payment.evidence ?? []);
  return (payment.requiredEvidence ?? []).filter((item) => !provided.has(item)).sort();
}

function classifyPayment(payment, invoice, now) {
  const dueInDays = daysUntil(payment.disputeDueAt, now);
  const missing = missingEvidence(payment);
  const revenueAtRiskUsd = invoice?.amountUsd ?? payment.amountUsd ?? 0;

  if (payment.status === "disputed") {
    return buildFinding(
      "payment_disputed",
      missing.length > 0 || dueInDays <= 2 ? "critical" : "high",
      payment.id,
      `${payment.rail} payment is disputed and needs evidence before the deadline`,
      { invoiceId: payment.invoiceId, revenueAtRiskUsd, dueInDays, missingEvidence: missing, disputeReason: payment.disputeReason }
    );
  }

  if (payment.status === "short_paid") {
    return buildFinding(
      "invoice_short_paid",
      missing.length > 0 || dueInDays <= 2 ? "high" : "medium",
      payment.id,
      `${payment.rail} payment did not cover the invoice balance`,
      { invoiceId: payment.invoiceId, revenueAtRiskUsd, paidUsd: payment.amountUsd, dueInDays, missingEvidence: missing, disputeReason: payment.disputeReason }
    );
  }

  if (payment.status === "failed") {
    return buildFinding(
      "payment_failed",
      "high",
      payment.id,
      `${payment.rail} payment failed before entitlement activation`,
      { invoiceId: payment.invoiceId, revenueAtRiskUsd, dueInDays, missingEvidence: missing, disputeReason: payment.disputeReason }
    );
  }

  return null;
}

function buildFindings(input, now) {
  const invoices = byId(input.invoices);
  return (input.payments ?? [])
    .map((payment) => classifyPayment(payment, invoices.get(payment.invoiceId), now))
    .filter(Boolean)
    .sort((a, b) => {
      const bySeverity = severityRank(a.severity) - severityRank(b.severity);
      if (bySeverity !== 0) return bySeverity;
      return a.subject.localeCompare(b.subject);
    });
}

function entitlementDecisions(input, findings) {
  const findingsByInvoice = new Map();
  for (const finding of findings) {
    const invoiceId = finding.details.invoiceId;
    if (!findingsByInvoice.has(invoiceId)) findingsByInvoice.set(invoiceId, []);
    findingsByInvoice.get(invoiceId).push(finding);
  }

  return (input.entitlements ?? []).map((entitlement) => {
    const relatedFindings = findingsByInvoice.get(entitlement.invoiceId) ?? [];
    const hasCritical = relatedFindings.some((finding) => finding.severity === "critical");
    const hasHigh = relatedFindings.some((finding) => finding.severity === "high");
    const decision = hasCritical ? "hold_access" : hasHigh ? "limit_until_resolved" : "release";

    return {
      entitlementId: entitlement.id,
      customerId: entitlement.customerId,
      kind: entitlement.kind,
      monthlyValueUsd: entitlement.monthlyValueUsd,
      decision,
      findingIds: relatedFindings.map((finding) => finding.id).sort()
    };
  });
}

function evidencePackets(input, findings) {
  const invoices = byId(input.invoices);
  const usageByInvoice = new Map();
  for (const event of input.usageEvents ?? []) {
    if (!usageByInvoice.has(event.invoiceId)) usageByInvoice.set(event.invoiceId, []);
    usageByInvoice.get(event.invoiceId).push(event);
  }

  return (input.payments ?? [])
    .filter((payment) => payment.status !== "succeeded")
    .map((payment) => {
      const invoice = invoices.get(payment.invoiceId);
      const relatedFindings = findings.filter((finding) => finding.details.invoiceId === payment.invoiceId);
      const missing = missingEvidence(payment);

      return {
        packetId: stableHash({ paymentId: payment.id, invoiceId: payment.invoiceId, evidence: payment.evidence, missing }),
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        rail: payment.rail,
        dueAt: payment.disputeDueAt,
        revenueAtRiskUsd: invoice?.amountUsd ?? payment.amountUsd,
        readyForSubmission: missing.length === 0,
        providedEvidence: [...(payment.evidence ?? [])].sort(),
        missingEvidence: missing,
        usageEventCount: usageByInvoice.get(payment.invoiceId)?.length ?? 0,
        findingIds: relatedFindings.map((finding) => finding.id).sort()
      };
    })
    .sort((a, b) => asDate(a.dueAt) - asDate(b.dueAt));
}

function financeActions(findings, packets) {
  const packetByPayment = byId(packets.map((packet) => ({ ...packet, id: packet.paymentId })));

  return findings.map((finding) => {
    const packet = packetByPayment.get(finding.subject);
    const missing = packet?.missingEvidence ?? [];
    const action = finding.kind === "payment_disputed"
      ? "assemble_dispute_packet"
      : finding.kind === "invoice_short_paid"
        ? "request_purchase_order_or_balance"
        : "pause_provisioning_and_retry_payment";

    return {
      action,
      severity: finding.severity,
      paymentId: finding.subject,
      invoiceId: finding.details.invoiceId,
      dueInDays: finding.details.dueInDays,
      revenueAtRiskUsd: finding.details.revenueAtRiskUsd,
      missingEvidence: missing,
      packetId: packet?.packetId
    };
  }).sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    const byDueDate = a.dueInDays - b.dueInDays;
    if (byDueDate !== 0) return byDueDate;
    return b.revenueAtRiskUsd - a.revenueAtRiskUsd;
  });
}

export function analyzeRevenueDisputes(input, options = {}) {
  const now = options.now ?? input.generatedAt ?? new Date().toISOString();
  const findings = buildFindings(input, now);
  const entitlements = entitlementDecisions(input, findings);
  const packets = evidencePackets(input, findings);
  const actions = financeActions(findings, packets);
  const revenueAtRiskUsd = findings.reduce((sum, finding) => sum + finding.details.revenueAtRiskUsd, 0);

  return {
    organization: input.organization,
    generatedAt: now,
    summary: {
      customers: input.customers?.length ?? 0,
      invoices: input.invoices?.length ?? 0,
      paymentsAtRisk: findings.length,
      revenueAtRiskUsd,
      criticalFindings: findings.filter((finding) => finding.severity === "critical").length,
      highFindings: findings.filter((finding) => finding.severity === "high").length,
      heldEntitlements: entitlements.filter((entitlement) => entitlement.decision === "hold_access").length,
      limitedEntitlements: entitlements.filter((entitlement) => entitlement.decision === "limit_until_resolved").length,
      readyEvidencePackets: packets.filter((packet) => packet.readyForSubmission).length
    },
    findings,
    entitlementDecisions: entitlements,
    evidencePackets: packets,
    financeActions: actions,
    evidenceDigest: stableHash({ now, findings, entitlements, packets })
  };
}
