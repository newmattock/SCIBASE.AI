import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import {
  buildRepositoryManifest,
  createRepositoryApiExportContract,
  validateRestApiPlan,
} from "../src/repository-api-export-contract.js"

const here = dirname(fileURLToPath(import.meta.url))
const sample = JSON.parse(
  readFileSync(join(here, "../data/sample-project.json"), "utf8"),
)

const contract = createRepositoryApiExportContract(sample)

assert.equal(contract.readiness.ready, true)
assert.equal(contract.manifest.blockers.length, 0)
assert.equal(contract.manifest.requiredCoverage.manuscript, true)
assert.equal(contract.manifest.requiredCoverage.data, true)
assert.equal(contract.manifest.requiredCoverage.code, true)
assert.equal(contract.manifest.requiredCoverage.notebooks, true)
assert.equal(contract.manifest.requiredCoverage.results, true)
assert.equal(contract.manifest.requiredCoverage.protocols, true)
assert.equal(contract.manifest.requiredCoverage.metadata, true)
assert.match(contract.manifest.integrityRoot, /^sha256:[a-f0-9]{64}$/)

assert.deepEqual(contract.apiPlan.methods, ["GET", "POST", "PUT"])
assert.equal(contract.apiPlan.exportRoute, "/api/projects/:repositoryId/export")
assert.equal(contract.apiPlan.blockers.length, 0)

assert.ok(
  contract.exportBundle.entries.some((entry) => entry.path === "manifest.json"),
)
assert.ok(
  contract.exportBundle.entries.some(
    (entry) => entry.path === "citation/cite-this-project.json",
  ),
)
assert.ok(
  contract.exportBundle.entries.some(
    (entry) => entry.path === "reproducibility/runbook.json",
  ),
)
assert.match(contract.exportBundle.bundleHash, /^sha256:[a-f0-9]{64}$/)

assert.ok(
  contract.cliPlan.some((step) => step.command.startsWith("scibase repo clone")),
)
assert.ok(
  contract.cliPlan.some((step) => step.command.includes("repo export")),
)

const missingMetadata = structuredClone(sample)
missingMetadata.components = missingMetadata.components.filter(
  (component) => component.path !== "metadata.json",
)
const missingMetadataManifest = buildRepositoryManifest(missingMetadata)
assert.deepEqual(missingMetadataManifest.blockers, [
  "missing required repository component: metadata",
])

const incompleteApi = validateRestApiPlan(
  [{ method: "GET", path: "/api/projects/:repositoryId", scope: "project.read", public: true }],
  contract.manifest,
)
assert.equal(incompleteApi.ready, false)
assert.ok(incompleteApi.blockers.includes("missing public REST POST route"))
assert.ok(incompleteApi.blockers.includes("missing public REST PUT route"))
assert.ok(incompleteApi.blockers.includes("missing GET export route with integrity root"))

const failingRepro = structuredClone(sample)
failingRepro.reproducibility.status = "failing"
const failingContract = createRepositoryApiExportContract(failingRepro)
assert.equal(failingContract.readiness.ready, false)
assert.ok(
  failingContract.readiness.blockers.includes("reproducibility status is failing"),
)

console.log("repository-api-export-contract tests passed")
