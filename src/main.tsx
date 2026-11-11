import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { addLog } from './storage/db';
import './styles.css';
import './games/games.css';

window.addEventListener('error', (e) => void addLog('error', `${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => void addLog('error', `Promise: ${String(e.reason?.stack ?? e.reason)}`));
// 키오스크: 우클릭 메뉴, 드래그 막기
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('dragstart', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(<App />);
