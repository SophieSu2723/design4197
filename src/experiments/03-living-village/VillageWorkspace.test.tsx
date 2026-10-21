import { useState } from 'react';
import { act, fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import VillageWorkspace from './VillageWorkspace';
import { createWorld, advanceDay, advanceDays, actOnPlot } from './simulation';
import { inviteMina, movePopulation, settleMina } from './population';
jest.mock('./rendering/FarmView', () => () => <div>Farm placeholder</div>);
afterEach(() => { cleanup(); jest.useRealTimers(); });
test('advance 30 days exposes every daily metric and reset clears the experiment', () => {
  render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Advance 30 days' }));
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 30');
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(31);
  for (const name of ['Rain mm', 'Moisture', 'Health', 'Growth', 'Expected yield']) expect(screen.getByRole('columnheader', { name })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reset simulation' }));
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 0');
});
test('playback advances once per interval, pauses, and stops after 30 days', () => {
  jest.useFakeTimers(); render(<VillageWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Play 30 days' }));
  act(() => { jest.advanceTimersByTime(1000); });
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 2');
  fireEvent.click(screen.getByRole('button', { name: 'Pause playback' }));
  act(() => { jest.advanceTimersByTime(1000); });
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 2');
  fireEvent.click(screen.getByRole('button', { name: 'Reset simulation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Play 30 days' }));
  act(() => { jest.advanceTimersByTime(15000); });
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Paused · Day 30');
  act(() => { jest.advanceTimersByTime(1000); });
  expect(screen.getByRole('status', { name: 'Farm simulation status' }).textContent).toContain('Day 30');
});

test('population sidebar invites a real visitor and supports cancelling placement', () => {
  let world = advanceDays(createWorld(), 20);
  for (let i = 0; i < 9; i++) world = actOnPlot(world, i, 'harvest');
  world = advanceDays(world, 7);
  for (let i = 0; i < 1000; i++) world = movePopulation(world, 0.1);
  function Harness() { const [state, setState] = useState(world); return <VillageWorkspace world={state} setWorld={setState} />; }
  render(<Harness />);
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
  const panel = screen.getByLabelText('Mina behavior');
  for (const text of ['Current goal', 'Target', 'Energy', 'Social need', 'Odds ·']) expect(panel.textContent).toContain(text);
  expect(screen.getByText('Home → river (walk)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Behavior target' })).toBeTruthy();
});
