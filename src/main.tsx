import { createRoot } from 'react-dom/client';
import { useCallback, useState } from 'react';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles.css';
import { native } from './core/persistence';
import { allCommands } from './core/registry';
import { registerCoreBlocks } from './blocks';
import './core/api';
import { Canvas } from './canvas/Canvas';
import { Atlas, TopBar, Dock, Palette, registerCoreCommands, useKeyboard } from './ui/Shell';
import { ContextMenuHost } from './ui/ContextMenu';
import { TitleBar } from './ui/TitleBar';

try { const t = localStorage.getItem('tessera.theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
registerCoreBlocks();
let openPaletteRef = () => {};
registerCoreCommands(() => openPaletteRef());
// desktop: native menu items run the same registered commands as the palette
native?.onCommand(id => allCommands().find(c => c.id === id)?.run());
if (native) document.documentElement.dataset.platform = native.platform;

function App() {
  const [palette, setPalette] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('tessera.atlas') === '0'; } catch { return false; } });
  const open = useCallback(() => setPalette(true), []);
  openPaletteRef = open;
  useKeyboard(open);
  return <div className={'shell' + (native ? ' desktop' : '')}>
    {native && <TitleBar />}
    <div className="app">
    <Atlas collapsed={collapsed} onToggle={() => { setCollapsed(!collapsed); try { localStorage.setItem('tessera.atlas', collapsed ? '1' : '0'); } catch {} }} />
    <main className="stage"><TopBar openPalette={open} /><Canvas /><Dock /></main>
    </div>
    {palette && <Palette onClose={() => setPalette(false)} />}
    <ContextMenuHost />
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
