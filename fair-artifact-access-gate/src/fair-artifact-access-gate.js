import { createHash } from "node:crypto";

const SUPPORTED_FAMILIES = new Set([
  "code",
  "dataset",
  "figure",
  "model",
  "notebook",
  "raw-instrument-output"
]);

const REQUIRED_TAG_GROUPS = ["keywords", "instruments", "organisms", "variables"];

const REQUIRED_METADATA_STANDARDS = [
  {
    key: "jsonLd",
    label: "JSON-LD",
    fields: ["@context", "@type", "name", "identifier"]
  },
  {
    key: "dataCite",
    label: "DataCite",
    fields: ["identifier", "creators", "publisher", "publicationYear", "resourceType"]
  },
  {
    key: "schemaOrg",
    label: "schema.org",
    fields: ["name", "description", "license", "distribution"]
  }
];

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function hasValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined && value !== null && value !== "";
}

function projectUrl(project, artifactPath) {
  const base = String(project.persistentBaseUrl || "").replace(/\/$/, "");
  const encodedPath = String(artifactPath)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${base}/${encodedPath}`;
}

export function buildMetadataStandardsIndex(project) {
  const metadata = project.metadata || {};
  const standards = REQUIRED_METADATA_STANDARDS.map((standard) => {
    const payload = metadata[standard.key] || {};
    const missingFields = standard.fields.filter((field) => !hasValue(payload[field]));

    return {
      key: standard.key,
      label: standard.label,
      ready: missingFields.length === 0,
      missingFields,
      hash: sha256(payload)
    };
  });

  return {
    standards,
    allReady: standards.every((standard) => standard.ready),
    readyStandards: standards.filter((standard) => standard.ready).map((standard) => standard.key),
    blockedStandards: standards
      .filter((standard) => !standard.ready)
      .map((standard) => ({
        key: standard.key,
        missingFields: standard.missingFields
      }))
  };
}

export function buildArtifactCatalog(project) {
  const blockers = [];
  const artifacts = Array.isArray(project.artifacts) ? project.artifacts : [];
  const rows = artifacts.map((artifact) => {
    const unsupportedFamily = !SUPPORTED_FAMILIES.has(artifact.family);
    const restricted = artifact.access === "restricted";
    const row = {
      path: artifact.path,
      family: artifact.family,
      format: artifact.format,
      access: artifact.access || "unknown",
      preview: artifact.preview || null,
      versioned: artifact.versioned === true,
      diffable: artifact.diffable === true,
      machineReadable: artifact.machineReadable === true,
      sizeBytes: Number(artifact.sizeBytes || 0),
      persistentUrl: projectUrl(project, artifact.path),
      reviewerUrl: restricted ? `${projectUrl(project, artifact.path)}?reviewer=1` : null,
      hash: sha256({
        path: artifact.path,
        family: artifact.family,
        format: artifact.format,
        version: project.version,
        sizeBytes: artifact.sizeBytes
      })
    };

    if (unsupportedFamily) {
      blockers.push(`unsupported artifact family: ${artifact.family || "missing"}`);
    }

    if (!artifact.preview) {
      blockers.push(`artifact lacks preview: ${artifact.path}`);
    }

    if (artifact.versioned !== true) {
      blockers.push(`artifact is not versioned: ${artifact.path}`);
    }

    if (!["public", "restricted"].includes(row.access)) {
      blockers.push(`artifact has invalid access policy: ${artifact.path}`);
    }

    if (restricted && artifact.reviewerAccess !== true) {
      blockers.push(`restricted artifact lacks reviewer access: ${artifact.path}`);
    }

    if (restricted && !artifact.restrictionReason) {
      blockers.push(`restricted artifact lacks restriction reason: ${artifact.path}`);
    }

    return row;
  });

  const familyCounts = rows.reduce((counts, row) => {
    counts[row.family] = (counts[row.family] || 0) + 1;
    return counts;
  }, {});

  return {
    artifacts: rows,
    families: Object.keys(familyCounts).sort(),
    familyCounts,
    publicCount: rows.filter((row) => row.access === "public").length,
    restrictedCount: rows.filter((row) => row.access === "restricted").length,
    machineReadableCount: rows.filter((row) => row.machineReadable).length,
    versionedCount: rows.filter((row) => row.versioned).length,
    diffableCount: rows.filter((row) => row.diffable).length,
    totalSizeBytes: rows.reduce((sum, row) => sum + row.sizeBytes, 0),
    ready: artifacts.length > 0 && blockers.length === 0,
    blockers
  };
}

export function evaluateFairSignals(project, catalog, standardsIndex) {
  const tagBlockers = REQUIRED_TAG_GROUPS
    .filter((tagGroup) => !hasValue(project.tags?.[tagGroup]))
    .map((tagGroup) => `missing scientific tag group: ${tagGroup}`);

  const signals = [
    {
      key: "findable",
      ready:
        project.indexed === true &&
        hasValue(project.doi) &&
        hasValue(project.persistentBaseUrl) &&
        standardsIndex.readyStandards.includes("dataCite"),
      evidence: ["DOI", "persistent URLs", "repository index", "DataCite metadata"]
    },
    {
      key: "accessible",
      ready: catalog.artifacts.every((artifact) => {
        if (artifact.access === "public") {
          return true;
        }

        const original = project.artifacts.find((candidate) => candidate.path === artifact.path) || {};
        return (
          artifact.access === "restricted" &&
          original.reviewerAccess === true &&
          hasValue(original.restrictionReason)
        );
      }),
      evidence: ["public links", "restricted-access reasons", "reviewer access URLs"]
    },
    {
      key: "interoperable",
      ready:
        standardsIndex.readyStandards.includes("jsonLd") &&
        standardsIndex.readyStandards.includes("schemaOrg") &&
        catalog.artifacts
          .filter((artifact) => artifact.machineReadable)
          .every((artifact) => hasValue(artifact.format)),
      evidence: ["JSON-LD", "schema.org", "machine-readable formats"]
    },
    {
      key: "reusable",
      ready:
        hasValue(project.license) &&
        hasValue(project.version) &&
        tagBlockers.length === 0 &&
        catalog.artifacts.every((artifact) => artifact.versioned),
      evidence: ["license", "version", "scientific tags", "artifact versioning"]
    }
  ];

  const blockers = [
    ...tagBlockers,
    ...signals
      .filter((signal) => !signal.ready)
      .map((signal) => `FAIR signal failed: ${signal.key}`)
  ];

  return {
    signals,
    allReady: signals.every((signal) => signal.ready),
    blockers
  };
}

export function planReviewerExportPacket(project, catalog, standardsIndex, fairSignals) {
  const metadataEntries = [
    {
      path: "metadata/standards-index.json",
      kind: "metadata",
      hash: sha256(standardsIndex)
    },
    {
      path: "reports/fair-signals.json",
      kind: "report",
      hash: sha256(fairSignals)
    },
    {
      path: "policies/access-policy.json",
      kind: "policy",
      hash: sha256({
        restricted: project.artifacts
          .filter((artifact) => artifact.access === "restricted")
          .map((artifact) => ({
            path: artifact.path,
            reason: artifact.restrictionReason,
            reviewerAccess: artifact.reviewerAccess === true
          }))
      })
    },
    {
      path: "manifests/artifact-catalog.json",
      kind: "manifest",
      hash: sha256(catalog)
    }
  ];

  const artifactEntries = catalog.artifacts.map((artifact) => ({
    path: artifact.path,
    kind: artifact.family,
    access: artifact.access,
    persistentUrl: artifact.persistentUrl,
    reviewerUrl: artifact.reviewerUrl,
    hash: artifact.hash
  }));

  const entries = [...metadataEntries, ...artifactEntries];
  const packetHash = sha256({
    projectId: project.projectId,
    version: project.version,
    entries
  });

  return {
    projectId: project.projectId,
    title: project.title,
    version: project.version,
    entryCount: entries.length,
    entries,
    packetHash,
    auditDigest: {
      projectId: project.projectId,
      standardsReady: standardsIndex.allReady,
      fairReady: fairSignals.allReady,
      restrictedArtifactCount: catalog.restrictedCount,
      packetHash
    }
  };
}

export function assessFairArtifactAccessGate(project) {
  const standardsIndex = buildMetadataStandardsIndex(project);
  const catalog = buildArtifactCatalog(project);
  const fairSignals = evaluateFairSignals(project, catalog, standardsIndex);
  const reviewerPacket = planReviewerExportPacket(project, catalog, standardsIndex, fairSignals);

  const metadataBlockers = standardsIndex.blockedStandards.map(
    (standard) => `metadata standard not ready: ${standard.key}`
  );

  const blockers = [
    ...metadataBlockers,
    ...catalog.blockers,
    ...fairSignals.blockers
  ];

  return {
    projectId: project.projectId,
    ready:
      standardsIndex.allReady &&
      catalog.ready &&
      fairSignals.allReady &&
      blockers.length === 0,
    standardsIndex,
    catalog,
    fairSignals,
    reviewerPacket,
    blockers
  };
}
