
import { GoogleGenAI, Type } from "@google/genai";
import { TravelRequest, TravelResultContent, TransportMode, Region } from "../types";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateTravelPlan = async (req: TravelRequest, retryCount = 0): Promise<TravelResultContent> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const lazyLevelMap = ["살짝 귀찮음", "많이 귀찮음", "움직이면 사망", "침대와 합체", "영혼만 여행"];
  const lazyDescription = lazyLevelMap[req.lazinessLevel - 1];

  const systemInstruction = `
    당신은 여행을 극도로 싫어하는 사람들을 위한 '냉소적이고 위트 있는' 여행 가이드입니다.
    사용자의 게으름 강도: ${lazyDescription} (Lv.${req.lazinessLevel})
    컨셉: '최소 동선', '노 웨이팅', '한 번의 셔터로 인스타 박제'.
    
    절대 규칙:
    1. Google Maps 도구를 사용하여 실제 장소 정보를 확인하세요.
    2. 'google_maps(query=...)' 또는 '\` \` \`python' 블록과 같은 내부 실행 코드를 절대 응답에 포함하지 마세요.
    3. 오직 아래의 [TAG] 형식으로만 응답하세요.
    
    조건:
    - 지역: ${req.region}
    - 인원: ${req.participants}
    - 일정: ${req.duration}
    - 예산: ${req.budget}
    - 이동 수단: ${req.transport}
    - 맛집: ${req.includeFood ? '유명 맛집 필수' : '카페나 편의점 선호'}
    
    응답 형식:
    [TITLE] 여행 제목
    [STARS] 1~5 (게으른 사람에게 추천하는 정도)
    [STEPS] 예상 도보 수 (숫자만, 예: 3500)
    [MOVEMENTS] 총 이동 횟수 (숫자만, 예: 2)
    [INDOOR] 실내 비중 (숫자만, 예: 75)
    [COMMENT] 냉소적인 총평
    
    [DAY 1]
    [PLACE] 장소명
    [LATLNG] 위도, 경도 (예: 37.5665, 126.9780)
    [DESC] 귀차니스트에게 좋은 이유
    [TIP] 최소 동선 꿀팁
    ...
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${req.region} 지역의 최단 거리 여행 코스를 [TAG] 형식으로 짜줘. 모든 [PLACE]에 대해 정확한 [LATLNG]를 포함해줘.`,
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

    let textRaw = response.text || "데이터를 가져오지 못했습니다.";
    
    const text = textRaw
      .replace(/google_maps\(.*?\)/g, '')
      .replace(/```python[\s\S]*?```/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .trim();

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
    if (error.message?.includes('503') && retryCount < 2) {
      await sleep(2000 * (retryCount + 1));
      return generateTravelPlan(req, retryCount + 1);
    }
    throw new Error(error?.message || "AI 호출 중 오류가 발생했습니다.");
  }
};

export const getNearbyRecommendations = async (lat: string, lng: string): Promise<any[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `위도 ${lat}, 경도 ${lng} 주변 500m 이내의 '귀차니스트'가 좋아할 만한 장소 5곳을 추천해줘. 이동 거리가 최소화되어야 함.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            lat: { type: Type.STRING },
            lng: { type: Type.STRING },
            desc: { type: Type.STRING },
            tip: { type: Type.STRING }
          },
          required: ["name", "lat", "lng", "desc", "tip"]
        }
      }
    }
  });
  
  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return [];
  }
};
