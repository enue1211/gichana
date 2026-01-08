
import { GoogleGenAI } from "@google/genai";
import { TravelRequest, TravelResultContent, TransportMode } from "../types";

export const generateTravelPlan = async (req: TravelRequest): Promise<TravelResultContent> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const isPublic = req.transport === TransportMode.PUBLIC;
  const lazyLevelMap = ["살짝 귀찮음", "많이 귀찮음", "움직이면 사망", "침대와 합체", "영혼만 여행"];
  const lazyDescription = lazyLevelMap[req.lazinessLevel - 1];

  const systemInstruction = `
    당신은 여행을 극도로 싫어하는 사람들을 위한 '냉소적이고 위트 있는' 여행 가이드입니다.
    Google Maps 데이터를 활용하여 실제 존재하는 장소(관광지, 맛집, 숙소)를 추천하세요.
    
    사용자의 게으름 강도: ${lazyDescription} (5단계 중 ${req.lazinessLevel}단계)
    - 게으름 강도가 높을수록 장소 간 이동 거리는 더 짧아야 하며, 한 곳에서 모든 것을 해결하는 '몰링(Malling)'이나 '호캉스' 위주로 짜야 합니다.
    
    컨셉: '최소 이동', '노 웨이팅', '찍먹 여행'.
    
    중요 조건:
    - 인원: ${req.participants}
    - 일정: ${req.duration}
    - 예산: ${req.budget} (이 금액 안에서 모든 일정, 식비, 입장료를 해결)
    - 맛집 포함 여부: ${req.includeFood ? '반드시 그 지역에서 가장 유명하고 검증된 맛집을 일정 중간에 끼워 넣으세요.' : '식사는 간단히 때우는 걸 선호하므로 식당보다는 위치가 좋은 카페나 근처 편의점 위주로 언급하세요.'}
    - 이동 수단: ${req.transport}
    ${isPublic ? '- 대중교통 모드: 반드시 지하철역 출구에서 도보 5분(300m) 이내인 곳만 추천하세요. 구체적인 역 이름과 출구 번호를 명시하세요.' : '- 자차 모드: 주차가 매우 편리하거나 발렛이 가능한 곳 위주로 추천하세요.'}
    
    경로 최적화:
    - 모든 장소는 지리적으로 가까운 순서대로 배치하여 '최소 동선'을 보장하세요.
    
    반드시 다음의 마커 형식을 엄격히 지켜서 응답하세요:
    [TITLE] 여행 제목 (예: "20만원으로 끝내는 00역 껌딱지 여행")
    [DIFFICULTY] 1-100 (게으름 지수: 숫자가 높을수록 이동이 적고 편안함)
    [COMMENT] 전체적인 한 줄 평
    
    [DAY 1]
    [PLACE] 장소명
    [DESC] 이 장소가 게으른 사람에게 좋은 이유 설명
    [TIP] ${isPublic ? '가까운 역/정류장에서 가장 덜 걷는 경로' : '주차장 위치나 발렛 꿀팁'}
    [PHOTO] 1-5 (사진 스팟 지수 숫자)
    
    [PLACE] ... (다음 장소 반복)
    
    말투: "역 출구에서 넘어지면 코 닿을 데니까 걱정 마세요." 처럼 냉소적이고 웃기게.
  `;

  const prompt = `
    지역: ${req.region}
    인원: ${req.participants}
    일정: ${req.duration}
    성향: ${req.style}
    예산: ${req.budget}
    이동: ${req.transport}
    맛집 포함: ${req.includeFood ? '예' : '아니오'}
    게으름 강도: ${lazyDescription}
    ${req.location ? `현재 위치: 위도 ${req.location.latitude}, 경도 ${req.location.longitude}` : ''}
    
    위 조건에 맞춰 실제 장소들이 포함된 최단 거리 여행 코스를 짜줘.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
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

    const text = response.text || "코스를 생성할 수 없습니다.";
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
    console.error("Gemini API Error:", error);
    let message = "여행 코스를 불러오는 중 오류가 발생했습니다.";
    if (error.message?.includes("429")) message = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    throw new Error(message);
  }
};
