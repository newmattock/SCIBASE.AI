import { createHash } from "node:crypto"

const REQUIRED_COMPONENT_DIRS = [
  "manuscript",
  "data",
  "code",
  "notebooks",
  "results",
  "protocols",
]

const REQUIRED_API_METHODS = new Set(["GET", "POST", "PUT"])

const normalizePath = (path) => {
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error("component path must be a non-empty string")
  }
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "")
  if (normalized.includes("..")) {
    throw new Error(`component path cannot traverse directories: ${path}`)
  }
  return normalized
}

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`
}

const hashValue = (value) =>
  `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`

const classifyComponentDir = (path) => {
  if (path === "metadata.json") return "metadata"
  const topLevel = path.split("/")[0]
  return REQUIRED_COMPONENT_DIRS.includes(topLevel) ? topLevel : "extra"
}

const normalizeComponent = (component) => {
  const path = normalizePath(component.path)
  const content =
    component.content ??
    component.summary ??
    component.externalRef ??
    component.hash ??
    `${path}:${component.mediaType ?? "application/octet-stream"}`
  const sizeBytes =
    component.sizeBytes ??
    (typeof content === "string"
      ? Buffer.byteLength(content)
      : Buffer.byteLength(stableStringify(content)))

  return {
    path,
    componentType: classifyComponentDir(path),
    mediaType: component.mediaType ?? "application/octet-stream",
    visibility: component.visibility ?? "public",
    contentHash: component.hash ?? hashValue(content),
    sizeBytes,
    lfsPointer: Boolean(component.lfsPointer || sizeBytes > 5_000_000),
    reproducibilityRole: component.reproducibilityRole ?? "supporting",
  }
}

const coverageForComponents = (components) => {
  const coverage = Object.fromEntries(
    [...REQUIRED_COMPONENT_DIRS, "metadata"].map((name) => [name, false]),
  )

  for (const component of components) {
    if (component.componentType in coverage) coverage[component.componentType] = true
  }

  return coverage
}

const missingCoverage = (coverage) =>
  Object.entries(coverage)
    .filter(([, present]) => !present)
    .map(([name]) => name)

export const buildRepositoryManifest = (project) => {
  const components = (project.components ?? []).map(normalizeComponent)
  const coverage = coverageForComponents(components)
  const missing = missingCoverage(coverage)
  const semanticVersion = project.semanticVersion ?? project.version ?? "0.1.0"

  const manifest = {
    repositoryId: project.repositoryId,
    title: project.title,
    semanticVersion,
    tag: project.tag ?? `v${semanticVersion}`,
    doi: project.doi,
    citation: project.citation,
    authors: project.authors ?? [],
    funding: project.funding ?? [],
    generatedAt: project.generatedAt ?? "2026-05-16T00:00:00.000Z",
    components,
    requiredCoverage: coverage,
    reproducibility: {
      pipeline: project.reproducibility?.pipeline ?? "not-declared",
      environment: project.reproducibility?.environment ?? "not-declared",
      status: project.reproducibility?.status ?? "unknown",
      evidence:
        project.reproducibility?.evidence?.map((item) => normalizePath(item)) ?? [],
    },
    metadata: {
      schemaOrgType: project.metadata?.schemaOrgType ?? "ScholarlyArticle",
      license: project.metadata?.license ?? "not-declared",
      keywords: project.metadata?.keywords ?? [],
    },
  }

  manifest.integrityRoot = hashValue({
    repositoryId: manifest.repositoryId,
    semanticVersion: manifest.semanticVersion,
    components: manifest.components.map(({ path, contentHash }) => ({
      path,
      contentHash,
    })),
    reproducibility: manifest.reproducibility,
  })

  manifest.blockers = missing.map(
    (name) => `missing required repository component: ${name}`,
  )

  return manifest
}

export const validateRestApiPlan = (routes, manifest) => {
  const normalizedRoutes = (routes ?? []).map((route) => ({
    method: String(route.method ?? "").toUpperCase(),
    path: route.path,
    scope: route.scope,
    public: Boolean(route.public),
    response: route.response ?? "json",
    includesIntegrityRoot: Boolean(route.includesIntegrityRoot),
  }))

  const methods = new Set(normalizedRoutes.map((route) => route.method))
  const missingMethods = [...REQUIRED_API_METHODS].filter(
    (method) => !methods.has(method),
  )
  const exportRoute = normalizedRoutes.find(
    (route) =>
      route.method === "GET" &&
      route.path?.includes("/export") &&
      route.includesIntegrityRoot,
  )
  const unsafeRoutes = normalizedRoutes.filter((route) => !route.public)
  const missingScopes = normalizedRoutes.filter((route) => !route.scope)

  const blockers = [
    ...missingMethods.map((method) => `missing public REST ${method} route`),
    ...(exportRoute ? [] : ["missing GET export route with integrity root"]),
    ...unsafeRoutes.map((route) => `route is not public: ${route.method} ${route.path}`),
    ...missingScopes.map((route) => `route lacks scope: ${route.method} ${route.path}`),
  ]

  return {
    ready: blockers.length === 0,
    manifestIntegrityRoot: manifest.integrityRoot,
    methods: [...methods].sort(),
    exportRoute: exportRoute?.path ?? null,
    routes: normalizedRoutes,
    blockers,
  }
}

export const planExportBundle = (manifest, apiPlan) => {
  const manifestEntry = {
    path: "manifest.json",
    type: "manifest",
    hash: hashValue(manifest),
  }
  const apiEntry = {
    path: "api/routes.json",
    type: "api-contract",
    hash: hashValue(apiPlan.routes),
  }
  const reproducibilityEntry = {
    path: "reproducibility/runbook.json",
    type: "reproducibility",
    hash: hashValue(manifest.reproducibility),
  }
  const citationEntry = {
    path: "citation/cite-this-project.json",
    type: "citation",
    hash: hashValue({
      doi: manifest.doi,
      citation: manifest.citation,
      tag: manifest.tag,
    }),
  }
  const componentEntries = manifest.components.map((component) => ({
    path: component.path,
    type: component.componentType,
    hash: component.contentHash,
    mediaType: component.mediaType,
    lfsPointer: component.lfsPointer,
  }))

  const entries = [
    manifestEntry,
    apiEntry,
    reproducibilityEntry,
    citationEntry,
    ...componentEntries,
  ].sort((a, b) => a.path.localeCompare(b.path))

  return {
    format: "scibase-export-bundle-v1",
    repositoryId: manifest.repositoryId,
    tag: manifest.tag,
    entryCount: entries.length,
    entries,
    bundleHash: hashValue(entries.map(({ path, hash }) => ({ path, hash }))),
  }
}

export const buildGitCompatibleCliPlan = (manifest, exportBundle) => {
  const repoRef = `${manifest.repositoryId}@${manifest.tag}`
  return [
    {
      command: `scibase repo clone ${repoRef}`,
      purpose: "clone a tagged scientific repository snapshot",
    },
    {
      command: `scibase repo status --integrity ${manifest.integrityRoot}`,
      purpose: "verify local component hashes before editing or reproducing",
    },
    {
      command: `scibase repo export ${repoRef} --format zip --bundle-hash ${exportBundle.bundleHash}`,
      purpose: "create an archival export bundle with manifest and citation metadata",
    },
    {
      command: `scibase repo api-routes ${manifest.repositoryId}`,
      purpose: "discover public REST routes for GET/POST/PUT access",
    },
  ]
}

export const assessExportReadiness = (manifest, apiPlan, exportBundle) => {
  const blockers = [
    ...manifest.blockers,
    ...apiPlan.blockers,
    ...(manifest.reproducibility.status === "passing"
      ? []
      : [`reproducibility status is ${manifest.reproducibility.status}`]),
    ...(exportBundle.entryCount >= manifest.components.length + 4
      ? []
      : ["export bundle is missing contract entries"]),
  ]

  return {
    ready: blockers.length === 0,
    blockers,
    releaseSummary: {
      repositoryId: manifest.repositoryId,
      tag: manifest.tag,
      doi: manifest.doi,
      integrityRoot: manifest.integrityRoot,
      bundleHash: exportBundle.bundleHash,
      apiMethods: apiPlan.methods,
    },
  }
}

export const createRepositoryApiExportContract = (project) => {
  const manifest = buildRepositoryManifest(project)
  const apiPlan = validateRestApiPlan(project.apiRoutes, manifest)
  const exportBundle = planExportBundle(manifest, apiPlan)
  const cliPlan = buildGitCompatibleCliPlan(manifest, exportBundle)
  const readiness = assessExportReadiness(manifest, apiPlan, exportBundle)

  return {
    manifest,
    apiPlan,
    exportBundle,
    cliPlan,
    readiness,
  }
}
