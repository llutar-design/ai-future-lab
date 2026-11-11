# AI FUTURE LAB — AI 미래체험 연구소

O/X 발판 2개만으로 4가지 AI 기술을 체험하는 초등학생용 상설 전시 키오스크 프로그램입니다.
인터넷 없이 Windows PC 한 대에서 실행됩니다.

| # | 연구소 | 핵심 기술 | 실제로 계산하는 것 | 기본 시간 |
|---|---|---|---|---|
| 1 | AI 훈련 연구소 | 머신러닝 · 지도학습 | 학생이 분류한 데이터로 신경망(12→8→2) 학습, 검증·시험 정확도, 재학습 전후 비교, 라벨 오염 실험 | 6분 |
| 2 | AI 자율주행 연구소 | 객체 인식 · 주행 판단 | 학생 판단으로 신경망(15→8→2) 학습, 60개 평가 상황 정확도, 규칙 기반 안전 제어기(AI와 분리) | 8분 |
| 3 | AI 딥페이크 탐정단 | 생성형 AI · 미디어 검증 | 증거 기반 추리(사례 5개). 탐지 모델 미설치 → **"사전 분석된 사례"로 표시** | 6분 |
| 4 | AI 강화학습 아레나 | 강화학습 · 보상 최적화 | 표 형식 Q-learning, 보상 규칙 5종, 동일 환경 20회 평가(학습 전/1차/2차) | 8분 |

## 빠른 실행 (개발 PC)

```powershell
npm install          # 처음 한 번 (인터넷 필요 — 설치할 때만)
npm run dev          # 브라우저에서 http://localhost:5173
npm run kiosk:windowed   # 빌드 후 Electron 창 모드로 확인 (npm run build 먼저)
```

## Windows 키오스크 배포

```powershell
npm run check:system   # 설치 전 PC 점검 (CPU/GPU/메모리/해상도/한국어 음성/HID 장치)
npm run dist:win       # release\ 폴더에 설치 파일 생성
```

- `release\AI-FUTURE-LAB-1.0.0-setup.exe` : 설치형 (바탕화면 바로가기 생성)
- `release\AI-FUTURE-LAB-1.0.0-portable.exe` : 설치 없이 USB로 옮겨 바로 실행
- 실행하면 전체 화면 키오스크로 열립니다. 점검용 창 모드: `"AI FUTURE LAB.exe" --windowed`
- 모든 라이브러리(React, Three.js 등)와 화면 자료가 실행 파일 안에 포함되어 있고, 프로그램은 로컬 파일 외 모든 네트워크 요청을 차단합니다.

> VS Code 터미널에서 `npm run kiosk`가 Node처럼 동작하면 `$env:ELECTRON_RUN_AS_NODE=$null` 후 다시 실행하세요(VS Code가 이 환경변수를 설정합니다. 키오스크 PC에서는 해당 없음).

### 부팅 시 자동 실행 (선택)
`Win + R` → `shell:startup` → 열린 폴더에 AI FUTURE LAB 바로가기를 복사합니다.

## 조작

| 화면 | O 발판 (파랑) | X 발판 (빨강) |
|---|---|---|
| 메인 메뉴 | 다음 연구소 (4번 → 1번 순환) | 체험 시작 |
| 게임 시작 전 | 설명 넘기기 | 시작 |
| 게임 중 | 화면 하단에 표시된 행동 | 화면 하단에 표시된 행동 |
| 결과 화면 | 다시 도전 | 메인 메뉴 (15초 뒤 자동) |

- 키보드: O = `A` 또는 `←`, X = `D` 또는 `→` (관리자 메뉴에서 변경)
- 관리자 메뉴: 별도 키보드에서 `Ctrl + Shift + M` → 비밀번호(초기값 **2580**, 설치 후 꼭 변경)

## 문서

- [관리자 사용 설명서](docs/admin-guide.md)
- [O/X 발판 연결 설명서](docs/pedal-guide.md)
- [AI 교육 원리 설명 자료](docs/ai-education.md)
- [테스트 결과](docs/test-results.md)
- [오류 및 미구현 기능 목록](docs/known-issues.md)
- [모듈 구조와 확장 방법](docs/architecture.md)

## 개발 명령

| 명령 | 내용 |
|---|---|
| `npm test` | 단위 테스트 (입력, 메뉴, 연속 체험, 신경망, Q-learning, 안전 제어기) |
| `npm run e2e` | 실제 Edge 브라우저로 4개 게임 끝까지 플레이 + 오프라인 + 연속 20회 + 메모리 |
| `npm run typecheck` | 타입 검사 |
| `npm run build` | 타입 검사 + 배포용 빌드(`dist/`) |
