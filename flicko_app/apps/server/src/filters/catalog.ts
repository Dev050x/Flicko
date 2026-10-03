import catalog from "../../../mobile/assets/filters/filters.json";

/*
 * Prices come from the app's filter catalog (apps/mobile/assets/filters/filters.json),
 * so the app and the server can't disagree on what a premium filter costs.
 */
type CatalogFilter = { id: string; premium: boolean; priceSkr?: number };

/** Whole SKR to burn for a premium filter, or undefined if it isn't one. */
export const premiumPrice = (filterId: string) => {
  const filter = (catalog.filters as CatalogFilter[]).find(
    (f) => f.id === filterId,
  );
  return filter?.premium ? filter.priceSkr : undefined;
};
