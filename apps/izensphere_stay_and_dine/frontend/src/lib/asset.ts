// Resolve a static asset shipped in frontend/public against the build base.
// Dev: BASE_URL is "/", so asset("izensphere-dine-mark.svg") -> "/izensphere-dine-mark.svg".
// Prod: BASE_URL is "/assets/izensphere_stay_and_dine/frontend/", so the same call resolves to
// "/assets/izensphere_stay_and_dine/frontend/izensphere-dine-mark.svg" (where Frappe serves it).
export const asset = (path: string) =>
  import.meta.env.BASE_URL + path.replace(/^\//, "")
