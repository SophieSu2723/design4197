import React from 'react';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import NoiseWorkspace from './NoiseWorkspace';

// Exercise the UI and actual terrain simulation without requiring a GPU in jsdom.
jest.mock('three', () => ({ WebGLRenderer: class { constructor() { throw new Error('No GPU in test'); } } }));
jest.mock('three/examples/jsm/controls/OrbitControls', () => ({ OrbitControls: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: jest.fn(),
  } as unknown as CanvasRenderingContext2D));
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('start advances the simulation, stop freezes it, and reset clears it', () => {
  render(<NoiseWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: /Start simulation/ }));
  act(() => { jest.advanceTimersByTime(300); });
  expect(screen.getByRole('status', { name: 'Simulation status' }).textContent).toContain('24 steps');
  fireEvent.click(screen.getByRole('button', { name: /Stop simulation/ }));
  act(() => { jest.advanceTimersByTime(500); });
  expect(screen.getByRole('status', { name: 'Simulation status' }).textContent).toContain('Stopped · 24 steps');
  fireEvent.click(screen.getByRole('button', { name: 'Reset terrain' }));
  expect(screen.getByRole('status', { name: 'Simulation status' }).textContent).toContain('0 steps');
});
test('keyboard shortcuts toggle wireframe and simulation; navigation resets the terrain', () => {
  render(<NoiseWorkspace />);
  const wireframe = screen.getByRole('button', { name: /Wireframe/ });
  expect(wireframe.getAttribute('aria-pressed')).toBe('false');
  fireEvent.keyDown(window, { key: 'f' });
  expect(wireframe.getAttribute('aria-pressed')).toBe('true');
  fireEvent.keyDown(window, { key: ' ' });
  act(() => { jest.advanceTimersByTime(100); });
  expect(screen.getByRole('status', { name: 'Simulation status' }).textContent).toContain('Running · 8 steps');
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(screen.getByText(/World origin:/).textContent).toContain('X 1.50');
  expect(screen.getByRole('status', { name: 'Simulation status' }).textContent).toContain('Stopped · 0 steps');
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(screen.getByText(/World origin:/).textContent).toContain('X 0.00');
});
test('editing grid settings stops erosion and shortcuts leave form controls alone', () => {
  render(<NoiseWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: /Start simulation/ }));
  act(() => { jest.advanceTimersByTime(100); });
  const resolution = screen.getByRole('slider', { name: /Grid resolution/ });
  fireEvent.change(resolution, { target: { value: '96' } });
  expect(screen.getByRole('status', { name: 'Simulation status' }).textContent).toContain('Stopped · 0 steps');
  fireEvent.keyDown(resolution, { key: 'f' });
  expect(screen.getByRole('button', { name: /Wireframe/ }).getAttribute('aria-pressed')).toBe('false');
});

test('default simulation produces measurable change and supports original/result comparison', () => {
  render(<NoiseWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: /Start simulation/ }));
  act(() => { jest.advanceTimersByTime(1000); });
  expect(screen.getByRole('status', { name: 'Simulation status' }).textContent).toContain('80 steps');
  expect(screen.getByLabelText('Terrain change').textContent).not.toContain('max 0.000');
  fireEvent.click(screen.getByRole('button', { name: 'Compare: show original' }));
  expect(screen.getByLabelText('Terrain change').textContent).toBe('Viewing original terrain.');
  expect(screen.getByRole('status', { name: 'Simulation status' }).textContent).toContain('Stopped');
  fireEvent.click(screen.getByRole('button', { name: 'Show simulated result' }));
  expect(screen.getByLabelText('Terrain change').textContent).toContain('Height change');
});
