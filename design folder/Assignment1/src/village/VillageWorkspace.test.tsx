import { act, fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import VillageWorkspace from './VillageWorkspace';
jest.mock('./FarmView', () => () => <div>Farm placeholder</div>);
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
