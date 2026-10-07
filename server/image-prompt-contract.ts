import crypto from "node:crypto";
import { buildPrompt, roomFlowScope } from "./room-staging";
import { SUNBURST_IMAGE_MODEL } from "./openai-image-test";
import { MODERN_EXCLUSIVE_ROOM_APPLICATIONS } from "../shared/modernExclusivePrompt";

/** Runtime fingerprints of composed contracts; no images, customer data or API calls. */
export function imagePromptContractMetadata() {
  const contracts = [];
  for (const room of Object.keys(MODERN_EXCLUSIVE_ROOM_APPLICATIONS).sort()) {
    for (const style of ["scandinavian", "modern"] as const) {
      for (const tier of ["tier1", "tier2", "tier3"] as const) {
        const scope = roomFlowScope(SUNBURST_IMAGE_MODEL, style, tier, room);
        const plan = {
          function: room, architecture: "contract verification",
          existingFurniture: "contract verification", circulation: "contract verification",
          layout: "contract verification", uncertainties: "contract verification",
        };
        const prompt = buildPrompt(plan, room, style, "", [], tier, scope);
        contracts.push({ room, style, tier, scope,
          sha256: crypto.createHash("sha256").update(prompt).digest("hex") });
      }
    }
  }
  return {
    sha256: crypto.createHash("sha256").update(JSON.stringify(contracts)).digest("hex"),
    checkedCombinations: contracts.length,
    bathroom: contracts.filter(entry => entry.room === "bathroom"),
  };
}
