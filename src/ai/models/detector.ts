/**
 * 딥페이크(생성 콘텐츠) 탐지기 연동 구조.
 *
 * 현재 설치된 로컬 탐지 모델은 없습니다. 그래서 게임은 각 사례에 미리 적어 둔
 * "사전 분석된 사례" 값을 보여주며, 화면에 반드시 그렇게 표시합니다.
 *
 * 검증된 로컬 모델을 추가하려면 DeepfakeDetector를 구현해 registerDetector()로 등록하세요.
 * (예: ONNX/TensorFlow.js 모델 파일을 public/models/에 넣고 analyze에서 추론)
 * 등록된 탐지기가 있고 해당 자료(이미지 픽셀)를 받을 수 있을 때만 실제 추론 결과로 표시됩니다.
 */
export interface DetectorResult {
  /** 'model' = 실제 추론, 'precomputed' = 사전 분석된 사례 */
  kind: 'model' | 'precomputed';
  /** 0~1, 높을수록 AI 생성 가능성이 높다고 본 값 */
  aiScore: number;
  detectorName: string;
  note: string;
}

export interface DeepfakeDetector {
  name: string;
  /** 모델 정확도를 별도 데이터로 검증했는지 */
  validated: boolean;
  analyze(image: ImageData): Promise<number>;
}

let registered: DeepfakeDetector | null = null;

export function registerDetector(d: DeepfakeDetector) {
  if (!d.validated) throw new Error('검증되지 않은 탐지 모델은 등록할 수 없습니다');
  registered = d;
}

export function activeDetector(): DeepfakeDetector | null {
  return registered;
}

export async function runDetector(image: ImageData | null, precomputed: { aiScore: number; note: string }): Promise<DetectorResult> {
  if (registered && image) {
    const aiScore = await registered.analyze(image);
    return { kind: 'model', aiScore, detectorName: registered.name, note: '로컬 탐지 모델이 실제로 분석한 결과입니다.' };
  }
  return { kind: 'precomputed', aiScore: precomputed.aiScore, detectorName: '교육용 사전 분석', note: precomputed.note };
}

export const DETECTOR_LIMITS = [
  '탐지기 점수는 "가능성"일 뿐, 진짜·가짜를 확정하지 못해요.',
  '사람이 그린 깔끔한 그림을 AI로 잘못 의심하기도 해요(오탐).',
  '새로운 생성 AI로 만든 자료는 탐지기가 놓칠 수 있어요(미탐).',
  '이미지 탐지기는 글 내용이 사실인지, 사진이 다른 상황에 재사용됐는지는 알 수 없어요.',
];
