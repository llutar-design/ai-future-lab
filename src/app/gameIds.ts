export const GAME_IDS = ['ai-training', 'autonomous-driving', 'deepfake-detective', 'reinforcement-arena'] as const;
export type GameId = (typeof GAME_IDS)[number];

export type Costume = 'researcher' | 'driver' | 'detective' | 'coach' | 'guide';

export interface GameMeta {
  id: GameId;
  name: string;
  speakName: string;
  tech: string;
  defaultMinutes: number;
  color: string;
  costume: Costume;
  tagline: string;
}

export const GAME_META: Record<GameId, GameMeta> = {
  'ai-training': {
    id: 'ai-training',
    name: 'AI 훈련 연구소',
    speakName: '에이아이 훈련 연구소',
    tech: '머신러닝 · 지도학습',
    defaultMinutes: 6,
    color: '#38bdf8',
    costume: 'researcher',
    tagline: '내가 만든 데이터로 AI를 가르쳐요',
  },
  'autonomous-driving': {
    id: 'autonomous-driving',
    name: 'AI 자율주행 연구소',
    speakName: '에이아이 자율주행 연구소',
    tech: '객체 인식 · 주행 판단',
    defaultMinutes: 8,
    color: '#34d399',
    costume: 'driver',
    tagline: 'AI 자동차를 훈련해 학교까지 가요',
  },
  'deepfake-detective': {
    id: 'deepfake-detective',
    name: 'AI 딥페이크 탐정단',
    speakName: '에이아이 딥페이크 탐정단',
    tech: '생성형 AI · 미디어 검증',
    defaultMinutes: 6,
    color: '#c084fc',
    costume: 'detective',
    tagline: '증거를 모아 진짜와 가짜를 살펴요',
  },
  'reinforcement-arena': {
    id: 'reinforcement-arena',
    name: 'AI 강화학습 아레나',
    speakName: '에이아이 강화학습 아레나',
    tech: '강화학습 · 보상 최적화',
    defaultMinutes: 8,
    color: '#fbbf24',
    costume: 'coach',
    tagline: '보상 규칙을 정하고 로봇을 키워요',
  },
};
