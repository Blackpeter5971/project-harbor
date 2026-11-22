export const sectorIds = ['media', 'real-estate', 'construction', 'technology', 'transportation', 'hospitality', 'retail', 'manufacturing', 'agriculture', 'finance', 'healthcare', 'entertainment'] as const;
export type BusinessSector = typeof sectorIds[number];
export const MIN_BUSINESS_INVESTMENT = 75_000;
export type Sector = { id: BusinessSector; name: string; margin: number; volatility: number; overhead: number; revenue: number; focus: string; asset: string };
/** Baseline quarterly economics; startup overhead is paid once from company cash, not personal cash. */
export const businessSectors: Sector[] = [
  { id: 'media', name: 'Media & Publishing', margin: .22, volatility: .18, overhead: 6000, revenue: 30000, focus: 'Local news and digital publishing', asset: 'newspaper' },
  { id: 'real-estate', name: 'Real Estate', margin: .30, volatility: .15, overhead: 8000, revenue: 24000, focus: 'Rental property management', asset: 'consulting' },
  { id: 'construction', name: 'Construction', margin: .18, volatility: .25, overhead: 10000, revenue: 40000, focus: 'Residential renovation', asset: 'retail' },
  { id: 'technology', name: 'Technology & Software', margin: .35, volatility: .30, overhead: 5000, revenue: 28000, focus: 'Business software services', asset: 'consulting' },
  { id: 'transportation', name: 'Transportation & Logistics', margin: .16, volatility: .20, overhead: 12000, revenue: 42000, focus: 'Regional freight and delivery', asset: 'retail' },
  { id: 'hospitality', name: 'Restaurant & Hospitality', margin: .14, volatility: .22, overhead: 9000, revenue: 36000, focus: 'Neighborhood dining', asset: 'retail' },
  { id: 'retail', name: 'Retail & Supermarket', margin: .12, volatility: .12, overhead: 7000, revenue: 45000, focus: 'Everyday groceries and essentials', asset: 'retail' },
  { id: 'manufacturing', name: 'Manufacturing', margin: .20, volatility: .23, overhead: 14000, revenue: 38000, focus: 'Consumer goods production', asset: 'retail' },
  { id: 'agriculture', name: 'Agriculture & Farming', margin: .18, volatility: .32, overhead: 8000, revenue: 26000, focus: 'Seasonal produce', asset: 'retail' },
  { id: 'finance', name: 'Financial & Consulting', margin: .32, volatility: .20, overhead: 4000, revenue: 30000, focus: 'Financial planning and advisory', asset: 'consulting' },
  { id: 'healthcare', name: 'Healthcare', margin: .24, volatility: .12, overhead: 15000, revenue: 34000, focus: 'Community health services', asset: 'consulting' },
  { id: 'entertainment', name: 'Entertainment', margin: .28, volatility: .35, overhead: 6000, revenue: 28000, focus: 'Live events and production', asset: 'radio' },
];
export const sectorById = (id: string | undefined) => businessSectors.find(s => s.id === id);
export function legacySector(catalogId: string, category: string): BusinessSector {
  if (category === 'media' || ['newspaper', 'radio', 'regional-media'].includes(catalogId)) return 'media';
  return catalogId === 'consulting' ? 'finance' : 'retail';
}