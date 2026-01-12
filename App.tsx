
import React, { useState, useEffect } from 'react';
import { Region, TravelStyle, TravelRequest, SavedTravel, GroundingLink, TransportMode, Duration, Budget, Participant } from './types';
import { generateTravelPlan, getNearbyRecommendations } from './services/geminiService';

const lazyLevelMap = ["살짝 귀찮음", "많이 귀찮음", "움직이면 사망", "침대와 합체", "영혼만 여행"];

const App: React.FC = () => {
  const [step, setStep] = useState<'home' | 'form' | 'loading' | 'result' | 'mypage'>('home');
  const [userLocation, setUserLocation] = useState<{ latitude: number, longitude: number } | undefined>();
  const [request, setRequest] = useState<TravelRequest>({
    region: Region.SEOUL,
    duration: Duration.DAY_TRIP,
    style: TravelStyle.HERMIT,
    budget: Budget.KRW_10,
    participants: Participant.SOLO,
    transport: TransportMode.PUBLIC,
    includeFood: true,
    lazinessLevel: 4
  });
  
  const [itinerary, setItinerary] = useState<any>(null);
  const [savedTravels, setSavedTravels] = useState<SavedTravel[]>([]);
  const [loadingMsg, setLoadingMsg] = useState("침대에서 일어나는 중...");

  // Modal / Recommendation states
  const [isPickingPlace, setIsPickingPlace] = useState(false);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [pickingTarget, setPickingTarget] = useState<{ dayIdx: number, activityIdx: number } | null>(null);

  // Drag and Drop State
  const [draggedItem, setDraggedItem] = useState<{ dayIdx: number, activityIdx: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ dayIdx: number, activityIdx: number } | null>(null);

  useEffect(() => {
    const data = localStorage.getItem('lazy_wander_v1');
    if (data) setSavedTravels(JSON.parse(data));

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => console.log("Geolocation permission denied", err)
      );
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lazy_wander_v1', JSON.stringify(savedTravels));
  }, [savedTravels]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('loading');
    const loadingTexts = ["구글 맵 데이터 분석 중...", "최단 동선 계산 중...", "가장 편한 소파 찾는 중..."];
    let i = 0;
    const interval = setInterval(() => setLoadingMsg(loadingTexts[++i % loadingTexts.length]), 2500);
    
    try {
      const result = await generateTravelPlan({ ...request, location: userLocation });
      const parsed = parseResult(result.text, result.links);
      setItinerary(parsed);
      setStep('result');
      window.scrollTo(0, 0);
    } catch (err: any) {
      alert(err.message);
      setStep('form');
    } finally {
      clearInterval(interval);
    }
  };

  const parseResult = (text: string, links: GroundingLink[]) => {
    const cleanText = text.replace(/google_maps\(.*?\)/g, '').replace(/```.*?```/g, '');
    
    const title = cleanText.match(/\[TITLE\]\s*(.*)/)?.[1] || "무제의 여정";
    const stars = parseInt(cleanText.match(/\[STARS\]\s*(\d+)/)?.[1] || "5");
    const steps = parseInt(cleanText.match(/\[STEPS\]\s*(\d+)/)?.[1] || "4000");
    const movements = parseInt(cleanText.match(/\[MOVEMENTS\]\s*(\d+)/)?.[1] || "3");
    const indoor = parseInt(cleanText.match(/\[INDOOR\]\s*(\d+)/)?.[1] || "70");
    const comment = cleanText.match(/\[COMMENT\]\s*(.*)/)?.[1] || "귀찮지만 이 정도면 갈 만 합니다.";

    const days: any[] = [];
    const dayBlocks = cleanText.split(/\[DAY\s*(\d+)\]/);
    
    for (let i = 1; i < dayBlocks.length; i += 2) {
      const dayNum = dayBlocks[i];
      const dayContent = dayBlocks[i + 1];
      const activities: any[] = [];
      
      const placeBlocks = dayContent.split(/\[PLACE\]/);
      
      placeBlocks.forEach(block => {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) return;

        const lines = trimmedBlock.split('\n');
        const name = lines[0].replace(/\[.*\]/g, '').trim();
        
        if (!name || name.length < 2) return;

        const latLngMatch = block.match(/\[LATLNG\]\s*([\d.-]+)\s*,\s*([\d.-]+)/);
        const lat = latLngMatch?.[1] || "";
        const lng = latLngMatch?.[2] || "";

        const desc = block.match(/\[DESC\]\s*([\s\S]*?)(?=\[|$)/)?.[1]?.trim() || "";
        const tip = block.match(/\[TIP\]\s*([\s\S]*?)(?=\[|$)/)?.[1]?.trim() || "";
        
        const mapLink = links.find(l => 
          name.toLowerCase().includes(l.title.toLowerCase()) || 
          l.title.toLowerCase().includes(name.toLowerCase())
        );
        activities.push({ 
          id: Math.random().toString(36).substr(2, 9),
          name, lat, lng, desc, tip, mapLink 
        });
      });

      if (activities.length > 0) {
        days.push({ day: dayNum, activities });
      }
    }

    const totalActivities = days.reduce((acc, d) => acc + d.activities.length, 0);

    return { 
      title, stars, steps, movements, indoor, comment, days, 
      initialActivityCount: totalActivities,
      initialSteps: steps,
      initialIndoor: indoor
    };
  };

  // 통계 재계산 함수
  const recalculateStats = (currentItinerary: any) => {
    const totalActivities = currentItinerary.days.reduce((acc: number, d: any) => acc + d.activities.length, 0);
    const initialCount = currentItinerary.initialActivityCount || totalActivities;
    
    // 이동 횟수는 장소 수에 비례 (장소 - 1 or 장소 수 그대로 사용)
    const newMovements = totalActivities;
    
    // 예상 걸음수는 장소 수에 비례하여 조정
    const stepPerPlace = currentItinerary.initialSteps / initialCount;
    const newSteps = Math.round(stepPerPlace * totalActivities);
    
    // 실내 비중은 크게 변하지 않으나 장소 수에 따라 미세 조정 (가정)
    const newIndoor = currentItinerary.initialIndoor;

    return {
      ...currentItinerary,
      movements: newMovements,
      steps: newSteps,
      indoor: newIndoor
    };
  };

  const handleDragStart = (dayIdx: number, activityIdx: number) => {
    setDraggedItem({ dayIdx, activityIdx });
  };

  const handleDragEnter = (dayIdx: number, activityIdx: number) => {
    setDragOverItem({ dayIdx, activityIdx });
  };

  const handleDrop = (dayIdx: number, activityIdx: number) => {
    if (!draggedItem || draggedItem.dayIdx !== dayIdx) return;
    const fromIdx = draggedItem.activityIdx;
    const toIdx = activityIdx;
    
    const newItinerary = { ...itinerary };
    const activities = [...newItinerary.days[dayIdx].activities];
    const [removed] = activities.splice(fromIdx, 1);
    activities.splice(toIdx, 0, removed);
    newItinerary.days[dayIdx].activities = activities;
    
    setItinerary(newItinerary);
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleMoveActivity = (dayIdx: number, fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= itinerary.days[dayIdx].activities.length) return;
    const newItinerary = { ...itinerary };
    const activities = [...newItinerary.days[dayIdx].activities];
    const [removed] = activities.splice(fromIdx, 1);
    activities.splice(toIdx, 0, removed);
    newItinerary.days[dayIdx].activities = activities;
    setItinerary(newItinerary);
  };

  const handleDeleteActivity = (dayIdx: number, activityIdx: number) => {
    if (!confirm("이 여행지 카드를 여정에서 삭제하시겠습니까?\n삭제 시 예상 걸음수와 이동 횟수가 재계산됩니다.")) return;
    
    const newItinerary = { ...itinerary };
    // 해당 날짜의 활동 배열에서 삭제
    newItinerary.days[dayIdx].activities.splice(activityIdx, 1);
    
    // 만약 해당 날짜에 활동이 하나도 남지 않는다면 (선택적: 날짜 유지 혹은 삭제)
    // 여기서는 통계 재계산을 위해 itinerary 업데이트
    const updatedItinerary = recalculateStats(newItinerary);
    setItinerary(updatedItinerary);
  };

  const openPlacePicker = async (dayIdx: number, activityIdx: number, lat: string, lng: string) => {
    setPickingTarget({ dayIdx, activityIdx });
    setIsPickingPlace(true);
    setIsLoadingRecs(true);
    try {
      const recs = await getNearbyRecommendations(lat, lng);
      setRecommendations(recs);
    } catch (e) {
      alert("추천 정보를 가져오는 데 실패했습니다.");
    } finally {
      setIsLoadingRecs(false);
    }
  };

  const handleAddPlace = (place: any) => {
    if (!pickingTarget) return;
    const { dayIdx, activityIdx } = pickingTarget;
    const newItinerary = { ...itinerary };
    const newActivity = {
      ...place,
      id: Math.random().toString(36).substr(2, 9),
      mapLink: { title: place.name, uri: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}` }
    };
    newItinerary.days[dayIdx].activities.splice(activityIdx + 1, 0, newActivity);
    
    // 추가 시에도 통계 재계산
    const updatedItinerary = recalculateStats(newItinerary);
    setItinerary(updatedItinerary);
    setIsPickingPlace(false);
  };

  const savePlan = () => {
    if (!itinerary) return;
    const newSave: SavedTravel = {
      id: Date.now().toString(),
      title: itinerary.title,
      content: JSON.stringify(itinerary),
      links: [],
      savedAt: new Date().toLocaleDateString(),
      region: request.region,
      totalDifficulty: 90
    };
    setSavedTravels([newSave, ...savedTravels]);
    alert("보관함에 저장되었습니다.");
  };

  const deleteSavedPlan = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("이 저장된 여정을 삭제하시겠습니까?")) {
      setSavedTravels(prev => prev.filter(t => t.id !== id));
    }
  };

  const SectionTitle = ({ num, text }: { num: string, text: string }) => (
    <h3 className="text-xl font-black flex items-center gap-3 mb-4">
      <span className="w-7 h-7 bg-brand-900 text-white rounded-full flex items-center justify-center text-xs">{num}</span>
      {text}
    </h3>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="glass fixed top-0 w-full z-50 h-20 flex items-center justify-between px-6 max-w-2xl mx-auto left-0 right-0">
        <div onClick={() => setStep('home')} className="flex items-center gap-2 cursor-pointer">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center text-white">
            <span className="material-symbols-rounded">king_bed</span>
          </div>
          <span className="font-black text-lg tracking-tighter text-brand-900">귀찮행</span>
        </div>
        <button onClick={() => setStep('mypage')} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors">
          <span className="material-symbols-rounded">folder_special</span>
        </button>
      </nav>

      <main className="flex-1 pt-28 pb-10 px-6 max-w-2xl mx-auto w-full">
        {step === 'home' && (
          <div className="fade-in-up space-y-10 py-10 text-center">
            <div className="relative rounded-[3rem] overflow-hidden aspect-video shadow-2xl bg-white group">
              <img src="https://images.unsplash.com/photo-1542128962-9d50ad7bf714?q=80&w=2070&auto=format&fit=crop" className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 flex flex-col justify-center items-center p-8 text-[#00A980] bg-white/70">
                <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4">귀찮은 당신을 위한<br/>진짜 여행 설계</h1>
                <p className="text-lg text-gray-700 font medium">가장 적게 걷고, 가장 많이 쉬는 법</p>
              </div>
            </div>
            <button onClick={() => setStep('form')} className="w-full py-8 bg-[#00A980]/90 text-white rounded-[2.5rem] font-bold text-xl shadow-md hover:bg-[#00A980] transition-all">
              여정 설계 시작하기
            </button>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="fade-in-up space-y-12 pb-20">
            {/* Form sections (omitted for brevity but kept in actual implementation) */}
            <section><SectionTitle num="1" text="일정 & 이동" />
              <div className="grid grid-cols-3 gap-3 mb-3">
                {Object.values(Duration).map(d => (
                  <button key={d} type="button" onClick={()=>setRequest({...request, duration:d})} className={`p-4 rounded-3xl border-2 text-sm font-bold transition-all ${request.duration === d ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-100' : 'border-slate-100 bg-white text-slate-400 hover:border-brand-200'}`}>{d}</button>
                ))}
              </div>
              <div className="border-t border-[#00A980]/20 my-4">
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.values(TransportMode).map(m => (
                  <button key={m} type="button" onClick={()=>setRequest({...request, transport:m})} className={`p-4 rounded-3xl border-2 text-sm font-bold flex items-center justify-center gap-2 ${request.transport === m ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-100 bg-white text-slate-400 hover:border-brand-200'}`}>
                    <span className="material-symbols-rounded text-lg">{m.includes('자차') ? 'directions_car' : 'subway'}</span>
                    {m.split(' ')[0]}
                  </button>
                ))}
              </div>
            </section>
            <section><SectionTitle num="2" text="여행 인원" />
              <div className="grid grid-cols-3 gap-3">
                {Object.values(Participant).map(p => (
                  <button key={p} type="button" onClick={()=>setRequest({...request, participants:p})} className={`p-4 rounded-3xl border-2 text-sm font-bold ${request.participants === p ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-100' : 'border-slate-100 bg-white text-slate-400 hover:border-brand-200'}`}>{p.split(' ')[0]}</button>
                ))}
              </div>
            </section>
            <section><SectionTitle num="3" text="목적지" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.values(Region).map(r => (
                  <button key={r} type="button" onClick={()=>setRequest({...request, region:r})} className={`p-3 rounded-2xl border-2 text-xs font-black transition-all ${request.region === r ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-100 bg-white text-slate-400 hover:border-brand-200'}`}>{r.split(' ')[0]}</button>
                ))}
              </div>
            </section>
            <section><SectionTitle num="4" text="예산" />
              <div className="grid grid-cols-2 gap-3">
                {Object.values(Budget).map(b => (
                  <button key={b} type="button" onClick={()=>setRequest({...request, budget:b})} className={`p-4 rounded-3xl border-2 text-sm font-bold ${request.budget === b ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-100' : 'border-slate-100 bg-white text-slate-400 hover:border-brand-200'}`}>{b}</button>
                ))}
              </div>
            </section>
            <section><SectionTitle num="5" text="맛집 포함 여부" />
              <button type="button" onClick={()=>setRequest({...request, includeFood:!request.includeFood})} className={`w-full p-6 rounded-4xl border-2 flex items-center justify-between transition-all ${request.includeFood ? 'border-brand-500 bg-brand-50 text-brand-500' : 'border-slate-100 text-slate-400 hover:border-brand-200'}`}>
                <span className="font-black">네, 맛있는 건 포기 못 해요</span>
                <span className="material-symbols-rounded text-3xl">{request.includeFood ? 'check_circle' : 'radio_button_unchecked'}</span>
              </button>
            </section>
            <section className="space-y-6">
              <SectionTitle num="6" text="귀찮행 여행 스타일" />
              <div className="p-8 bg-slate-50 rounded-5xl border border-slate-100 space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-start font-black text-sm text-slate-600">
                    <span>귀찮음 정도</span>
                    <div className="text-right">
                      <span className="text-brand-500 text-lg">Lv.{request.lazinessLevel}</span>
                      <p className="text-[11px] font-bold text-brand-500/80 mt-0.5">{lazyLevelMap[request.lazinessLevel - 1]}</p>
                    </div>
                  </div>
                  <input type="range" min="1" max="5" step="1" value={request.lazinessLevel} onChange={(e)=>setRequest({...request, lazinessLevel:parseInt(e.target.value)})} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-500" />
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {Object.values(TravelStyle).map(s => (
                    <button key={s} type="button" onClick={()=>setRequest({...request, style:s})} className={`p-4 rounded-2xl border-2 text-left text-xs font-bold transition-all ${request.style === s ? 'border-brand-900 bg-brand-900 text-white' : 'border-white bg-white text-slate-400 hover:border-brand-200'}`}>{s}</button>
                  ))}
                </div>
              </div>
            </section>

            <button type="submit" className="w-full py-10 bg-brand-500 text-white rounded-[3rem] font-black text-2xl shadow-2xl shadow-brand-100 hover:scale-[1.02] active:scale-[0.98] transition-all">최소 동선 계산하기</button>
          </form>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-32 space-y-8 fade-in-up">
            <div className="w-32 h-32 bg-brand-100 rounded-5xl flex items-center justify-center animate-bounce shadow-2xl">
              <span className="material-symbols-rounded text-6xl text-brand-500">airline_seat_recline_extra</span>
            </div>
            <h2 className="text-2xl font-black text-center px-10">{loadingMsg}</h2>
          </div>
        )}

        {step === 'result' && itinerary && (
          <div className="fade-in-up space-y-12 pb-20">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100">
                   <span className="material-symbols-rounded text-slate-500">edit_note</span>
                </div>
                <h2 className="text-2xl font-black text-brand-900 tracking-tight">여정 한방에 끝내기</h2>
              </div>
            </div>

            {/* Travel Summary & Difficulty Card (Recalculated) */}
            <div className="lazy-card p-10 space-y-10">
              <div className="flex justify-between items-start">
                <h2 className="text-3xl font-black leading-tight text-brand-900 max-w-[75%]">{itinerary.title}</h2>
                <div className="flex gap-0.5 text-brand-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="material-symbols-rounded text-2xl" style={{ fontVariationSettings: `'FILL' ${i < itinerary.stars ? 1 : 0}` }}>star</span>
                  ))}
                </div>
              </div>
              
              <div className="space-y-6">
                <p className="text-slate-500 font-medium leading-relaxed">
                  {itinerary.comment}
                </p>
                
                <div className="border-t border-slate-100 pt-10">
                  <div className="grid grid-cols-3 text-center items-center">
                    <div className="space-y-4">
                      <div className="w-full flex justify-center">
                        <span className="material-symbols-rounded text-brand-500 text-3xl">footprint</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400">예상 걸음</p>
                        <p className="text-xl font-black text-brand-900">{Number(itinerary.steps).toLocaleString()}보</p>
                      </div>
                    </div>
                    <div className="space-y-4 border-x border-slate-100">
                      <div className="w-full flex justify-center">
                        <span className="material-symbols-rounded text-brand-500 text-3xl">near_me</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400">이동 횟수</p>
                        <p className="text-xl font-black text-brand-900">{itinerary.movements}회</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="w-full flex justify-center">
                        <span className="material-symbols-rounded text-brand-500 text-3xl">grid_view</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400">실내 비중</p>
                        <p className="text-xl font-black text-brand-900">{itinerary.indoor}%</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-4">
                   {itinerary.days.flatMap((d:any) => d.activities).slice(0, 4).map((act: any, idx: number) => (
                     <span key={act.id || idx} className="bg-slate-50 text-slate-500 px-4 py-2 rounded-full text-xs font-bold border border-slate-100">
                        {act.name}
                     </span>
                   ))}
                </div>
              </div>
            </div>

            <div className="space-y-12">
              {itinerary.days.map((day: any, dIdx: number) => (
                <div key={day.day} className="space-y-6">
                  <h3 className="text-2xl font-black text-brand-900 px-2 flex items-center gap-2">
                    <span className="material-symbols-rounded">calendar_today</span> Day {day.day}
                  </h3>
                  <div className="grid gap-8">
                    {day.activities.map((act: any, aIdx: number) => (
                      <React.Fragment key={act.id}>
                        <div 
                          className={`lazy-card p-8 space-y-4 relative group transition-all ${draggedItem?.activityIdx === aIdx && draggedItem?.dayIdx === dIdx ? 'opacity-20 scale-95 ring-4 ring-brand-500/20' : 'opacity-100'} ${dragOverItem?.activityIdx === aIdx && dragOverItem?.dayIdx === dIdx ? 'border-brand-500 border-2' : 'border-slate-100'}`}
                          draggable
                          onDragStart={() => handleDragStart(dIdx, aIdx)}
                          onDragEnter={() => handleDragEnter(dIdx, aIdx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop(dIdx, aIdx)}
                        >
                          {/* Floating Controls */}
                          <div className="absolute top-4 right-4 flex gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={()=>handleMoveActivity(dIdx, aIdx, aIdx-1)} 
                              disabled={aIdx === 0} 
                              className="w-10 h-10 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30"
                              title="위로 이동"
                            >
                              <span className="material-symbols-rounded text-slate-500">arrow_upward</span>
                            </button>
                            <button 
                              onClick={()=>handleMoveActivity(dIdx, aIdx, aIdx+1)} 
                              disabled={aIdx === day.activities.length-1} 
                              className="w-10 h-10 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30"
                              title="아래로 이동"
                            >
                              <span className="material-symbols-rounded text-slate-500">arrow_downward</span>
                            </button>
                            <button 
                              onClick={(e)=>{ e.stopPropagation(); handleDeleteActivity(dIdx, aIdx); }} 
                              className="w-10 h-10 rounded-full bg-red-500 shadow-lg border border-red-600 flex items-center justify-center hover:bg-red-600 transition-all transform hover:scale-110"
                              title="이 카드 삭제"
                            >
                              <span className="material-symbols-rounded text-white">delete</span>
                            </button>
                          </div>

                          <div className="flex justify-between items-start gap-4 pr-32">
                            <h4 className="text-2xl font-black leading-tight text-brand-900">{act.name}</h4>
                            {act.mapLink && (
                              <a href={act.mapLink.uri} target="_blank" rel="noreferrer" className="shrink-0 bg-brand-50 text-brand-500 px-4 py-2 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-brand-100 transition-colors">
                                <span className="material-symbols-rounded text-sm">location_on</span> 구글맵
                              </a>
                            )}
                          </div>
                          
                          <p className="text-slate-600 font-medium leading-relaxed">{act.desc}</p>
                          {act.tip && (
                            <div className="bg-slate-50 p-4 rounded-2xl text-xs font-bold text-slate-400 flex items-center gap-2">
                              <span className="material-symbols-rounded text-sm">lightbulb</span> {act.tip}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex justify-center -my-4 relative z-10">
                          <button 
                            onClick={() => openPlacePicker(dIdx, aIdx, act.lat, act.lng)}
                            className="w-12 h-12 bg-brand-500 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
                            title="주변 장소 추가"
                          >
                            <span className="material-symbols-rounded text-3xl">add</span>
                          </button>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-10 relative">  {/* 공유하기 아이콘 버튼 */}
              <button onClick={handleCopyUrl} className="absolute -top-4 right-2 w-12 h-12 rounded-full bg-white text-[#00A980] border border-[#00A980]/30 shadow-md hover:bg-[#00A980]/10 transition-all flex items-center justify-center"
              aria-label="공유하기">
              type="button">
              <span className="material-symbols-rounded text-xl">share</span> </button>
            <div className="pt-10 grid grid-cols-2 gap-4">
              <button onClick={savePlan} className="py-6 bg-brand-500 text-white rounded-3xl font-black text-lg flex items-center justify-center gap-2 shadow-xl shadow-brand-100 hover:bg-brand-600 transition-colors "type="button">저장하기</button>
              <button onClick={() => setStep('form')} className="py-6 bg-brand-900 text-white rounded-3xl font-black text-lg flex items-center justify-center gap-2 hover:bg-black transition-colors" type="button"> 새 여정 설계</button>
            </div>
          </div>
        )}

        {/* Modal and Mypage omitted for brevity but remain in real implementation */}
        {isPickingPlace && (
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden fade-in-up">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="space-y-1">
                  <h3 className="font-black text-2xl text-brand-900">주변 추천 장소</h3>
                  <p className="text-xs font-bold text-slate-400">귀차니스트를 위한 최단 거리 스팟</p>
                </div>
                <button onClick={() => setIsPickingPlace(false)} className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors">
                  <span className="material-symbols-rounded text-2xl text-slate-400">close</span>
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                {isLoadingRecs ? (
                  <div className="py-24 text-center space-y-4">
                    <div className="animate-spin w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full mx-auto"></div>
                    <p className="font-black text-slate-400">귀찮음을 무릅쓰고 찾는 중...</p>
                  </div>
                ) : recommendations.length > 0 ? (
                  recommendations.map((rec, i) => (
                    <div 
                      key={i} 
                      onClick={() => handleAddPlace(rec)}
                      className="p-6 border-2 border-slate-50 rounded-[2rem] hover:border-brand-500 cursor-pointer group transition-all hover:bg-brand-50"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-black text-xl group-hover:text-brand-500 text-brand-900">{rec.name}</h4>
                        <span className="material-symbols-rounded text-brand-500 opacity-0 group-hover:opacity-100 transform scale-125">add_circle</span>
                      </div>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed mb-4">{rec.desc}</p>
                      <div className="bg-white p-4 rounded-2xl text-[11px] font-bold text-slate-500 flex items-center gap-2 border border-slate-100 shadow-sm">
                        <span className="material-symbols-rounded text-brand-500 text-sm">lightbulb</span> {rec.tip}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center text-slate-400 font-black">근처에 추천할 장소가 없습니다.</div>
                )}
              </div>
            </div>
          </div>
        )}
        {step === 'mypage' && (
          <div className="fade-in-up space-y-10">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-3xl font-black text-brand-900">저장된 여정</h2>
              <button onClick={() => setStep('home')} className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors">
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>
            {savedTravels.length === 0 ? (
              <div className="py-20 text-center space-y-4 bg-slate-50 rounded-5xl border-2 border-dashed border-slate-200">
                <span className="material-symbols-rounded text-5xl text-slate-200">inbox</span>
                <p className="text-slate-400 font-bold">비어있습니다. 하나 짜보세요!</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {savedTravels.map(t => (
                  <div key={t.id} onClick={() => { setItinerary(JSON.parse(t.content)); setStep('result'); window.scrollTo(0, 0); }} className="lazy-card p-6 cursor-pointer group relative flex items-center gap-4">
                    <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center text-brand-500 shrink-0">
                      <span className="material-symbols-rounded">map</span>
                    </div>
                    <div className="flex-1 min-w-0 pr-10">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-brand-100 text-brand-500 px-2 py-0.5 rounded text-[9px] font-black">{t.region.split(' ')[0]}</span>
                        <span className="text-slate-400 text-[10px]">{t.savedAt}</span>
                      </div>
                      <h3 className="text-lg font-black group-hover:text-brand-500 transition-colors truncate text-brand-900">{t.title}</h3>
                    </div>
                    <button onClick={(e) => deleteSavedPlan(t.id, e)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-400 transition-colors">
                      <span className="material-symbols-rounded text-lg">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
