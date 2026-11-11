import { useEffect, useRef, useState } from 'react';
import { GAME_IDS, GAME_META } from '../app/gameIds';
import { useApp, enabledList } from '../app/store';
import { play } from '../audio/sound';
import { speak, speechStatus } from '../audio/speech';
import { PedalAdapter } from '../input/PedalAdapter';
import { peekInputRuntime } from '../input/runtime';
import { DEFAULT_KEYMAP, type DiagEvent, type Pedal } from '../input/types';
import { addLog, clearStore, deleteData, listLogs, listSessions, type LogRecord, type SessionRecord } from '../storage/db';
import { checkPassword, defaultSettings, GRADE_LABEL, sha256, type Grade, type Quality, type Settings } from './settings';

type Tab = 'games' | 'pedal' | 'display' | 'data' | 'system';

export function AdminPanel() {
  const [authed, setAuthed] = useState(false);
  const close = () => useApp.getState().setAdminOpen(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <div className="admin-backdrop">{authed ? <Panel onClose={close} /> : <Login onOk={() => setAuthed(true)} onCancel={close} />}</div>;
}

let failCount = 0;
let lockUntil = 0;

function Login({ onOk, onCancel }: { onOk: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const settings = useApp((s) => s.settings);
  const submit = async () => {
    if (Date.now() < lockUntil) return setMsg(`잠시 후 다시 시도하세요 (${Math.ceil((lockUntil - Date.now()) / 1000)}초)`);
    if (await checkPassword(settings, pw)) {
      failCount = 0;
      void addLog('info', '관리자 로그인');
      onOk();
    } else {
      failCount++;
      setPw('');
      if (failCount >= 5) {
        lockUntil = Date.now() + 60_000;
        failCount = 0;
        void addLog('warn', '관리자 비밀번호 5회 실패 - 60초 잠금');
        setMsg('5회 틀려서 60초 동안 잠깁니다');
      } else setMsg(`비밀번호가 틀렸습니다 (${failCount}/5)`);
    }
  };
  return (
    <div className="admin-login">
      <h2>관리자 로그인</h2>
      <input
        type="password"
        autoFocus
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        placeholder="비밀번호"
      />
      <div className="admin-row">
        <button onClick={() => void submit()}>확인</button>
        <button className="ghost" onClick={onCancel}>
          닫기 (Esc)
        </button>
      </div>
      <div className="admin-msg">{msg}</div>
    </div>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('games');
  const tabs: [Tab, string][] = [
    ['games', '게임 · 시간'],
    ['pedal', '발판 · 진단'],
    ['display', '화면 · 소리'],
    ['data', '통계 · 데이터'],
    ['system', '시스템'],
  ];
  return (
    <div className="admin">
      <div className="admin-top">
        <h2>AI FUTURE LAB 관리자</h2>
        <div className="admin-tabs">
          {tabs.map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        <button className="ghost" onClick={onClose}>
          닫기 (Esc)
        </button>
      </div>
      <div className="admin-body">
        {tab === 'games' && <GamesTab />}
        {tab === 'pedal' && <PedalTab />}
        {tab === 'display' && <DisplayTab />}
        {tab === 'data' && <DataTab />}
        {tab === 'system' && <SystemTab />}
      </div>
    </div>
  );
}

function useSettings(): [Settings, (fn: (s: Settings) => Settings) => void] {
  return [useApp((s) => s.settings), useApp((s) => s.updateSettings)];
}

function Num({ value, min, max, step = 1, onChange, unit }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <span className="num">
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} />
      {unit}
    </span>
  );
}

function GamesTab() {
  const [s, up] = useSettings();
  return (
    <div className="admin-grid">
      <section>
        <h3>게임 활성화 · 체험 시간</h3>
        <table>
          <tbody>
            {GAME_IDS.map((id) => (
              <tr key={id}>
                <td>
                  <label>
                    <input
                      type="checkbox"
                      checked={s.games[id].enabled}
                      onChange={(e) => up((p) => ({ ...p, games: { ...p.games, [id]: { ...p.games[id], enabled: e.target.checked } } }))}
                    />{' '}
                    {GAME_META[id].name}
                  </label>
                </td>
                <td>
                  <Num value={s.games[id].minutes} min={2} max={20} unit="분" onChange={(v) => up((p) => ({ ...p, games: { ...p.games, [id]: { ...p.games[id], minutes: v } } }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3>학년별 난이도</h3>
        <select value={s.grade} onChange={(e) => up((p) => ({ ...p, grade: e.target.value as Grade }))}>
          {(Object.keys(GRADE_LABEL) as Grade[]).map((g) => (
            <option key={g} value={g}>
              {GRADE_LABEL[g]}
            </option>
          ))}
        </select>
        <p className="hint">데이터 개수, 미로 크기, 사례 수, 증거 조사 횟수가 바뀝니다.</p>
        <h3>자동 복귀</h3>
        <div className="kv">
          결과 화면 표시 <Num value={s.resultSeconds} min={5} max={60} unit="초" onChange={(v) => up((p) => ({ ...p, resultSeconds: v }))} />
        </div>
        <div className="kv">
          무입력 안내 반복 <Num value={s.idleWarnSeconds} min={5} max={120} unit="초" onChange={(v) => up((p) => ({ ...p, idleWarnSeconds: v }))} />
        </div>
        <div className="kv">
          무입력 시 메인 복귀 <Num value={s.idleReturnSeconds} min={20} max={600} unit="초" onChange={(v) => up((p) => ({ ...p, idleReturnSeconds: v }))} />
        </div>
      </section>
    </div>
  );
}

const REASON_KO: Record<string, string> = { held: '길게 밟음', debounce: '떨림 무시', locked: '잠금 중', simultaneous: '동시 입력', disabled: '입력 꺼짐' };

function PedalTab() {
  const [s, up] = useSettings();
  const [log, setLog] = useState<DiagEvent[]>([]);
  const [capture, setCapture] = useState<Pedal | null>(null);
  const [down, setDown] = useState({ O: false, X: false });
  const [pads, setPads] = useState(PedalAdapter.status());
  const [pressed, setPressed] = useState<{ pad: number; button: number }[]>([]);
  const [counts, setCounts] = useState({ O: 0, X: 0 });
  const rt = peekInputRuntime();

  // 진단 중에는 발판 입력을 관리자 화면에서 받아 표시만 합니다.
  useEffect(() => {
    if (!rt) return;
    rt.keyboard.suspended = false;
    rt.gamepad.suspended = false;
    rt.input.enabled = true;
    const offDiag = rt.input.onDiag((d) => setLog((l) => [d, ...l].slice(0, 40)));
    const offPress = rt.input.subscribe((e) => {
      setCounts((c) => ({ ...c, [e.pedal]: c[e.pedal] + 1 }));
      play(e.pedal === 'O' ? 'move' : 'select');
    });
    const i = setInterval(() => {
      setDown({ O: rt.input.isDown('O'), X: rt.input.isDown('X') });
      setPads(PedalAdapter.status());
      setPressed(PedalAdapter.pressedButtons());
    }, 100);
    return () => {
      offDiag();
      offPress();
      clearInterval(i);
      rt.keyboard.suspended = true;
      rt.gamepad.suspended = true;
      rt.input.enabled = false;
    };
  }, [rt]);

  useEffect(() => {
    if (!rt || !capture) return;
    rt.keyboard.captureHandler = (code) => {
      if (code === 'Escape') {
        setCapture(null);
        rt.keyboard.captureHandler = null;
        return;
      }
      up((p) => {
        const other: Pedal = capture === 'O' ? 'X' : 'O';
        const km = { ...p.keymap, [capture]: [...new Set([...p.keymap[capture], code])], [other]: p.keymap[other].filter((c) => c !== code) };
        return { ...p, keymap: km };
      });
      void addLog('info', `발판 키 지정: ${capture} ← ${code}`);
      setCapture(null);
      rt.keyboard.captureHandler = null;
    };
    return () => {
      if (rt) rt.keyboard.captureHandler = null;
    };
  }, [capture, rt, up]);

  return (
    <div className="admin-grid">
      <section>
        <h3>발판 입력 테스트</h3>
        <div className="diag-pads">
          <div className={`diag-pad o ${down.O ? 'down' : ''}`}>
            O<small>수락 {counts.O}회</small>
          </div>
          <div className={`diag-pad x ${down.X ? 'down' : ''}`}>
            X<small>수락 {counts.X}회</small>
          </div>
        </div>
        <p className="hint">발판을 밟으면 불이 켜집니다. 아래 기록에서 수락/무시 이유를 확인하세요.</p>
        <div className="diag-log">
          {log.map((d, i) => (
            <div key={i} className={d.accepted ? 'ok' : 'no'}>
              {d.pedal} {d.kind === 'down' ? '밟음' : '뗌'} · {d.source} · {d.accepted ? '수락' : `무시(${REASON_KO[d.reason ?? ''] ?? d.reason})`}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>키 매핑 (키보드형 USB 발판)</h3>
        {(['O', 'X'] as Pedal[]).map((p) => (
          <div className="kv" key={p}>
            <b className={p === 'O' ? 't-o' : 't-x'}>{p} 발판</b>
            <code>{s.keymap[p].join(', ') || '(없음)'}</code>
            <button onClick={() => setCapture(p)}>{capture === p ? '키를 누르세요… (Esc 취소)' : '키 추가'}</button>
            <button className="ghost" onClick={() => up((q) => ({ ...q, keymap: { ...q.keymap, [p]: [] } }))}>
              비우기
            </button>
          </div>
        ))}
        <button className="ghost" onClick={() => up((q) => ({ ...q, keymap: { O: [...DEFAULT_KEYMAP.O], X: [...DEFAULT_KEYMAP.X] } }))}>
          기본값 (O: A/←, X: D/→)
        </button>
        <p className="hint">발판을 밟아서 키를 지정할 수도 있습니다. "키 추가"를 누른 뒤 발판을 밟으세요.</p>
        <h3>입력 타이밍</h3>
        <div className="kv">
          디바운스(떨림 무시) <Num value={s.timing.debounceMs} min={0} max={500} step={10} unit="ms" onChange={(v) => up((p) => ({ ...p, timing: { ...p.timing, debounceMs: v } }))} />
        </div>
        <div className="kv">
          입력 후 잠금 <Num value={s.timing.lockMs} min={0} max={1500} step={10} unit="ms" onChange={(v) => up((p) => ({ ...p, timing: { ...p.timing, lockMs: v } }))} />
        </div>
        <div className="kv">
          동시 입력 판정 <Num value={s.timing.simulWindowMs} min={0} max={300} step={10} unit="ms" onChange={(v) => up((p) => ({ ...p, timing: { ...p.timing, simulWindowMs: v } }))} />
        </div>
      </section>
      <section>
        <h3>장치 연결 상태</h3>
        <p className="hint">{pads.keyboardNote}</p>
        <div>Gamepad API: {pads.gamepadSupported ? '지원' : '미지원'}</div>
        {pads.gamepads.length === 0 ? (
          <div className="warn-text">연결된 게임패드형 장치 없음</div>
        ) : (
          pads.gamepads.map((g) => (
            <div key={g.index}>
              #{g.index} {g.id} (버튼 {g.buttons}개)
            </div>
          ))
        )}
        <label className="kv">
          <input type="checkbox" checked={s.gamepad.enabled} onChange={(e) => up((p) => ({ ...p, gamepad: { ...p.gamepad, enabled: e.target.checked } }))} />
          게임패드형 발판 사용
        </label>
        <div className="kv">
          O 버튼 번호 <Num value={s.gamepad.O} min={0} max={31} onChange={(v) => up((p) => ({ ...p, gamepad: { ...p.gamepad, O: v } }))} />
        </div>
        <div className="kv">
          X 버튼 번호 <Num value={s.gamepad.X} min={0} max={31} onChange={(v) => up((p) => ({ ...p, gamepad: { ...p.gamepad, X: v } }))} />
        </div>
        <div>지금 눌린 버튼: {pressed.length ? pressed.map((p) => `#${p.pad}-${p.button}`).join(', ') : '없음'}</div>
        <p className="hint">발판 제조사 전용 프로토콜(시리얼, 전용 드라이버)은 확인되지 않아 지원하지 않습니다.</p>
      </section>
    </div>
  );
}

function DisplayTab() {
  const [s, up] = useSettings();
  const sp = speechStatus();
  return (
    <div className="admin-grid">
      <section>
        <h3>그래픽 · 디스플레이</h3>
        <div className="kv">
          그래픽 품질
          <select value={s.quality} onChange={(e) => up((p) => ({ ...p, quality: e.target.value as Quality }))}>
            <option value="auto">자동 (FPS에 맞춰 조절)</option>
            <option value="high">높음</option>
            <option value="medium">보통</option>
            <option value="low">낮음 (저사양 PC)</option>
          </select>
        </div>
        <div className="kv">
          화면 맞춤
          <select value={s.fit} onChange={(e) => up((p) => ({ ...p, fit: e.target.value as Settings['fit'] }))}>
            <option value="contain">비율 유지 (여백 가능)</option>
            <option value="cover">화면 꽉 채우기 (늘림)</option>
          </select>
        </div>
        <label className="kv">
          <input type="checkbox" checked={s.showFps} onChange={(e) => up((p) => ({ ...p, showFps: e.target.checked }))} /> FPS 표시
        </label>
        <label className="kv">
          <input type="checkbox" checked={s.kioskFullscreen} onChange={(e) => up((p) => ({ ...p, kioskFullscreen: e.target.checked }))} /> 전체 화면 키오스크 모드
        </label>
        <p className="hint">기준 해상도 1920×1080. 현재 창 {window.innerWidth}×{window.innerHeight}, 배율 {window.devicePixelRatio}</p>
      </section>
      <section>
        <h3>소리</h3>
        <div className="kv">
          음량 <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => up((p) => ({ ...p, volume: Number(e.target.value) }))} /> {Math.round(s.volume * 100)}%
        </div>
        <label className="kv">
          <input type="checkbox" checked={s.sfx} onChange={(e) => up((p) => ({ ...p, sfx: e.target.checked }))} /> 효과음
        </label>
        <button onClick={() => play('success')}>효과음 테스트</button>
        <h3>음성 안내</h3>
        <label className="kv">
          <input type="checkbox" checked={s.voice} onChange={(e) => up((p) => ({ ...p, voice: e.target.checked }))} /> 한국어 음성 안내
        </label>
        <div className="kv">
          말하기 속도 <input type="range" min={0.7} max={1.4} step={0.05} value={s.voiceRate} onChange={(e) => up((p) => ({ ...p, voiceRate: Number(e.target.value) }))} /> {s.voiceRate.toFixed(2)}
        </div>
        <div className={sp.voiceName ? '' : 'warn-text'}>
          {sp.supported ? (sp.voiceName ? `사용 음성: ${sp.voiceName} (오프라인)` : '설치된 한국어 오프라인 음성이 없습니다 → 자막만 표시') : '음성 합성 미지원'}
        </div>
        <button onClick={() => speak('안녕하세요. 에이아이 미래체험 연구소입니다.')}>음성 테스트</button>
        <p className="hint">Windows 설정 › 시간 및 언어 › 음성 › 음성 추가에서 "한국어"를 설치하면 사용할 수 있습니다.</p>
      </section>
    </div>
  );
}

function DataTab() {
  const [s, up] = useSettings();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [msg, setMsg] = useState('');
  const [pw1, setPw1] = useState('');
  const reload = () => {
    void listSessions().then(setSessions);
    void listLogs().then((l) => setLogs(l.reverse()));
  };
  useEffect(reload, []);
  const done = (m: string) => {
    setMsg(m);
    reload();
  };
  const today = new Date().toDateString();
  return (
    <div className="admin-grid">
      <section>
        <h3>이용 통계 (개인정보 없음)</h3>
        <table>
          <thead>
            <tr>
              <th>게임</th>
              <th>전체</th>
              <th>오늘</th>
              <th>완료율</th>
              <th>평균 시간</th>
            </tr>
          </thead>
          <tbody>
            {GAME_IDS.map((id) => {
              const r = sessions.filter((x) => x.game === id);
              const t = r.filter((x) => new Date(x.startedAt).toDateString() === today);
              const comp = r.length ? Math.round((r.filter((x) => x.completed).length / r.length) * 100) : 0;
              const avg = r.length ? Math.round(r.reduce((a, x) => a + x.durationSec, 0) / r.length) : 0;
              return (
                <tr key={id}>
                  <td>{GAME_META[id].name}</td>
                  <td>{r.length}</td>
                  <td>{t.length}</td>
                  <td>{comp}%</td>
                  <td>
                    {Math.floor(avg / 60)}분 {avg % 60}초
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="admin-row">
          <button className="danger" onClick={() => confirm('이용 통계를 모두 지울까요?') && void clearStore('sessions').then(() => done('통계를 초기화했습니다'))}>
            통계 초기화
          </button>
        </div>
        <h3>초기화</h3>
        <div className="admin-row">
          <button
            className="danger"
            onClick={() =>
              confirm('학습 모델과 누적 학습 데이터를 지울까요?') &&
              void Promise.all([deleteData('driving.accumulated')]).then(() => done('학습 모델·누적 데이터를 초기화했습니다'))
            }
          >
            학습 모델 초기화
          </button>
          <button
            className="danger"
            onClick={() => {
              if (!confirm('모든 설정을 기본값으로 되돌릴까요? (비밀번호는 유지)')) return;
              up((p) => ({ ...defaultSettings(), adminHash: p.adminHash }));
              void clearStore('data').then(() => done('게임 데이터와 설정을 초기화했습니다'));
            }}
          >
            게임 데이터 · 설정 초기화
          </button>
        </div>
        <label className="kv">
          <input type="checkbox" checked={s.accumulateDriving} onChange={(e) => up((p) => ({ ...p, accumulateDriving: e.target.checked }))} />
          자율주행: 이전 학생들의 학습 데이터 이어서 사용
        </label>
        <h3>관리자 비밀번호 변경</h3>
        <div className="admin-row">
          <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} placeholder="새 비밀번호 (4자 이상)" />
          <button
            disabled={pw1.length < 4}
            onClick={() =>
              void sha256(pw1).then((h) => {
                up((p) => ({ ...p, adminHash: h }));
                setPw1('');
                done('비밀번호를 변경했습니다');
              })
            }
          >
            변경
          </button>
        </div>
        <div className="admin-msg">{msg}</div>
      </section>
      <section>
        <h3>오류 로그 ({logs.length})</h3>
        <div className="diag-log tall">
          {logs.length === 0 && <div>기록 없음</div>}
          {logs.map((l) => (
            <div key={l.id} className={l.level === 'error' ? 'no' : 'ok'}>
              [{new Date(l.time).toLocaleString('ko-KR')}] {l.level} · {l.message}
            </div>
          ))}
        </div>
        <button className="ghost" onClick={() => void clearStore('logs').then(() => done('로그를 지웠습니다'))}>
          로그 지우기
        </button>
      </section>
    </div>
  );
}

function SystemTab() {
  const [info, setInfo] = useState<Record<string, string>>({});
  const mem = useRef('');
  useEffect(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    let gpu = 'WebGL 사용 불가';
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    const pm = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    mem.current = pm ? `${Math.round(pm.usedJSHeapSize / 1048576)}MB / ${Math.round(pm.jsHeapSizeLimit / 1048576)}MB` : '측정 불가';
    setInfo({
      'CPU 논리 코어': String(navigator.hardwareConcurrency ?? '?'),
      '메모리(브라우저 추정)': (navigator as unknown as { deviceMemory?: number }).deviceMemory ? `${(navigator as unknown as { deviceMemory: number }).deviceMemory}GB 이상` : '알 수 없음',
      GPU: gpu,
      '화면 해상도': `${screen.width}×${screen.height} (배율 ${window.devicePixelRatio})`,
      'JS 메모리 사용량': mem.current,
      실행환경: window.kioskApi?.isElectron ? 'Electron 키오스크' : '웹 브라우저',
      네트워크: navigator.onLine ? '연결됨 (프로그램은 인터넷을 사용하지 않음)' : '오프라인 (정상)',
      '활성 게임': String(enabledList(useApp.getState().settings).filter(Boolean).length),
    });
  }, []);
  return (
    <div className="admin-grid">
      <section>
        <h3>시스템 정보</h3>
        <table>
          <tbody>
            {Object.entries(info).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">설치 전 상세 점검: scripts\check-system.ps1 실행</p>
      </section>
      <section>
        <h3>키오스크 제어</h3>
        <div className="admin-row">
          <button
            onClick={() => {
              const st = useApp.getState();
              if (st.kiosk.screen === 'game') st.dispatch({ type: 'exitToMenu', enabled: enabledList(st.settings) });
              st.setAdminOpen(false);
            }}
          >
            메인 메뉴로 이동
          </button>
          <button onClick={() => location.reload()}>프로그램 새로고침</button>
          {window.kioskApi?.isElectron && (
            <button className="danger" onClick={() => confirm('프로그램을 종료할까요?') && window.kioskApi?.quit()}>
              프로그램 종료
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
