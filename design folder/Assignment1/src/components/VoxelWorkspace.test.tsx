import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import VoxelWorkspace from './VoxelWorkspace';
jest.mock('./VoxelView', () => () => <div data-testid="voxel-view" />);
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { cleanup(); jest.useRealTimers(); });
const finishBuild = () => act(() => { jest.runAllTimers(); });
test('builds a surface, reorders CSG, switches mesh mode and resets settings', () => {
  render(<VoxelWorkspace />); finishBuild();
  expect(screen.getByRole('status', { name: 'Voxel build status' }).textContent).toContain('Surface ready');
  fireEvent.click(screen.getByRole('button', { name: /Add operation/ })); finishBuild();
  fireEvent.click(screen.getByRole('button', { name: 'Move operation 2 up' })); finishBuild();
  expect((screen.getByLabelText('Operation 1 mode') as HTMLSelectElement).value).toBe('union');
  expect((screen.getByLabelText('Operation 2 mode') as HTMLSelectElement).value).toBe('subtract');
  fireEvent.change(screen.getByLabelText('Meshing method'), { target: { value: 'blocks' } }); finishBuild();
  expect(screen.getByRole('status', { name: 'Voxel build status' }).textContent).toContain('Surface ready');
  fireEvent.click(screen.getByRole('button', { name: 'Reset voxel settings' })); finishBuild();
  expect((screen.getByLabelText('Meshing method') as HTMLSelectElement).value).toBe('marching');
  expect(screen.queryByLabelText('Operation 2 mode')).toBeNull();
});
test('a new edit cancels a pending build and torus preset clears CSG', () => {
  render(<VoxelWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Torus study' }));
  fireEvent.change(screen.getByLabelText('Volume resolution'), { target: { value: '16' } });
  finishBuild();
  expect(screen.getByRole('status', { name: 'Voxel build status' }).textContent).toContain('Surface ready');
  expect(screen.queryByLabelText('Operation 1 mode')).toBeNull();
  expect(screen.getByText('Surface / total chunks').nextElementSibling?.textContent).toBe('1 / 1');
});
