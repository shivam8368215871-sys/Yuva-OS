export const apps = new Map();
export function registerApp(def) { apps.set(def.id, def); }
