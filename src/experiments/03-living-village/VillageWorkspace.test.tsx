import { useState } from 'react';
import { act, fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import VillageWorkspace from './VillageWorkspace';
import { createWorld, advanceDay, advanceDays, actOnPlot } from './simulation';
import { inviteMina, movePopulation, settleMina, hasUnfinishedRoutine } from './population';
jest.mock('./rendering/FarmView', () => ({ onSelect, onSelectResident }: { onSelect: (id: number) => void; onSelectResident: (id: 'su' | 'mina') => void }) => <>
  <button onClick={() => onSelect(0)}>Select plot 1 on map</button>
  <button onClick={() => onSelectResident('su')}>Select Su on map</button>
</>);
afterEach(() => { cleanup(); jest.useRealTimers(); });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const openDetails = (label: string) => {
  const summary = screen.getByText(label, { selector: 'summary' });
  fireEvent.click(summary);
  expect(summary.parentElement?.hasAttribute('open')).toBe(true);
};
const status = () => screen.getByRole('status', { name: 'Simulation status' }).textContent;
test('expansion, shop commissioning and storm controls preserve the current run', () => {
  render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Build' }));
  const build = screen.getByRole('button', { name: 'Commission shop' }) as HTMLButtonElement;
  expect(build.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Open eastern ridge' }));
  expect(screen.getByText('Open · 60 × 40 m valley')).toBeTruthy();
  expect(build.disabled).toBe(false);
  fireEvent.click(build);
  expect(screen.getByRole('progressbar', { name: 'Shop construction' }).getAttribute('value')).toBe('0');
  press('Climate');
  fireEvent.change(screen.getByRole('slider', { name: 'Peak storm wind (km/h)' }), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Queue one storm' }));
  expect(screen.getByRole('button', { name: 'Cancel queued storm' })).toBeTruthy();
  expect(within(screen.getByRole('main', { name: 'Living valley viewport' })).getByText('Storm queued for next day')).toBeTruthy();
  expect(status()).toContain('Day 0');
});
test('climate sliders edit the ongoing world without resetting its day or observations', () => {
  jest.useFakeTimers();
  render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Advance 1 day' }));
  press('Climate');
  fireEvent.change(screen.getByRole('slider', { name: 'Spring rain probability' }), { target: { value: '1' } });
  expect(status()).toContain('Day 1');
  act(() => { jest.advanceTimersByTime(100000); });
  fireEvent.click(screen.getByRole('button', { name: 'Advance 1 day' }));
  expect(status()).toContain('Day 2');
  expect(status()).toContain('Rain');
  press('Records');
  openDetails('Ecological cause and effect');
  expect(screen.getByText('Rain / wind', { selector: 'dt' })).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: 'Plot' })).toBeNull();
});
test('settled-life entry exposes memory process and prevents skipping unfinished walks', () => {
  render(<VillageWorkspace />);
  press('Climate');
  openDetails('New run & studies');
  press('Start settled-life study');
  openDetails('Memory & routes');
  openDetails('Mina’s place memory');
  expect(screen.getByText('0 completed arrivals')).toBeTruthy();
  expect(screen.getByText('Su’s farm')).toBeTruthy();
  press('Climate');
  openDetails('Quick ecology run');
  expect((screen.getByRole('button', { name: 'Advance 1 day' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Advance 30 days' }) as HTMLButtonElement).disabled).toBe(true);
  press('Village');
  openDetails('Memory & routes');
  openDetails('Mina’s place memory');
  const toggle = screen.getByRole('checkbox', { name: 'Let familiarity influence future choices' });
  fireEvent.click(toggle);
  expect((toggle as HTMLInputElement).checked).toBe(false);
});
test('advance 30 days exposes every daily metric and reset clears the experiment', () => {
  render(<VillageWorkspace />);
  press('Climate');
  openDetails('Quick ecology run');
  press('Advance 30 days');
  openDetails('Daily observations · Plot 5');
  expect(status()).toContain('Day 30');
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(31);
  for (const name of ['Rain mm', 'Moisture', 'Health', 'Growth', 'Expected yield']) expect(screen.getByRole('columnheader', { name })).toBeTruthy();
  press('Climate');
  openDetails('New run & studies');
  press('Reset simulation');
  expect(status()).toContain('Day 0');
});
test('playback waits for Su even without Mina, pauses, and stops after 30 completed daily advances', () => {
  jest.useFakeTimers();
  let finishWalks = () => {};
  function Harness() {
    const [world, setWorld] = useState(createWorld());
    finishWalks = () => setWorld(w => {
      let next = w;
      for (let step = 0; step < 1000 && hasUnfinishedRoutine(next.population.su); step++) next = movePopulation(next, 1);
      return next;
    });
    return <VillageWorkspace world={world} setWorld={setWorld} />;
  }
  render(<Harness />);
  press('Start Simulation');
  act(() => { jest.advanceTimersByTime(1000); });
  expect(status()).toContain('Day 1');
  press('Pause');
  act(() => { jest.advanceTimersByTime(1000); });
  expect(status()).toContain('Day 1');
  press('Resume');
  for (let day = 1; day < 30; day++) {
    act(() => { finishWalks(); });
    act(() => { jest.advanceTimersByTime(500); });
  }
  expect(status()).toContain('Paused · Day 30');
  act(() => { jest.advanceTimersByTime(1000); });
  expect(status()).toContain('Day 30');
});
test('exploration study starts a dry settled scenario and expanded/follow views preserve it', () => {
  jest.useFakeTimers(); render(<VillageWorkspace />);
  press('Climate');
  openDetails('New run & studies');
  press('Start exploration study');
  press('Climate');
  expect((screen.getByRole('slider', { name: 'Spring rain probability' }) as HTMLInputElement).value).toBe('0');
  expect(status()).toContain('Running');
  fireEvent.click(screen.getByRole('button', { name: 'Village' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Camera view' }), { target: { value: 'mina' } });
  press('Hide controls');
  expect(screen.getByRole('button', { name: 'Show controls' }).getAttribute('aria-expanded')).toBe('false');
  press('Show controls');
  fireEvent.click(screen.getByRole('button', { name: 'Climate' }));
  expect(status()).toContain('Day 0');
  press('Village');
  openDetails('Memory & routes');
  openDetails('Mina’s place memory');
  expect(screen.getByText('0 completed arrivals')).toBeTruthy();
});

test('population sidebar invites a real visitor and supports cancelling placement', () => {
  let world = advanceDays(createWorld(), 20);
  for (let i = 0; i < 9; i++) world = actOnPlot(world, i, 'harvest');
  world = advanceDays(world, 7);
  for (let i = 0; i < 1000; i++) world = movePopulation(world, 0.1);
  function Harness() { const [state, setState] = useState(world); return <VillageWorkspace world={state} setWorld={setState} />; }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Village' }));
  expect(screen.getByRole('button', { name: 'Invite Mina' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Mina is visiting' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Invite Mina' }));
  expect(screen.getByRole('button', { name: 'Cancel placement' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel placement' }));
  expect(screen.getByRole('button', { name: 'Invite Mina' })).toBeTruthy();
});

test('resident Mina exposes behavior diagnostics: goal, target, needs, odds and placement walks', () => {
  let world = advanceDays(createWorld(), 20);
  for (let i = 0; i < 9; i++) world = actOnPlot(world, i, 'harvest');
  world = advanceDays(world, 7);
  for (let i = 0; i < 1000; i++) world = movePopulation(world, 0.1);
  world = movePopulation(advanceDay(settleMina(inviteMina(world), { x: -6, z: -16 })), 0.1);
  render(<VillageWorkspace world={world} setWorld={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Village' }));
  openDetails('Population & settlement');
  expect(screen.getByText('Home → river (walk)')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Inspect resident' }), { target: { value: 'mina' } });
  const inspector = screen.getByRole('region', { name: 'Mina · baker' });
  expect(inspector.querySelector('details')?.open).toBe(false);
  openDetails('Decision details');
  expect(inspector.textContent).toContain('· chosen');
  expect(inspector.textContent).toContain('What changed the chosen activity’s weight');
  expect(inspector.textContent).toContain('Energy at choice');
});

test('selecting Su on the map opens the inspector and follows live tasks and route interruptions', () => {
  const initial = createWorld();
  const { rerender } = render(<VillageWorkspace world={initial} setWorld={() => {}} />);
  press('Hide controls');
  fireEvent.click(screen.getByRole('button', { name: 'Select Su on map' }));
  const panel = screen.getByRole('region', { name: 'Su · farmer' });
  expect(panel.textContent).toContain('Start the simulation');
  const rainy = advanceDay(initial, { kind: 'Rain', rainfallMm: 8, temperatureC: 18 });
  rerender(<VillageWorkspace world={rainy} setWorld={() => {}} />);
  expect(panel.textContent).toContain('Shelter at home from rain');
  expect(panel.textContent).toContain('daily rainfall reaches 5 mm');
  const stopped = { ...rainy, population: { ...rainy.population, su: { ...rainy.population.su, route: [], routeIssue: 'interrupted' as const } } };
  rerender(<VillageWorkspace world={stopped} setWorld={() => {}} />);
  expect(panel.textContent).toContain('no replacement route');
  fireEvent.click(within(panel).getByRole('button', { name: 'Close resident inspector' }));
  expect(screen.queryByRole('region', { name: 'Su · farmer' })).toBeNull();
});

test('clicking a farm plot selects it and watering updates that plot moisture', () => {
  render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Select plot 1 on map' }));
  expect(screen.getByRole('heading', { name: 'Farm' })).toBeTruthy();
  expect(within(screen.getByRole('navigation', { name: 'Living village sections' }))
    .queryByRole('button', { name: 'Farm' })).toBeNull();
  const moisture = screen.getByRole('progressbar', { name: 'Selected plot soil moisture' });
  expect(moisture.getAttribute('value')).toBe('0.55');
  fireEvent.click(screen.getByRole('button', { name: 'Water +10 mm' }));
  expect(screen.getByRole('progressbar', { name: 'Selected plot soil moisture' }).getAttribute('value')).toBe('0.8');
  openDetails('Crop details & rules');
  expect(screen.getByText('32.0 / 40 mm')).toBeTruthy();
  press('Back to Build');
  press('Farm harvest ↗');
  expect(screen.getByRole('heading', { name: 'Farm' })).toBeTruthy();
});
