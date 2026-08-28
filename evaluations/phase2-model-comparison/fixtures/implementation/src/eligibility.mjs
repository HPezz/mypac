export function isQueueVisible(item) {
  return item.status !== "done" && item.status !== "archived";
}
