import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { reconcileCitationContext } from "../src/citation-context-reconciler.js";

const fixture = JSON.parse(readFileSync(new URL("../sample/citation-context-packet.json", import.meta.url), "utf8"));
const audit = reconcileCitationContext(fixture);

mkdirSync(new URL("../docs/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../docs/citation-context-report.json", import.meta.url),
  `${JSON.stringify(audit, null, 2)}\n`
);

const blockerRows = audit.findings
  .filter((item) => item.severity === "blocker")
  .slice(0, 4)
  .map((item, index) => {
    const y = 228 + index * 42;
    return `<text x="80" y="${y}" class="small">${item.code}: ${item.claimId}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <style>
    .bg { fill: #f8f5ee; }
    .panel { fill: #ffffff; stroke: #ded7c9; stroke-width: 2; }
    .dark { fill: #17212b; }
    .title { font: 700 38px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #26221d; }
    .subtitle { font: 400 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #6b6358; }
    .label { font: 700 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #6b6358; }
    .metric { font: 700 40px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #26221d; }
    .small { font: 500 17px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #f2f6f8; }
    .muted { font: 400 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #cbd5dc; }
  </style>
  <rect class="bg" width="1280" height="720"/>
  <rect class="panel" x="48" y="42" width="1184" height="636" rx="20"/>
  <text class="title" x="78" y="104">Citation Context Reconciler</text>
  <text class="subtitle" x="78" y="138">SCIBASE issue #16 assistant slice for claim, citation, reproducibility, and opportunity review.</text>
  <rect x="78" y="178" width="240" height="130" rx="16" fill="#f0ece2"/>
  <text class="label" x="104" y="222">Claims</text>
  <text class="metric" x="104" y="270">${audit.counts.claims}</text>
  <rect x="358" y="178" width="240" height="130" rx="16" fill="#f0ece2"/>
  <text class="label" x="384" y="222">Blockers</text>
  <text class="metric" x="384" y="270">${audit.counts.blockers}</text>
  <rect x="638" y="178" width="240" height="130" rx="16" fill="#f0ece2"/>
  <text class="label" x="664" y="222">Warnings</text>
  <text class="metric" x="664" y="270">${audit.counts.warnings}</text>
  <rect x="918" y="178" width="240" height="130" rx="16" fill="#f0ece2"/>
  <text class="label" x="944" y="222">Reproducibility</text>
  <text class="metric" x="944" y="270">${audit.reproducibility.score}%</text>
  <rect class="dark" x="78" y="352" width="1080" height="228" rx="18"/>
  <text x="80" y="398" style="font: 700 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; fill: #fff;">Reviewer queue</text>
  ${blockerRows}
  <text class="muted" x="80" y="540">Top opportunity: ${audit.opportunityFeed[0].title}</text>
  <text class="subtitle" x="78" y="626">${audit.exportPacket.auditDigest}</text>
</svg>`;

writeFileSync(new URL("../docs/demo.svg", import.meta.url), svg);

console.log(`ready: ${audit.ready}`);
console.log(`blockers: ${audit.counts.blockers}`);
console.log(`warnings: ${audit.counts.warnings}`);
console.log(`reproducibility: ${audit.reproducibility.score}% ${audit.reproducibility.confidence}`);
console.log(`top opportunity: ${audit.opportunityFeed[0]?.id ?? "none"}`);
console.log(`digest: ${audit.exportPacket.auditDigest}`);
