export const applyUpdater = (updater, current) =>
  typeof updater === 'function' ? updater(current) : updater;
