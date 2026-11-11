import { pick, type Rng } from '../ai/rng';

/**
 * 자율주행 연구소의 교통 상황 모델(가상 센서 시뮬레이션).
 * 실제 카메라 영상을 분석하지 않습니다. 장면 정보가 "가상 센서" 값으로 AI에 들어갑니다.
 */
export type Light = 'none' | 'green' | 'yellow' | 'red';
export type Ped = 'none' | 'sidewalk' | 'crossing';
export type CarAhead = 'none' | 'far' | 'near';
export type Weather = 'clear' | 'rain' | 'fog';

export interface Scenario {
  light: Light;
  ped: Ped;
  obstacle: boolean;
  school: boolean;
  weather: Weather;
  car: CarAhead;
  /** 갑자기 나타나는 장애물(공이 굴러옴 등) */
  sudden?: boolean;
  /** 최종 미션 구간 이름 */
  title?: string;
}

export const FEATURE_DIM = 15;

export function encodeScenario(s: Scenario): number[] {
  const oh = <T>(v: T, all: T[]) => all.map((a) => (a === v ? 1 : 0));
  return [
    ...oh(s.light, ['none', 'green', 'yellow', 'red'] as Light[]),
    ...oh(s.ped, ['none', 'sidewalk', 'crossing'] as Ped[]),
    s.obstacle ? 1 : 0,
    s.school ? 1 : 0,
    ...oh(s.weather, ['clear', 'rain', 'fog'] as Weather[]),
    ...oh(s.car, ['none', 'far', 'near'] as CarAhead[]),
  ];
}

/**
 * 교통 규칙 기준 위험 요소. 안전 제어기와 평가 정답에 사용합니다.
 * (학생 판단으로 학습하는 AI와는 별개인 규칙 기반 로직)
 */
export function hazards(s: Scenario): string[] {
  const h: string[] = [];
  if (s.light === 'red') h.push('빨간 신호');
  if (s.light === 'yellow') h.push('노란 신호(곧 빨간불)');
  if (s.ped === 'crossing') h.push('횡단보도 위 보행자');
  if (s.school && s.ped === 'sidewalk') h.push('어린이 보호구역 보행자');
  if (s.obstacle) h.push('도로 장애물');
  if (s.car === 'near') h.push('앞차와 너무 가까움');
  return h;
}

export function isSafeToGo(s: Scenario): boolean {
  return hazards(s).length === 0;
}

export const LIGHT_KO: Record<Light, string> = { none: '신호등 없음', green: '초록불', yellow: '노란불', red: '빨간불' };
export const PED_KO: Record<Ped, string> = { none: '보행자 없음', sidewalk: '인도에 보행자', crossing: '횡단보도 위 보행자' };
export const CAR_KO: Record<CarAhead, string> = { none: '앞차 없음', far: '앞차 멀리 있음', near: '앞차 가까움' };
export const WEATHER_KO: Record<Weather, string> = { clear: '맑음', rain: '비', fog: '안개' };

export function describe(s: Scenario): string[] {
  const d = [LIGHT_KO[s.light], PED_KO[s.ped], CAR_KO[s.car], `날씨: ${WEATHER_KO[s.weather]}`];
  if (s.obstacle) d.push(s.sudden ? '갑자기 나타난 장애물' : '공사 장애물');
  if (s.school) d.push('어린이 보호구역');
  return d;
}

/** 가상 센서 신뢰도: 날씨가 나쁠수록 낮아집니다(시뮬레이션 값) */
export function sensorConfidence(w: Weather): number {
  return w === 'clear' ? 0.97 : w === 'rain' ? 0.82 : 0.64;
}

