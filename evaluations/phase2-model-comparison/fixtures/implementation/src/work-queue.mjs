import { isQueueVisible } from "./eligibility.mjs";
import { normalizeWorkItem } from "./normalize-work-item.mjs";

export function buildWorkQueue(workItems, { limit = Infinity } = {}) {
  const normalized = workItems.map(normalizeWorkItem);
  return {
    total: normalized.length,
    items: normalized.filter(isQueueVisible).slice(0, limit),
  };
}
