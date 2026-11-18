import { useState } from 'react';
import { act, fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import VillageWorkspace from './VillageWorkspace';
import { createWorld, advanceDay, advanceDays, actOnPlot } from './simulation';
import { inviteMina, movePopulation, settleMina, hasUnfinishedRoutine } from './population';
jest.mock('./rendering/FarmView', () => ({ onSelect }: { onSelect: (id: number) => void }) => <button onClick={() => onSelect(0)}>Select plot 1 on map</button>);
afterEach(() => { cleanup(); jest.useRealTimers(); });
test('expansion, shop commissioning and storm controls preserve the current run', () => {
  render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Build' }));
  const build = screen.getByRole('button', { name: 'Commission shop' }) as HTMLButtonElement;
  expect(build.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Open eastern ridge' }));
  expect(screen.getByText('60 × 40 m · connected valley')).toBeTruthy();
  expect(build.disabled).toBe(false);
  fireEvent.click(build);
  expect(screen.getByRole('progressbar', { name: 'Shop construction' }).getAttribute('value')).toBe('0');
  fireEvent.change(screen.getByRole('slider', { name: 'Peak storm wind (km/h)' }), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Queue one storm' }));
  expect(screen.getByRole('button', { name: 'Cancel queued storm' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Climate' }));
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 0');
});
test('climate sliders edit the ongoing world without resetting its day or observations', () => {
  jest.useFakeTimers();
  render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Advance 1 day' }));
  fireEvent.change(screen.getByRole('slider', { name: 'Spring rain probability' }), { target: { value: '1' } });
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 1');
  act(() => { jest.advanceTimersByTime(100000); });
  fireEvent.click(screen.getByRole('button', { name: 'Advance 1 day' }));
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 2');
  expect(screen.getByRole('region', { name: 'Ecological cause and effect' }).textContent).toContain('Rain');
  expect(screen.queryByRole('combobox', { name: 'Plot' })).toBeNull();
});
test('settled-life entry exposes memory process and prevents skipping unfinished walks', () => {
  render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Village' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start settled-life study' }));
  expect(screen.getByText('0 completed arrivals')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Su’s farm familiarity' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Climate' }));
  expect((screen.getByRole('button', { name: 'Advance 1 day' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Advance 30 days' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Village' }));
  const toggle = screen.getByRole('checkbox', { name: 'Let familiarity influence future choices' });
  fireEvent.click(toggle);
  expect(screen.getByText('Memory influence paused')).toBeTruthy();
});
test('advance 30 days exposes every daily metric and reset clears the experiment', () => {
  render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Advance 30 days' }));
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 30');
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(31);
  for (const name of ['Rain mm', 'Moisture', 'Health', 'Growth', 'Expected yield']) expect(screen.getByRole('columnheader', { name })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reset simulation' }));
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 0');
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
  fireEvent.click(screen.getByRole('button', { name: 'Play 30 days' }));
  act(() => { jest.advanceTimersByTime(1000); });
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 1');
  fireEvent.click(screen.getByRole('button', { name: 'Pause playback' }));
  act(() => { jest.advanceTimersByTime(1000); });
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 1');
  fireEvent.click(screen.getByRole('button', { name: 'Reset simulation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Play 30 days' }));
  for (let day = 0; day < 30; day++) {
    act(() => { finishWalks(); });
    act(() => { jest.advanceTimersByTime(500); });
  }
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Paused · Day 30');
  act(() => { jest.advanceTimersByTime(1000); });
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 30');
});
test('exploration study starts a dry settled scenario and expanded/follow views preserve it', () => {
  jest.useFakeTimers(); render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Village' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start exploration study' }));
  fireEvent.click(screen.getByRole('button', { name: 'Climate' }));
  expect((screen.getByRole('slider', { name: 'Spring rain probability' }) as HTMLInputElement).value).toBe('0');
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Running');
  fireEvent.click(screen.getByRole('button', { name: 'Village' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Camera view' }), { target: { value: 'mina' } });
  fireEvent.click(screen.getByRole('button', { name: 'Expand world' }));
  expect(screen.getByRole('button', { name: 'Show sidebar' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Climate' }));
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 0');
  fireEvent.click(screen.getByRole('button', { name: 'Village' }));
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
  expect(screen.getByRole('button', { name: 'INVITE TO STAY' })).toBeTruthy();
  expect(screen.getByRole('status', { name: 'Visitor status' }).textContent).toContain('Mina');
  fireEvent.click(screen.getByRole('button', { name: 'INVITE TO STAY' }));
  expect(screen.getByRole('button', { name: 'Cancel placement' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel placement' }));
  expect(screen.getByRole('button', { name: 'INVITE TO STAY' })).toBeTruthy();
});

test('resident Mina exposes behavior diagnostics: goal, target, needs, odds and placement walks', () => {
  let world = advanceDays(createWorld(), 20);
  for (let i = 0; i < 9; i++) world = actOnPlot(world, i, 'harvest');
  world = advanceDays(world, 7);
  for (let i = 0; i < 1000; i++) world = movePopulation(world, 0.1);
  world = movePopulation(advanceDay(settleMina(inviteMina(world), { x: -6, z: -16 })), 0.1);
  render(<VillageWorkspace world={world} setWorld={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Village' }));
  const panel = screen.getByLabelText('Mina behavior');
  for (const text of ['Current goal', 'Target', 'Energy', 'Social need', 'Odds ·']) expect(panel.textContent).toContain(text);
  expect(screen.getByText('Home → river (walk)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Behavior target' })).toBeTruthy();
});

test('clicking a farm plot selects it and watering updates that plot moisture', () => {
  render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Select plot 1 on map' }));
  expect(screen.getByRole('button', { name: 'Farm' }).getAttribute('aria-pressed')).toBe('true');
  const moisture = screen.getByRole('progressbar', { name: 'Selected plot soil moisture' });
  expect(moisture.getAttribute('value')).toBe('0.55');
  fireEvent.click(screen.getByRole('button', { name: 'Water +10 mm' }));
  expect(screen.getByRole('progressbar', { name: 'Selected plot soil moisture' }).getAttribute('value')).toBe('0.8');
  expect(screen.getByText('32.0 / 40 mm')).toBeTruthy();
});
