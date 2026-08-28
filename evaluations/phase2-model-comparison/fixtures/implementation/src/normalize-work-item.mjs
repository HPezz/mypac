export function normalizeWorkItem(item) {
  return {
    id: String(item.id),
    title: String(item.title),
    status: item.status ?? "open",
    dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.map(String) : [],
  };
}
