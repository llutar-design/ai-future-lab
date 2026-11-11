import type { ReactNode } from 'react';

/**
 * 교육용 사례. 모든 그림은 이 프로그램을 위해 SVG로 직접 그린 가상 자료이며,
 * 등장하는 학교·언론사·인물·기관은 모두 가상입니다(실제 인물·단체를 흉내 내지 않음).
 */
export type EvidenceType = 'detail' | 'shadow' | 'background' | 'source' | 'metadata' | 'cross';
export type Weight = 'strong' | 'medium' | 'weak' | 'none';
export type Points = 'ai' | 'real' | 'unclear';

export interface Evidence {
  type: EvidenceType;
  finding: string;
  weight: Weight;
  points: Points;
  highlight?: { x: number; y: number; r: number };
}

export interface MediaCase {
  id: string;
  kind: '사진' | '그림' | '짧은 영상' | '뉴스 기사';
  title: string;
  caption: string;
  truth: 'ai' | 'real';
  truthText: string;
  evidence: Evidence[];
  /** 사전 분석된 사례 값 (실제 탐지 모델 결과 아님) */
  preAnalysis: { aiScore: number; note: string };
  facts: string[];
  uncertain: string[];
  moreChecks: string[];
  art: () => ReactNode;
}

export const EVIDENCE_INFO: Record<EvidenceType, { name: string; icon: string }> = {
  detail: { name: '이미지 세부 표현', icon: '🔍' },
  shadow: { name: '그림자와 반사', icon: '☀️' },
  background: { name: '배경의 일관성', icon: '🏙️' },
  source: { name: '출처 정보', icon: '📮' },
  metadata: { name: '생성 이력 · 메타데이터', icon: '🧾' },
  cross: { name: '다른 자료와 교차 검증', icon: '🔗' },
};

export const WEIGHT_KO: Record<Weight, string> = { strong: '강한 근거', medium: '중간 근거', weak: '약한 근거', none: '판단 근거 아님' };
export const POINTS_KO: Record<Points, string> = { ai: 'AI 생성 쪽', real: '실제 자료 쪽', unclear: '어느 쪽인지 모름' };

