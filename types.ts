
export enum TravelStyle {
  HERMIT = '집돌이/집순이 (이동 극혐)',
  EFFICIENCY = '가성비 효율충 (최단 코스)',
  STATUS = 'SNS 과시용 (찍고 바로 튀기)',
  RICH_LAZY = '돈으로 해결하는 게으름 (발렛 필수)'
}

export enum Region {
  SEOUL = '서울 (지하철 역세권)',
  BUSAN = '부산 (바다만 잠깐)',
  JEJU = '제주 (주차장 넓은 곳)',
  OVERSEAS = '해외 (비행기 타기 전부터 힘듦)'
}

export enum TransportMode {
  CAR = '자차/택시 (문 앞 하차)',
  PUBLIC = '대중교통 (역세권 껌딱지)'
}

export enum Duration {
  DAY_TRIP = '당일치기',
  ONE_NIGHT = '1박 2일',
  TWO_NIGHTS = '2박 3일'
}

export enum Budget {
  KRW_10 = '10만원',
  KRW_20 = '20만원',
  KRW_30 = '30만원',
  KRW_MORE = '그 이상'
}

export interface TravelRequest {
  region: Region;
  duration: Duration;
  style: TravelStyle;
  budget: Budget;
  transport: TransportMode;
  includeFood: boolean;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface GroundingLink {
  title: string;
  uri: string;
}

export interface TravelResultContent {
  text: string;
  links: GroundingLink[];
}

export interface SavedTravel {
  id: string;
  title: string;
  content: string;
  links: GroundingLink[];
  savedAt: string;
  region: Region;
  totalDifficulty: number;
  transport?: TransportMode;
  duration?: Duration;
  budget?: Budget;
}