/** 규칙 기반 위험도 0~1 (안전 제어기가 사용하는 값) */
export function riskScore(s: Scenario): number {
  let r = 0.05;
  if (s.light === 'red') r += 0.6;
  if (s.light === 'yellow') r += 0.35;
  if (s.ped === 'crossing') r += 0.7;
  if (s.ped === 'sidewalk') r += s.school ? 0.45 : 0.12;
  if (s.obstacle) r += 0.6;
  if (s.car === 'near') r += 0.5;
  if (s.car === 'far') r += 0.08;
  if (s.weather === 'rain') r += 0.1;
  if (s.weather === 'fog') r += 0.18;
  return Math.min(1, r);
}

export interface DetectedObject {
  label: string;
  distance: number;
  danger: boolean;
}

/** 가상 센서가 "감지한" 물체 목록 (장면 데이터에서 생성) */
export function detectedObjects(s: Scenario, distToStop: number): DetectedObject[] {
  const d = Math.max(0, distToStop);
  const out: DetectedObject[] = [];
  if (s.light !== 'none') out.push({ label: `신호등(${LIGHT_KO[s.light]})`, distance: d + 4, danger: s.light === 'red' || s.light === 'yellow' });
  if (s.ped !== 'none') out.push({ label: s.ped === 'crossing' ? '보행자(횡단 중)' : '보행자(인도)', distance: d + (s.ped === 'crossing' ? 6 : 8), danger: s.ped === 'crossing' || s.school });
  if (s.obstacle) out.push({ label: s.sudden ? '굴러온 공' : '공사 콘', distance: d + 5, danger: true });
  if (s.car !== 'none') out.push({ label: '앞차', distance: d + (s.car === 'near' ? 5 : 22), danger: s.car === 'near' });
  if (s.school) out.push({ label: '어린이 보호구역 표지', distance: d + 2, danger: false });
  return out;
}

/** 무작위 교통 상황. safeRatio 비율만큼 '안전' 상황이 나오도록 조절 */
export function randomScenario(rng: Rng, safeRatio = 0.45): Scenario {
  const wantSafe = rng() < safeRatio;
  for (let tries = 0; tries < 50; tries++) {
    const s: Scenario = {
      light: pick(rng, ['none', 'green', 'green', 'yellow', 'red', 'red'] as Light[]),
      ped: pick(rng, ['none', 'none', 'sidewalk', 'crossing'] as Ped[]),
      obstacle: rng() < 0.18,
      school: rng() < 0.25,
      weather: pick(rng, ['clear', 'clear', 'rain', 'fog'] as Weather[]),
      car: pick(rng, ['none', 'none', 'far', 'near'] as CarAhead[]),
    };
    if (isSafeToGo(s) === wantSafe) return s;
  }
  return { light: 'green', ped: 'none', obstacle: false, school: false, weather: 'clear', car: 'none' };
}

/** 최종 미션: 학교 가는 길 */
export function finalMissionRoute(): Scenario[] {
  return [
    { title: '신호등 교차로', light: 'red', ped: 'none', obstacle: false, school: false, weather: 'clear', car: 'none' },
    { title: '횡단보도', light: 'none', ped: 'crossing', obstacle: false, school: false, weather: 'clear', car: 'none' },
    { title: '어린이 보호구역', light: 'none', ped: 'sidewalk', obstacle: false, school: true, weather: 'clear', car: 'none' },
    { title: '공사 구간', light: 'none', ped: 'none', obstacle: true, school: false, weather: 'clear', car: 'far' },
    { title: '갑작스러운 장애물', light: 'none', ped: 'none', obstacle: true, sudden: true, school: false, weather: 'clear', car: 'none' },
    { title: '악천후(안개)', light: 'green', ped: 'none', obstacle: false, school: false, weather: 'fog', car: 'near' },
  ];
}

/** 장애물이 사라진(해결된) 상황 */
export function resolvedScenario(s: Scenario): Scenario {
  return {
    ...s,
    light: s.light === 'none' ? 'none' : 'green',
    ped: s.ped === 'crossing' || (s.school && s.ped === 'sidewalk') ? 'none' : s.ped,
    obstacle: false,
    car: s.car === 'near' ? 'far' : s.car,
  };
}