export const CASES: MediaCase[] = [
  {
    id: 'penguin',
    kind: '사진',
    title: '운동장에 나타난 펭귄 떼?!',
    caption: '"오늘 아침 우리 학교 운동장에 펭귄이 왔어요!" — SNS에 올라온 사진',
    truth: 'ai',
    truthText: '생성형 AI로 만든 이미지예요.',
    evidence: [
      { type: 'detail', finding: '학교 간판이 "미래초등하교"처럼 이상하게 쓰여 있어요. 다만 사람이 만든 간판도 오타가 날 수 있어요.', weight: 'weak', points: 'ai', highlight: { x: 400, y: 92, r: 90 } },
      { type: 'shadow', finding: '나무 그림자는 오른쪽, 펭귄 그림자는 왼쪽으로 뻗어 있어요. 해는 하나인데 빛 방향이 서로 맞지 않아요.', weight: 'medium', points: 'ai', highlight: { x: 450, y: 420, r: 120 } },
      { type: 'background', finding: '펭귄 바로 뒤에서 울타리가 갑자기 끊겼다가 다시 이어져요.', weight: 'medium', points: 'ai', highlight: { x: 470, y: 300, r: 80 } },
      { type: 'source', finding: '어제 만들어진 이름 없는 계정이 처음 올렸어요. 다른 게시물은 하나도 없어요.', weight: 'medium', points: 'ai' },
      { type: 'metadata', finding: '파일의 콘텐츠 출처 기록에 "생성 AI 도구로 제작됨" 표시가 남아 있어요.', weight: 'strong', points: 'ai' },
      { type: 'cross', finding: '학교 소식지와 지역 동물원 안내 어디에도 펭귄 소식이 없어요.', weight: 'medium', points: 'ai' },
    ],
    preAnalysis: { aiScore: 0.86, note: '교육용으로 미리 적어 둔 예시 점수입니다. 실제 탐지 모델이 분석한 값이 아닙니다.' },
    facts: ['파일 출처 기록에 생성 도구 표시가 있다', '공식 채널에 관련 소식이 없다'],
    uncertain: ['간판 글자는 단순한 오타일 수도 있다', '출처 기록은 지워지거나 바뀔 수도 있다'],
    moreChecks: ['학교에 직접 물어보기', '처음 올린 사람과 원본 파일 찾기'],
    art: PenguinArt,
  },
  {
    id: 'rainbow',
    kind: '사진',
    title: '하늘에 뜬 쌍무지개, 진짜일까?',
    caption: '"비 그친 오후, 무지개가 두 개나 떴어요" — 지역 기상 관측소 견학 게시판(가상 기관)',
    truth: 'real',
    truthText: '실제로 촬영한 사진이에요. 쌍무지개는 실제로 일어나는 현상이에요.',
    evidence: [
      { type: 'detail', finding: '바깥쪽 무지개는 색 순서가 반대예요. 이상해 보이지만 실제 쌍무지개는 원래 그래요.', weight: 'medium', points: 'real', highlight: { x: 400, y: 200, r: 150 } },
      { type: 'shadow', finding: '사람들 그림자가 모두 같은 방향으로 일정하게 뻗어 있어요.', weight: 'medium', points: 'real', highlight: { x: 300, y: 450, r: 110 } },
      { type: 'background', finding: '건물과 언덕 모양이 자연스럽고, 어색하게 반복되는 무늬가 없어요.', weight: 'weak', points: 'real' },
      { type: 'source', finding: '관측소 견학 게시판에 촬영한 사람 이름과 함께 올라왔어요.', weight: 'medium', points: 'real' },
      { type: 'metadata', finding: '카메라 기종과 촬영 시각(오후 5시 12분)이 기록되어 있어요. 단, 메타데이터는 고칠 수도 있어요.', weight: 'weak', points: 'real' },
      { type: 'cross', finding: '같은 시각, 다른 장소에서 찍은 쌍무지개 사진이 여러 장 있어요.', weight: 'strong', points: 'real' },
    ],
    preAnalysis: { aiScore: 0.18, note: '교육용으로 미리 적어 둔 예시 점수입니다. 실제 탐지 모델이 분석한 값이 아닙니다.' },
    facts: ['다른 장소에서 찍힌 사진들과 내용이 일치한다', '쌍무지개의 색 순서가 과학 원리와 맞다'],
    uncertain: ['메타데이터는 바뀔 수 있어 혼자서는 확실한 근거가 아니다'],
    moreChecks: ['그날 날씨 기록 확인하기', '촬영한 사람에게 원본 파일 요청하기'],
    art: RainbowArt,
  },
  {
    id: 'principal',
    kind: '짧은 영상',
    title: '"내일부터 숙제 없음!" 교장선생님 발표 영상',
    caption: '단체 메시지로 전달된 짧은 영상 (등장인물은 가상의 로봇 교장선생님)',
    truth: 'ai',
    truthText: 'AI로 얼굴과 목소리를 합성해 만든 가짜 영상(딥페이크)이에요.',
    evidence: [
      { type: 'detail', finding: '입 모양과 자막이 조금씩 어긋나요. 하지만 영상이 압축되면서 생길 수도 있어요.', weight: 'weak', points: 'ai', highlight: { x: 400, y: 230, r: 70 } },
      { type: 'shadow', finding: '얼굴은 왼쪽에서 빛을 받는데, 뒤쪽 조명은 오른쪽에 있어요.', weight: 'medium', points: 'ai', highlight: { x: 400, y: 200, r: 130 } },
      { type: 'background', finding: '뒤쪽 학교 로고가 장면마다 모양이 살짝 바뀌어요.', weight: 'medium', points: 'ai', highlight: { x: 640, y: 110, r: 80 } },
      { type: 'source', finding: '누가 처음 만들었는지 모르는 채로 여러 단체방에 퍼졌어요.', weight: 'medium', points: 'ai' },
      { type: 'metadata', finding: '메타데이터가 모두 지워져 있어요. 지워졌다고 해서 가짜라는 증거는 아니에요.', weight: 'none', points: 'unclear' },
      { type: 'cross', finding: '학교 공식 홈페이지 공지에는 이런 발표가 없고, 학교는 "사실이 아니다"라고 안내했어요.', weight: 'strong', points: 'ai' },
    ],
    preAnalysis: { aiScore: 0.62, note: '교육용 예시 점수입니다. 0.4~0.7은 탐지기도 확신하지 못하는 "판단 보류" 구간이에요.' },
    facts: ['학교 공식 공지와 내용이 다르다', '처음 만든 사람을 알 수 없다'],
    uncertain: ['입 모양 어긋남은 압축 때문일 수도 있다', '메타데이터가 없는 것만으로는 판단할 수 없다'],
    moreChecks: ['학교 공식 채널 확인하기', '퍼뜨리기 전에 선생님께 여쭤보기'],
    art: PrincipalArt,
  },
  {
    id: 'spaceplay',
    kind: '그림',
    title: '너무 완벽한 우주 놀이터 그림',
    caption: '"AI가 그린 것 같은데?" — 학급 미술 전시에 올라온 상상화',
    truth: 'real',
    truthText: '학생이 디지털 그림 앱으로 직접 그린 그림이에요.',
    evidence: [
      { type: 'detail', finding: '선이 매끈하고 색이 완벽해서 AI 그림처럼 보여요. 하지만 디지털 그림 앱으로도 이렇게 그릴 수 있어요.', weight: 'weak', points: 'unclear', highlight: { x: 380, y: 260, r: 120 } },
      { type: 'shadow', finding: '상상화라서 그림자가 실제와 달라도 이상하지 않아요.', weight: 'none', points: 'unclear' },
      { type: 'background', finding: '별 모양이 하나하나 조금씩 달라요. 손으로 하나씩 찍은 것 같아요.', weight: 'weak', points: 'real', highlight: { x: 150, y: 90, r: 90 } },
      { type: 'source', finding: '학급 미술 전시 페이지에 그린 학생 이름과 작품 설명이 함께 있어요.', weight: 'medium', points: 'real' },
      { type: 'metadata', finding: '그림 앱 작업 기록에 밑그림부터 색칠까지 12단계 레이어가 남아 있어요.', weight: 'strong', points: 'real' },
      { type: 'cross', finding: '같은 학생의 예전 그림들과 그림체가 비슷해요.', weight: 'medium', points: 'real' },
    ],
    preAnalysis: { aiScore: 0.71, note: '교육용 예시 점수입니다. 이 사례에서 탐지기는 사람이 그린 그림을 AI로 잘못 의심했어요(오탐).' },
    facts: ['작업 과정 기록(레이어)이 남아 있다', '그린 사람과 작품 설명이 공개되어 있다'],
    uncertain: ['깔끔한 그림체만으로는 AI인지 사람인지 알 수 없다'],
    moreChecks: ['그린 학생에게 작업 과정 들어보기'],
    art: SpaceArt,
  },
  {
    id: 'snownews',
    kind: '뉴스 기사',
    title: '"폭설로 놀이공원 일주일 휴장" 기사',
    caption: '"오늘뉴스24"(가상 매체)라는 곳에서 퍼진 기사',
    truth: 'ai',
    truthText: 'AI로 만든 가짜 기사예요. 사진은 3년 전 실제 사진을 다른 내용에 다시 쓴 것이에요.',
    evidence: [
      { type: 'detail', finding: '기사 문장이 비슷한 표현을 계속 반복하고, 기자 이름이 없어요.', weight: 'medium', points: 'ai', highlight: { x: 560, y: 330, r: 140 } },
      { type: 'shadow', finding: '사진 속 그림자와 눈 반사는 자연스러워요. 사진만 보면 진짜 같아요.', weight: 'none', points: 'unclear', highlight: { x: 220, y: 300, r: 120 } },
      { type: 'background', finding: '사진 속 관람차 간판이 지금과 다른 옛날 디자인이에요.', weight: 'medium', points: 'ai', highlight: { x: 210, y: 210, r: 70 } },
      { type: 'source', finding: '"오늘뉴스24"라는 언론사는 등록 정보나 연락처를 찾을 수 없어요.', weight: 'strong', points: 'ai', highlight: { x: 400, y: 45, r: 120 } },
      { type: 'metadata', finding: '사진의 촬영 날짜가 3년 전 1월로 나와요.', weight: 'medium', points: 'ai' },
      { type: 'cross', finding: '놀이공원 공식 안내는 "정상 운영"이고, 같은 사진이 3년 전 다른 기사에 쓰였어요.', weight: 'strong', points: 'ai' },
    ],
    preAnalysis: {
      aiScore: 0.09,
      note: '교육용 예시 점수입니다. 사진은 실제 사진이라 이미지 탐지기 점수는 낮지만, 기사 자체는 가짜예요. 이미지 탐지기는 글의 진실 여부를 알 수 없어요.',
    },
    facts: ['공식 안내와 기사 내용이 다르다', '사진이 3년 전 다른 기사에 쓰였다'],
    uncertain: ['기사 문장을 AI가 썼는지 사람이 썼는지는 확실히 알기 어렵다'],
    moreChecks: ['공식 누리집이나 믿을 수 있는 언론 확인하기', '사진을 이미지 검색으로 찾아보기'],
    art: NewsArt,
  },
];

