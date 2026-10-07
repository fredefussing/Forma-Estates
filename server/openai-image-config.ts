type ImageEnvironment = {
  [key: string]: string | undefined;
  ASTRA_API_KEY?: string;
  OPENAI_ROOM_FLOW_ENABLED?: string;
  OPENAI_IMAGE_TEST_ENABLED?: string;
};

/** The approved image credential must never fall back to a different OpenAI account. */
export function getOpenAIImageApiKey(env: ImageEnvironment = process.env): string | undefined {
  return env.ASTRA_API_KEY?.trim() || undefined;
}

/** Only non-sensitive operational metadata may be returned to authenticated clients. */
export function getOpenAIImageAvailability(isAdmin: boolean, env: ImageEnvironment = process.env) {
  const configured = !!getOpenAIImageApiKey(env);
  const rolloutEnabled = env.OPENAI_ROOM_FLOW_ENABLED !== "0";
  const enabled = isAdmin && env.OPENAI_IMAGE_TEST_ENABLED === "1" && configured;
  const roomFlowAvailable = configured && (rolloutEnabled || enabled);
  return {
    enabled,
    roomFlowAvailable,
    credentialSource: configured ? "ASTRA_API_KEY" : null,
    availabilityReason: roomFlowAvailable ? "available" : !configured ? "missing_api_key" : "paused",
  } as const;
}
