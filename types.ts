
export enum TravelStyle {
  HERMIT = '집돌이/집순이 (숙소 중심)',
  EFFICIENCY = '가성비 여행 (체험 중심)',
  STATUS = 'SNS 과시용 (감성 중심)',
  WELLNESS = '웰니스 여행 (치유 중심)'
}

export enum Region {
  SEOUL = '서울 (지하철 역세권)',
  BUSAN = '부산 (바다만 잠깐)',
  JEJU = '제주 (주차장 넓은 곳)',
  GANGNEUNG = '강릉 (바다 산책 최단거리)',
  JEONJU = '전주 (한옥마을 엎어지면 코 앞)',
  GYEONGJU = '경주 (황리단길 껌딱지)',
  INCHEON = '인천 (공항 근처/송도)',
  SOKCHO = '속초 (중앙시장 먹방)',
  YEOSU = '여수 (밤바다 호캉스)',
  OVERSEAS = '해외 (가까운 이웃 나라)'
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
  KRW_10 = '10만원 이하',
  KRW_20 = '20만원 대',
  KRW_30 = '30만원 대',
  KRW_MORE = '럭셔리(무제한)'
}

export enum Participant {
  SOLO = '1인 (완벽한 고독)',
  SMALL = '2~3인 (소수 정예)',
  LARGE = '4인 이상 (단체/가족)'
}

export interface TravelRequest {
  region: Region;
  duration: Duration;
  style: TravelStyle;
  budget: Budget;
  transport: TransportMode;
  participants: Participant;
  includeFood: boolean;
  lazinessLevel: number;
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
}