/* ---------------- SVG 그림 (800×500) ---------------- */

function PhotoFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <rect width="800" height="500" fill="#e2e8f0" />
      {children}
    </>
  );
}

function PenguinArt() {
  const penguin = (x: number, y: number, s: number) => (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="-34" cy="62" rx="40" ry="8" fill="rgba(0,0,0,0.3)" />
      <ellipse cx="0" cy="20" rx="26" ry="40" fill="#111827" />
      <ellipse cx="0" cy="28" rx="17" ry="30" fill="#f8fafc" />
      <circle cx="0" cy="-22" r="18" fill="#111827" />
      <circle cx="-6" cy="-25" r="4" fill="#fff" />
      <circle cx="6" cy="-25" r="4" fill="#fff" />
      <path d="M-5 -16 L5 -16 L0 -8 Z" fill="#f59e0b" />
      <ellipse cx="-10" cy="60" rx="9" ry="4" fill="#f59e0b" />
      <ellipse cx="10" cy="60" rx="9" ry="4" fill="#f59e0b" />
    </g>
  );
  return (
    <PhotoFrame>
      <defs>
        <linearGradient id="pgSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
      </defs>
      <rect width="800" height="300" fill="url(#pgSky)" />
      <circle cx="90" cy="70" r="40" fill="#fde047" />
      <rect x="220" y="60" width="360" height="200" fill="#fef3c7" stroke="#d6a52c" strokeWidth="4" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={240 + i * 68} y="140" width="44" height="50" fill="#93c5fd" stroke="#64748b" strokeWidth="3" />
      ))}
      <rect x="300" y="72" width="200" height="40" rx="6" fill="#1e3a8a" />
      <text x="400" y="100" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="700">
        미래초등하교
      </text>
      <rect y="260" width="800" height="240" fill="#4ade80" />
      <rect y="260" width="800" height="12" fill="#16a34a" />
      {/* 울타리(펭귄 뒤에서 끊김) */}
      {Array.from({ length: 20 }, (_, i) => i * 40 + 10)
        .filter((x) => x < 430 || x > 520)
        .map((x) => (
          <rect key={x} x={x} y="275" width="6" height="40" fill="#a16207" />
        ))}
      <rect x="0" y="285" width="430" height="5" fill="#a16207" />
      <rect x="520" y="285" width="280" height="5" fill="#a16207" />
      {/* 나무와 오른쪽 그림자 */}
      <ellipse cx="700" cy="420" rx="70" ry="12" fill="rgba(0,0,0,0.3)" transform="translate(50,0)" />
      <rect x="680" y="320" width="20" height="100" fill="#92400e" />
      <circle cx="690" cy="300" r="55" fill="#15803d" />
      {penguin(380, 360, 1.1)}
      {penguin(450, 380, 1.25)}
      {penguin(520, 355, 1)}
    </PhotoFrame>
  );
}

