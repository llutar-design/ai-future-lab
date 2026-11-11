# 모듈 구조와 확장 방법

```
ai-future-lab/
├─ electron/            main.cjs(키오스크 창·네트워크 차단·자동 복구), preload.cjs
├─ scripts/             e2e.mjs(Edge 자동 플레이 테스트), check-system.ps1(PC 점검)
├─ tests/               단위 테스트(vitest), e2e 보고서, 스크린샷
├─ docs/                설명서
└─ src/
   ├─ app/              App(무대·입력 연결·무입력·단축키), MainMenu, GameHost(지연 로딩·오류 경계), store(zustand), gameIds
   ├─ input/            InputManager(디바운스·잠금·동시 입력), KeyboardAdapter, PedalAdapter(Gamepad), controls(O/X 안내=동작)
   ├─ kiosk/            KioskManager(메뉴↔게임 상태 기계), IdleManager(무입력)
   ├─ admin/            AdminPanel, settings(기본값·병합·비밀번호 해시)
   ├─ components/       GameShell(인트로·HUD·타이머·결과·자동 복귀), Abot(에이봇), FootBar, Charts, Background, Overlays
   ├─ ai/
   │  ├─ models/        mlp.ts(신경망), detector.ts(딥페이크 탐지기 연동 인터페이스)
   │  ├─ training/      qlearning.ts, useLiveTraining.ts(프레임마다 실제 학습)
   │  ├─ evaluation/    metrics.ts(정확도·혼동행렬·층화 분할)
   │  └─ rng.ts         재현 가능한 난수
   ├─ simulation/       ThreeStage(렌더러 수명·품질·해제), gridworld(RL 환경), traffic(교통 상황·규칙), driveSim(주행+안전 제어기)
   ├─ audio/            sound(Web Audio 합성 효과음), speech(OS 한국어 음성)
   ├─ storage/          db.ts(IndexedDB: 이용 기록·로그·데이터)
   └─ games/
      ├─ ai-training/          TrainingGame, creatures, CreatureView
      ├─ autonomous-driving/   DrivingGame, CityScene(3D)
      ├─ deepfake-detective/   DetectiveGame, cases(사례·SVG)
      └─ reinforcement-arena/  ArenaGame, ArenaScene(3D)
```

## 핵심 설계

- **O/X 안내 = 동작**: 화면은 `useFootControls({label, run}, {label, run})`로 발판 동작을 등록합니다. 하단 안내 막대는 같은 데이터를 그리므로 안내와 실제 동작이 어긋나지 않습니다. 가장 나중에 등록된 화면이 입력을 받습니다.
- **입력 관문**: 모든 입력은 `InputManager.press/release`를 거칩니다. 새 장치(예: 시리얼 발판)는 어댑터만 추가하면 됩니다.
- **게임 = 독립 모듈**: `GameHost`가 `React.lazy`로 게임을 불러옵니다(모두 로컬 번들). 게임마다 `sessionKey`가 바뀌어 새로 마운트되므로 이전 학생 상태가 남지 않습니다.
- **자원 해제**: 3D 게임은 `ThreeStage.dispose()`에서 지오메트리·재질·텍스처·렌더러·WebGL 컨텍스트를 해제합니다. e2e 테스트가 게임 종료 후 3D 캔버스가 0개인지 확인합니다.
- **오류 격리**: 게임 오류는 `GameErrorBoundary`가 잡아 로그를 남기고 5초 뒤 메뉴로 돌아갑니다. Electron은 렌더러가 죽으면 다시 불러옵니다.
- **AI ↔ 시뮬레이션 분리**: 학습 모델(`ai/`)과 환경·규칙(`simulation/`)이 분리되어, 예를 들어 자율주행의 안전 제어기는 모델을 전혀 참조하지 않습니다.

## 새 게임 추가하기

1. `src/app/gameIds.ts`의 `GAME_IDS`와 `GAME_META`에 항목 추가
2. `src/games/<id>/<Name>Game.tsx`에서 `GameShell`로 감싼 컴포넌트를 default export
3. `src/app/GameHost.tsx`의 `GAMES`에 `lazy(() => import(...))` 추가
4. `src/components/MenuPreviews.tsx`에 미리보기 추가 (메뉴는 2×2 기준이므로 5개 이상이면 `.menu-grid` 열 수 조정)

## 딥페이크 탐지 모델 연동하기

`src/ai/models/detector.ts`의 `DeepfakeDetector`를 구현하고 `registerDetector()`로 등록합니다.
`validated: true`인 모델만 등록됩니다. 모델 파일은 `public/models/`에 넣어 오프라인으로 함께 배포하고,
사례 그림을 캔버스로 래스터화한 `ImageData`를 `runDetector()`에 넘기도록 `DetectiveGame`을 수정하면
화면 표시가 자동으로 "로컬 모델 실제 분석"으로 바뀝니다.

## 모델 교체 (예: TensorFlow.js)

현재 신경망은 의존성 없는 TypeScript 구현(`mlp.ts`)입니다. `predict/predictProba/trainEpoch/loss` 인터페이스를
같게 맞추면 TensorFlow.js 모델로 바꿀 수 있습니다(`@tensorflow/tfjs`를 설치하면 번들에 포함되어 오프라인 동작).
