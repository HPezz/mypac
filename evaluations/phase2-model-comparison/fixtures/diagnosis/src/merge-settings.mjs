function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeRecords(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    if (isRecord(result[key]) && isRecord(value)) {
      result[key] = Object.assign(result[key], value);
    } else if (Array.isArray(value)) {
      result[key] = [...value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function mergeSettings(...layers) {
  return layers.reduce((settings, layer) => mergeRecords(settings, layer), {});
}