function RainbowArt() {
  const colors = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#6366f1', '#a855f7'];
  return (
    <PhotoFrame>
      <rect width="800" height="500" fill="#94a3b8" />
      <rect width="800" height="330" fill="#cbd5e1" />
      <ellipse cx="160" cy="80" rx="140" ry="45" fill="#e2e8f0" />
      <ellipse cx="650" cy="60" rx="160" ry="50" fill="#f1f5f9" />
      {colors.map((c, i) => (
        <path key={`a${i}`} d={`M ${130 + i * 9} 360 A ${270 - i * 9} ${270 - i * 9} 0 0 1 ${670 - i * 9} 360`} stroke={c} strokeWidth="9" fill="none" opacity="0.75" />
      ))}
      {[...colors].reverse().map((c, i) => (
        <path key={`b${i}`} d={`M ${50 + i * 8} 360 A ${350 - i * 8} ${350 - i * 8} 0 0 1 ${750 - i * 8} 360`} stroke={c} strokeWidth="7" fill="none" opacity="0.35" />
      ))}
      <path d="M0 360 Q200 300 400 350 T800 330 L800 500 L0 500 Z" fill="#4d7c0f" />
      {[60, 150, 600, 700].map((x, i) => (
        <rect key={x} x={x} y={300 - i * 10} width="50" height={80 + i * 10} fill="#475569" />
      ))}
      {[260, 330, 400].map((x) => (
        <g key={x}>
          <ellipse cx={x + 40} cy="468" rx="45" ry="7" fill="rgba(0,0,0,0.3)" />
          <rect x={x - 8} y="400" width="16" height="66" rx="6" fill="#1f2937" />
          <circle cx={x} cy="390" r="12" fill="#1f2937" />
        </g>
      ))}
    </PhotoFrame>
  );
}

