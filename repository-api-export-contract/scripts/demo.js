import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { createRepositoryApiExportContract } from "../src/repository-api-export-contract.js"

const here = dirname(fileURLToPath(import.meta.url))
const samplePath = join(here, "../data/sample-project.json")
const project = JSON.parse(readFileSync(samplePath, "utf8"))
const contract = createRepositoryApiExportContract(project)

console.log("Repository API export contract demo")
console.log("Repository:", contract.manifest.repositoryId)
console.log("Tag:", contract.manifest.tag)
console.log("Ready:", contract.readiness.ready)
console.log("Integrity root:", contract.manifest.integrityRoot)
console.log("Bundle hash:", contract.exportBundle.bundleHash)
console.log("API methods:", contract.apiPlan.methods.join(", "))
console.log("Export route:", contract.apiPlan.exportRoute)
console.log("Bundle entries:", contract.exportBundle.entryCount)
console.log("CLI workflow:")
for (const step of contract.cliPlan) {
  console.log(`- ${step.command}`)
}
