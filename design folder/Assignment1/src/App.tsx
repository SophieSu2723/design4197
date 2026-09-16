import { useState } from 'react';
import NoiseWorkspace from './components/NoiseWorkspace';
import VoxelWorkspace from './components/VoxelWorkspace';
import './components/WorkspaceTabs.css';

export default function App() {
  const [tab, setTab] = useState<'noise' | 'voxel'>('noise');
  return <div className="workspace-shell">
    <nav className="workspace-tabs" aria-label="Assignment workspaces">
      <span>FIELD / LAB <small>ASSIGNMENT 01</small></span>
      <button aria-pressed={tab === 'noise'} onClick={() => setTab('noise')}>01 / Noise field</button>
      <button aria-pressed={tab === 'voxel'} onClick={() => setTab('voxel')}>02 / Voxel terrain</button>
    </nav>
    {tab === 'noise' ? <NoiseWorkspace /> : <VoxelWorkspace />}
  </div>;
}