function PrincipalArt() {
  return (
    <g>
      <rect width="800" height="500" fill="#1e293b" />
      <rect x="20" y="20" width="760" height="420" fill="#334155" />
      <circle cx="700" cy="60" r="60" fill="#fde68a" opacity="0.25" />
      <g className="df-logo">
        <circle cx="640" cy="110" r="40" fill="#0ea5e9" />
        <text x="640" y="118" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700">
          미래
        </text>
      </g>
      <rect x="250" y="330" width="300" height="110" fill="#7c2d12" />
      <rect x="320" y="120" width="160" height="150" rx="50" fill="#cbd5e1" />
      <rect x="290" y="250" width="220" height="100" rx="30" fill="#475569" />
      <rect x="340" y="150" width="120" height="80" rx="30" fill="#0f172a" />
      <circle cx="375" cy="180" r="10" fill="#7df9ff" />
      <circle cx="425" cy="180" r="10" fill="#7df9ff" />
      <ellipse cx="400" cy="210" rx="16" ry="6" fill="#7df9ff" className="df-mouth" />
      <rect x="0" y="440" width="800" height="60" fill="#000" />
      <text x="400" y="478" textAnchor="middle" fill="#fff" fontSize="28" className="df-sub">
        "여러분, 내일부터 숙제가 없습니다!"
      </text>
      <circle cx="40" cy="45" r="8" fill="#ef4444" className="df-rec" />
      <text x="56" y="52" fill="#fff" fontSize="18">
        ▶ 0:07
      </text>
    </g>
  );
}

