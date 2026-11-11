import { useEffect } from 'react';
import { play } from '../audio/sound';
import { speak } from '../audio/speech';
import { Abot } from '../components/Abot';
import { MenuPreview } from '../components/MenuPreviews';
import { useFootControls } from '../input/controls';
import { GAME_IDS, GAME_META } from './gameIds';
import { enabledList, useApp } from './store';

export function MainMenu() {
  const idx = useApp((s) => s.kiosk.menuIndex);
  const settings = useApp((s) => s.settings);
  const dispatch = useApp((s) => s.dispatch);
  const enabled = enabledList(settings);
  const anyEnabled = enabled.some(Boolean);

  // 선택된 게임이 꺼져 있으면 첫 활성 게임으로
  useEffect(() => {
    if (anyEnabled && !enabled[idx]) dispatch({ type: 'menuNext', enabled });
  }, [anyEnabled, enabled.join(), idx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = GAME_META[GAME_IDS[idx]];
    if (!enabled[idx]) return;
    const t = setTimeout(() => speak(`${m.speakName}. ${m.tagline}`), 120);
    return () => clearTimeout(t);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => useApp.getState().setSubtitle(''), []);

  useFootControls(
    {
      label: '다음 연구소',
      disabled: !anyEnabled,
      run: () => {
        play('move');
        dispatch({ type: 'menuNext', enabled });
      },
    },
    {
      label: '체험 시작',
      disabled: !anyEnabled,
      run: () => {
        play('select');
        play('transition');
        dispatch({ type: 'menuSelect', enabled });
      },
    },
  );

  return (
    <div className="menu screen-enter">
      <header className="menu-header">
        <div className="menu-logo">
          <span className="logo-ai">AI</span> FUTURE LAB
        </div>
        <div className="menu-sub">AI 미래체험 연구소</div>
      </header>
      <div className="menu-body">
        <div className="menu-guide">
          <Abot costume="guide" mood="happy" size={220} talking />
          <div className="bubble">
            안녕! 나는 <b>에이봇</b>이야.
            <br />
            <b className="t-o">O 발판</b>으로 연구소를 고르고
            <br />
            <b className="t-x">X 발판</b>을 밟으면 출발!
          </div>
        </div>
        <div className="menu-grid">
          {GAME_IDS.map((id, i) => {
            const m = GAME_META[id];
            const on = enabled[i];
            const sel = i === idx && on;
            return (
              <div key={id} className={`card ${sel ? 'card-sel' : ''} ${on ? '' : 'card-off'}`} style={{ ['--accent' as string]: m.color }}>
                <div className="card-num">{i + 1}</div>
                <div className="card-preview">
                  <MenuPreview id={id} active={sel} />
                </div>
                <div className="card-info">
                  <div className="card-bot">
                    <Abot costume={m.costume} size={92} mood={sel ? 'happy' : 'think'} />
                  </div>
                  <div>
                    <div className="card-name">{m.name}</div>
                    <div className="card-tech">핵심 기술 · {m.tech}</div>
                    <div className="card-time">⏱ 약 {settings.games[id].minutes}분</div>
                  </div>
                </div>
                {!on && <div className="card-closed">점검 중</div>}
              </div>
            );
          })}
        </div>
      </div>
      {!anyEnabled && <div className="notice notice-low">지금은 모든 연구소가 점검 중이에요</div>}
    </div>
  );
}
