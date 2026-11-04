// Shared world landmarks: positions describe the terrain, discovery belongs to each resident.
export const easternPlaces = [
  { id: 'clearing' as const, extension: false, name: 'Fern clearing', position: { x: 12.5, z: 15.5 }, color: '#c2d29d', description: 'A quiet clearing above the eastern bank.' },
  { id: 'ruins' as const, extension: false, name: 'Old stone garden', position: { x: 15.5, z: -4.5 }, color: '#ddbc91', description: 'Low stone remains on the drier eastern slope.' },
  { id: 'ridge' as const, extension: true, name: 'Meadow ridge', position: { x: 29, z: 14 }, color: '#d6cc8c', description: 'An exposed meadow in the new eastern land.' },
  { id: 'lookout' as const, extension: true, name: 'Wind lookout', position: { x: 34, z: -6 }, color: '#a9cbd1', description: 'A high clearing where wind leaves stronger traces.' },
];
export type EasternPlace = typeof easternPlaces[number]['id'];
export const placeNames = { home: 'Home', bakery: 'Bakery', farm: 'Su’s farm', river: 'River bank', path: 'Village path', clearing: 'Fern clearing', ruins: 'Old stone garden', ridge: 'Meadow ridge', lookout: 'Wind lookout', shop: 'Community shop', bridge: 'Bridge repair site' };
export const isMemoryPlace = (target: string | undefined): target is 'farm' | 'river' | 'path' | 'shop' | EasternPlace =>
  target === 'farm' || target === 'river' || target === 'path' || target === 'shop' || isEasternPlace(target);
export const isEasternPlace = (target: string | undefined): target is EasternPlace => easternPlaces.some(p => p.id === target);