function SpaceArt() {
  return (
    <g>
      <defs>
        <linearGradient id="spSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1b4b" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="spPlanet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f9a8d4" />
          <stop offset="1" stopColor="#c026d3" />
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#spSky)" />
      {[
        [80, 60, 1],
        [150, 120, 0.7],
        [220, 50, 1.2],
        [600, 80, 0.9],
        [700, 140, 1.1],
        [520, 40, 0.6],
        [120, 200, 0.8],
      ].map(([x, y, s], i) => (
        <path key={i} transform={`translate(${x},${y}) scale(${s}) rotate(${i * 13})`} d="M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3 Z" fill="#fef9c3" />
      ))}
      <circle cx="640" cy="260" r="90" fill="url(#spPlanet)" />
      <ellipse cx="640" cy="260" rx="150" ry="26" fill="none" stroke="#fde68a" strokeWidth="8" />
      <path d="M0 420 Q400 330 800 420 L800 500 L0 500 Z" fill="#a78bfa" />
      <path d="M260 410 L420 250 L440 250 L280 420 Z" fill="#38bdf8" />
      <rect x="420" y="240" width="20" height="170" fill="#e2e8f0" />
      <rect x="380" y="230" width="100" height="16" rx="8" fill="#f472b6" />
      <circle cx="330" cy="330" r="24" fill="#fde047" />
      <circle cx="322" cy="324" r="4" fill="#1e1b4b" />
      <circle cx="338" cy="324" r="4" fill="#1e1b4b" />
      <path d="M318 338 Q330 348 342 338" stroke="#1e1b4b" strokeWidth="3" fill="none" />
      <text x="20" y="485" fill="#ede9fe" fontSize="18">
        5학년 2반 작품 · "우주 놀이터"
      </text>
    </g>
  );
}

function NewsArt() {
  return (
    <g>
      <rect width="800" height="500" fill="#f8fafc" />
      <rect width="800" height="80" fill="#b91c1c" />
      <text x="400" y="55" textAnchor="middle" fill="#fff" fontSize="40" fontWeight="900">
        오늘뉴스24
      </text>
      <text x="40" y="125" fill="#111827" fontSize="30" fontWeight="900">
        [속보] 폭설로 놀이공원 일주일 휴장… 시민들 충격
      </text>
      <text x="40" y="155" fill="#64748b" fontSize="18">
        입력 2026.01.15 · 기자 정보 없음
      </text>
      <rect x="40" y="175" width="360" height="290" fill="#e2e8f0" />
      <rect x="40" y="175" width="360" height="200" fill="#cbd5e1" />
      <circle cx="210" cy="275" r="80" fill="none" stroke="#64748b" strokeWidth="8" />
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1="210" y1="275" x2={210 + 80 * Math.cos((i * Math.PI) / 4)} y2={275 + 80 * Math.sin((i * Math.PI) / 4)} stroke="#64748b" strokeWidth="4" />
      ))}
      <rect x="170" y="190" width="80" height="24" rx="4" fill="#f59e0b" />
      <text x="210" y="208" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">
        WONDER
      </text>
      <rect x="40" y="375" width="360" height="90" fill="#f8fafc" />
      <path d="M40 380 Q120 350 220 375 T400 370 L400 465 L40 465 Z" fill="#ffffff" stroke="#e2e8f0" />
      {[
        '많은 시민들이 큰 충격을 받았다.',
        '시민들은 매우 큰 충격에 빠졌으며',
        '큰 충격 속에서 놀이공원은 휴장을',
        '결정했다. 관계자는 휴장이 매우',
        '아쉽다고 전했으며 많은 시민들이',
        '아쉬움을 표했다. 시민들은 아쉽다며',
        '큰 충격을 받았다고 말했다...',
      ].map((t, i) => (
        <text key={i} x="420" y={200 + i * 34} fill="#334155" fontSize="17">
          {t}
        </text>
      ))}
    </g>
  );
}
