
import { GoogleGenAI } from "@google/genai";
import { TravelRequest, TravelResultContent, TransportMode, Region } from "../types";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateTravelPlan = async (req: TravelRequest, retryCount = 0): Promise<TravelResultContent> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const isPublic = req.transport === TransportMode.PUBLIC;
  const isOverseas = req.region === Region.OVERSEAS;
  const lazyLevelMap = ["살짝 귀찮음", "많이 귀찮음", "움직이면 사망", "침대와 합체", "영혼만 여행"];
  const lazyDescription = lazyLevelMap[req.lazinessLevel - 1];

  const systemInstruction = `
    당신은 여행을 극도로 싫어하는 사람들을 위한 '냉소적이고 위트 있는' 여행 가이드입니다.
    Google Maps 데이터를 활용하여 실제 존재하는 장소만 추천하세요.
    
    사용자의 게으름 강도: ${lazyDescription} (Lv.${req.lazinessLevel})
    컨셉: '최소 동선', '노 웨이팅', '한 번의 셔터로 인스타 박제'.
    
    조건:
    - 지역: ${req.region}
    - 인원: ${req.participants}
    - 일정: ${req.duration}
    - 예산: ${req.budget}
    - 이동 수단: ${req.transport}
    - 맛집: ${req.includeFood ? '유명 맛집 필수' : '카페나 편의점 선호'}
    
    ${isOverseas ? '해외 여행의 경우, 비행 시간이 3시간 이내인 가까운 곳(일본, 타이완 등) 중 공항에서 시내 이동이 30분 이내인 곳만 추천할 것.' : ''}
    ${isPublic ? '반드시 지하철역 출구에서 도보 300m 이내인 장소만 추천할 것.' : '주차가 압도적으로 편하거나 발렛이 되는 곳만 추천할 것.'}
    
    응답 형식 (반드시 지킬 것):
    [TITLE] 여행 제목
    [DIFFICULTY] 게으름 지수 (0-100, 높을수록 이동 적음)
    [COMMENT] 냉소적인 총평
    
    [DAY 1]
    [PLACE] 장소명
    [DESC] 귀차니스트에게 좋은 이유 (한 줄)
    [TIP] 최소 동선 꿀팁
    [PHOTO] 사진 찍기 난이도 (1-5)
    ...
    
    말투: "비행기 타는 것조차 사치지만, 정 가야겠다면 공항 앞 호텔에서 나오지 마세요." 처럼 시니컬하게.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `위 조건에 맞춰 실제 장소들이 포함된 최단 거리 여행 코스를 짜줘. 지역은 ${req.region}이야.`,
      config: {
        systemInstruction,
        tools: [{ googleMaps: {} }],
        ...(req.location && {
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: req.location.latitude,
                longitude: req.location.longitude
              }
            }
          }
        })
      }
    });

    const text = response.text || "데이터를 가져오지 못했습니다.";
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    const links: { title: string; uri: string }[] = [];
    groundingChunks.forEach((chunk: any) => {
      if (chunk.maps) {
        links.push({
          title: chunk.maps.title,
          uri: chunk.maps.uri
        });
      }
    });

    return { text, links };
  } catch (error: any) {
    // 503 에러 발생 시 재시도 (최대 2번)
    if (error.message?.includes('503') && retryCount < 2) {
      await sleep(2000 * (retryCount + 1));
      return generateTravelPlan(req, retryCount + 1);
    }
    console.error("Gemini Error:", error);
    throw new Error(error.message?.includes('503') 
      ? "서버 부하가 심합니다. 잠시 후 다시 '최소 동선 계산하기'를 눌러주세요." 
      : "AI 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }
};
