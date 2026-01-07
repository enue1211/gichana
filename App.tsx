
import React, { useState, useEffect, useMemo } from 'react';
import { Region, TravelStyle, TravelRequest, SavedTravel, GroundingLink, TransportMode, Duration, Budget } from './types';
import { generateTravelPlan } from './services/geminiService';

const parseResult = (text: string, links: GroundingLink[]) => {
  const title = text.match(/\[TITLE\]\s*(.*)/)?.[1] || "무제의 게으른 여정";
  const difficulty = parseInt(text.match(/\[DIFFICULTY\]\s*(\d+)/)?.[1] || "80");
  const comment = text.match(/\[COMMENT\]\s*(.*)/)?.[1] || "귀찮지만 갈 만은 합니다.";

  const days: any[] = [];
  const dayBlocks = text.split(/\[DAY\s*(\d+)\]/);
  
  for (let i = 1; i < dayBlocks.length; i += 2) {
    const dayNum = dayBlocks[i];
    const dayContent = dayBlocks[i + 1];
    const activities: any[] = [];
    
    const placeBlocks = dayContent.split(/\[PLACE\]/);
    placeBlocks.forEach(block => {
      if (!block.trim()) return;
      const name = block.match(/^\s*(.*)/)?.[1]?.trim() || "";
      const desc = block.match(/\[DESC\]\s*([\s\S]*?)(?=\[|$)/)?.[1]?.trim() || "";
      const tip = block.match(/\[TIP\]\s*([\s\S]*?)(?=\[|$)/)?.[1]?.trim() || "";
      const photo = parseInt(block.match(/\[PHOTO\]\s*(\d+)/)?.[1] || "3");
      
      const mapLink = links.find(l => name.includes(l.title) || l.title.includes(name));
      
      activities.push({ name, desc, tip, photo, mapLink });
    });
    
    days.push({ day: dayNum, activities });
  }

  return { title, difficulty, comment, days };
};

const App: React.FC = () => {
  const [step, setStep] = useState<'home' | 'form' | 'loading' | 'result' | 'mypage'>('home');
  const [request, setRequest] = useState<TravelRequest>({
    region: Region.SEOUL,
    duration: Duration.ONE_NIGHT,
    style: TravelStyle.HERMIT,
    budget: Budget.KRW_20,
    transport: TransportMode.PUBLIC,
    includeFood: true
  });
  const [rawResult, setRawResult] = useState<{ text: string, links: GroundingLink[] } | null>(null);
  const [savedTravels, setSavedTravels] = useState<SavedTravel[]>([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const parsedData = useMemo(() => {
    if (!rawResult) return null;
    return parseResult(rawResult.text, rawResult.links);
  }, [rawResult]);

  // Generate a multi-point route URL for Google Maps
  const googleMapsRouteUrl = useMemo(() => {
    if (!parsedData || parsedData.days.length === 0) return null;
    
    const allPlaces = parsedData.days.flatMap(d => d.activities.map((a: any) => a.name));
    if (allPlaces.length < 2) return null;
    
    const origin = encodeURIComponent(allPlaces[0]);
    const destination = encodeURIComponent(allPlaces[allPlaces.length - 1]);
    const waypoints = allPlaces.slice(1, -1).map(p => encodeURIComponent(p)).join('|');
    
    const travelMode = request.transport === TransportMode.PUBLIC ? 'transit' : 'driving';
    
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=${travelMode}`;
  }, [parsedData, request.transport]);

  useEffect(() => {
    const data = localStorage.getItem('lazy_travel_v5');
    if (data) {
      try { setSavedTravels(JSON.parse(data)); } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lazy_travel_v5', JSON.stringify(savedTravels));
  }, [savedTravels]);

  const reset = () => {
    setStep('home');
    setRawResult(null);
  };

  const requestLocation = () => {
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRequest({ ...request, location: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } });
        setIsLoadingLocation(false);
      },
      () => {
        alert("위치를 가져올 수 없습니다.");
        setIsLoadingLocation(false);
      }
    );
  };

  const handleSave = () => {
    if (!parsedData || !rawResult) return;
    if (savedTravels.some(t => t.title === parsedData.title)) {
      alert("이미 저장된 코스입니다.");
      return;
    }

    const newSave: SavedTravel = {
      id: Date.now().toString(),
      title: parsedData.title,
      content: rawResult.text,
      links: rawResult.links,
      savedAt: new Date().toLocaleDateString('ko-KR'),
      region: request.region,
      totalDifficulty: parsedData.difficulty,
      transport: request.transport,
      duration: request.duration,
      budget: request.budget
    };

    setSavedTravels([newSave, ...savedTravels]);
    alert("저장되었습니다!");
  };

  const deleteSaved = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("삭제하시겠습니까?")) setSavedTravels(savedTravels.filter(t => t.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('loading');
    try {
      const data = await generateTravelPlan(request);
      setRawResult(data);
      setStep('result');
    } catch (err) {
      alert("생성 실패");
      setStep('form');
    }
  };

  // Helper for laziness level visualization
  const getLazinessInfo = (score: number) => {
    if (score >= 90) return { label: '침대 합일 수준', color: 'bg-indigo-500', emoji: '💤' };
    if (score >= 70) return { label: '진정한 귀차니스트', color: 'bg-orange-500', emoji: '🛋️' };
    if (score >= 40) return { label: '적당한 게으름', color: 'bg-yellow-500', emoji: '🚶' };
    return { label: '거의 극기훈련', color: 'bg-red-500', emoji: '🏃' };
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-20 font-sans">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter text-slate-900 cursor-pointer flex items-center gap-2" onClick={reset}>
            <span className="text-orange-500 bg-orange-100 p-1.5 rounded-xl">LG</span> 귀차니스트
          </h1>
          <button onClick={() => setStep('mypage')} className={`text-sm font-bold px-4 py-2 rounded-full transition-all ${step === 'mypage' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
             저장함
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-8">
        {step === 'home' && (
          <div className="text-center py-12 space-y-10 animate-in fade-in duration-700">
            <div className="relative group overflow-hidden rounded-[3rem] shadow-2xl aspect-[4/5] sm:aspect-video">
              <img src="https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?q=80&w=2060&auto=format&fit=crop" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent flex items-end p-10 text-left">
                <div className="space-y-4">
                  <div className="inline-flex gap-2">
                    <span className="bg-orange-500 text-white text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest">Minimal Effort</span>
                    <span className="bg-white/20 backdrop-blur-sm text-white text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest">Maps Integrated</span>
                  </div>
                  <h2 className="text-4xl font-black text-white leading-tight">집엔 가고 싶지만<br/><span className="text-orange-400">여행 온 티</span>는 내야 할 때.</h2>
                  <p className="text-slate-300 font-medium text-lg leading-snug">사람 많으면 바로 포기하세요.<br/>당신의 예산과 일정에 딱 맞는 <br/>최소 이동 코스를 구글 맵 위에 그려드립니다.</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <button onClick={() => setStep('form')} className="w-full bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black text-xl hover:bg-orange-600 transition-all shadow-2xl hover:scale-[1.02] active:scale-95">
                그래도 코스 짜기
              </button>
            </div>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 space-y-8">
              
              <section className="space-y-4">
                <h3 className="font-black text-slate-400 text-xs uppercase tracking-[0.2em] px-1">1. 일정 & 이동</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl">
                    {Object.values(Duration).map((d) => (
                      <button key={d} type="button" onClick={() => setRequest({ ...request, duration: d })}
                        className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs transition-all ${request.duration === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl">
                    {Object.values(TransportMode).map((m) => (
                      <button key={m} type="button" onClick={() => setRequest({ ...request, transport: m })}
                        className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${request.transport === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}>
                        <i className={`fa-solid ${m.includes('자차') ? 'fa-car' : 'fa-train-subway'}`}></i>
                        {m.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="font-black text-slate-400 text-xs uppercase tracking-[0.2em] px-1">2. 예산 & 맛집</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-4 gap-2 p-1.5 bg-slate-100 rounded-2xl">
                    {Object.values(Budget).map((b) => (
                      <button key={b} type="button" onClick={() => setRequest({ ...request, budget: b })}
                        className={`py-3 px-1 rounded-xl font-bold text-[10px] transition-all ${request.budget === b ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}>
                        {b}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setRequest({ ...request, includeFood: !request.includeFood })}
                    className={`flex items-center justify-center gap-3 p-5 rounded-2xl border-2 font-black transition-all ${request.includeFood ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-slate-100 text-slate-400'}`}>
                    <i className="fa-solid fa-utensils"></i>
                    {request.includeFood ? "전설의 맛집 반드시 포함" : "먹는 건 대충 때울래요"}
                  </button>
                </div>
              </section>

              <section className="space-y-4">
                 <h3 className="font-black text-slate-400 text-xs uppercase tracking-[0.2em] px-1">3. 목적지</h3>
                 <div className="grid grid-cols-2 gap-3">
                    {Object.values(Region).map((r) => (
                      <button key={r} type="button" onClick={() => setRequest({ ...request, region: r })}
                        className={`p-4 rounded-2xl border-2 text-left transition-all ${request.region === r ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-md scale-[1.02]' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'}`}>
                        <p className="font-bold text-sm leading-tight">{r}</p>
                      </button>
                    ))}
                 </div>
              </section>

              <section className="space-y-4">
                <h3 className="font-black text-slate-400 text-xs uppercase tracking-[0.2em] px-1">4. 당신의 상태</h3>
                <div className="space-y-2">
                  {Object.values(TravelStyle).map((s) => (
                    <button key={s} type="button" onClick={() => setRequest({ ...request, style: s })}
                      className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${request.style === s ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'}`}>
                      <span className="font-bold text-sm">{s}</span>
                      {request.style === s && <i className="fa-solid fa-chevron-right text-orange-500"></i>}
                    </button>
                  ))}
                </div>
              </section>

              <button type="button" onClick={requestLocation} disabled={isLoadingLocation}
                className={`w-full p-5 rounded-2xl border-2 flex items-center justify-center gap-3 font-black transition-all ${request.location ? 'bg-orange-50 border-orange-500 text-orange-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                <i className={`fa-solid ${isLoadingLocation ? 'fa-spinner animate-spin text-orange-500' : 'fa-location-crosshairs'}`}></i>
                {request.location ? "내 위치 기반 활성화됨" : "내 위치 주변으로 추천받기"}
              </button>
            </div>

            <button type="submit" className="w-full bg-orange-500 text-white p-6 rounded-[2rem] font-black text-xl shadow-2xl shadow-orange-200 hover:bg-orange-600 hover:scale-[1.02] active:scale-95 transition-all">
              에너지 0% 여행 코스 받기
            </button>
          </form>
        )}

        {step === 'loading' && (
          <div className="text-center py-40 space-y-8">
            <div className="text-8xl animate-bounce drop-shadow-2xl">💤</div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900">지도를 펴고 경로 탐색 중...</h2>
              <p className="text-slate-400 font-medium">
                {request.budget} 예산에 맞춰 동선을 최적화하고 있어요.
              </p>
            </div>
            <div className="max-w-[200px] mx-auto bg-slate-200 h-2 rounded-full overflow-hidden">
              <div className="bg-orange-500 h-full w-1/3 animate-[loading_1.5s_infinite]"></div>
            </div>
          </div>
        )}

        {step === 'mypage' && (
          <div className="space-y-8 animate-in slide-in-from-right-4 duration-500 pb-20">
            <div className="flex items-end justify-between px-2">
              <div>
                <h2 className="text-3xl font-black text-slate-900">내 저장함</h2>
                <p className="text-slate-400 text-sm font-bold mt-1">잊기 전에 꺼내보는 여정들</p>
              </div>
            </div>
            {savedTravels.length === 0 ? (
              <div className="py-24 text-center text-slate-300 bg-white rounded-[3rem] border-4 border-dashed border-slate-100 font-black text-xl">
                저장된 코스가 없네요.
              </div>
            ) : (
              <div className="grid gap-4">
                {savedTravels.map(t => (
                  <div key={t.id} onClick={() => { setRawResult({ text: t.content, links: t.links }); setStep('result'); }}
                    className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm cursor-pointer hover:shadow-xl transition-all">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <span className="text-[10px] font-black text-orange-500 bg-orange-50 px-2 py-0.5 rounded uppercase tracking-wider">{t.region}</span>
                          <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded uppercase">{t.duration}</span>
                        </div>
                        <h3 className="text-xl font-black text-slate-800">{t.title}</h3>
                      </div>
                      <button onClick={(e) => deleteSaved(t.id, e)} className="text-slate-200 hover:text-red-500 transition-colors p-2">
                        <i className="fa-solid fa-circle-xmark text-xl"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'result' && parsedData && (
          <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="flex items-center gap-2">
              <button onClick={reset} className="bg-white p-3 rounded-2xl border border-slate-200 text-slate-400 hover:text-slate-600 shadow-sm transition-all">
                <i className="fa-solid fa-house"></i>
              </button>
              <div className="flex-1"></div>
              <button onClick={handleSave} className="bg-orange-500 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg shadow-orange-200 flex items-center gap-2 hover:bg-orange-600 transition-all">
                <i className="fa-solid fa-bookmark"></i> 저장하기
              </button>
            </div>

            {/* Main Header Card */}
            <div className="bg-slate-900 p-8 sm:p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 bg-white/10 backdrop-blur-sm text-white px-6 py-3 rounded-bl-[2rem] font-black text-sm tracking-widest flex items-center gap-2">
                <span className="text-orange-400">LV.</span> {parsedData.difficulty}
              </div>
              
              <div className="space-y-6 relative z-10">
                <div className="flex flex-wrap gap-2">
                  <span className="bg-white/10 text-white text-[10px] font-black px-3 py-1 rounded-full border border-white/10">{request.duration}</span>
                  <span className="bg-white/10 text-white text-[10px] font-black px-3 py-1 rounded-full border border-white/10">{request.budget}</span>
                </div>
                
                <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight pr-10">{parsedData.title}</h2>
                
                {/* Laziness Level Visualization */}
                <div className="bg-white/5 border border-white/10 p-5 rounded-3xl space-y-4">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <p className="text-white/50 text-[10px] font-black uppercase tracking-widest">Laziness Score</p>
                      <h3 className="text-xl font-black text-white flex items-center gap-2">
                        {getLazinessInfo(parsedData.difficulty).emoji} {getLazinessInfo(parsedData.difficulty).label}
                      </h3>
                    </div>
                    <span className="text-white font-black text-2xl">{parsedData.difficulty}%</span>
                  </div>
                  <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ease-out ${getLazinessInfo(parsedData.difficulty).color}`}
                      style={{ width: `${parsedData.difficulty}%` }}
                    ></div>
                  </div>
                  <p className="text-white/40 text-[10px] font-bold italic text-right">높을수록 덜 귀찮은 여행입니다.</p>
                </div>

                <div className="flex items-start gap-3 bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/10">
                  <span className="text-2xl">💬</span>
                  <p className="text-slate-300 font-bold italic leading-relaxed text-sm">"{parsedData.comment}"</p>
                </div>
              </div>
            </div>

            {/* Google Maps Unified Route Link */}
            {googleMapsRouteUrl && (
              <div className="bg-blue-600 p-8 rounded-[3rem] shadow-xl text-white space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black">한눈에 보는 이동 경로</h3>
                    <p className="text-blue-100 text-xs font-bold">지도로 동선을 한눈에 확인하고 출발하세요.</p>
                  </div>
                  <div className="text-4xl">🗺️</div>
                </div>
                <a href={googleMapsRouteUrl} target="_blank" rel="noopener noreferrer" 
                   className="block w-full bg-white text-blue-600 text-center py-5 rounded-2xl font-black shadow-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-3">
                  <i className="fa-solid fa-map-location-dot text-xl"></i> 구글 맵 전체 동선 핀 보기
                </a>
              </div>
            )}

            {/* Timeline Days */}
            <div className="space-y-16 mt-12">
              {parsedData.days.map((day: any) => (
                <div key={day.day} className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-orange-500 text-white px-6 py-2 rounded-2xl font-black text-lg shadow-lg shadow-orange-200">
                      DAY {day.day}
                    </div>
                    <div className="flex-1 h-1 bg-slate-200 rounded-full"></div>
                  </div>

                  <div className="grid gap-8">
                    {day.activities.map((act: any, idx: number) => (
                      <div key={idx} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden group">
                        <div className="p-8 space-y-6">
                           <div className="flex justify-between items-start">
                             <div className="space-y-1">
                               <h4 className="text-2xl font-black text-slate-800 flex items-center gap-2 group-hover:text-orange-600 transition-colors">
                                  <span className="text-orange-500">📍</span> {act.name}
                               </h4>
                               <div className="flex gap-1 text-orange-300">
                                 {[...Array(5)].map((_, i) => (
                                   <i key={i} className={`fa-solid fa-camera text-[10px] ${i >= act.photo ? 'text-slate-100' : ''}`}></i>
                                 ))}
                               </div>
                             </div>
                             {act.mapLink && (
                               <a href={act.mapLink.uri} target="_blank" rel="noopener noreferrer" 
                                  className="bg-slate-100 text-slate-500 p-3 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all">
                                  <i className="fa-solid fa-location-dot"></i>
                               </a>
                             )}
                           </div>

                           <p className="text-slate-600 font-medium leading-relaxed">{act.desc}</p>

                           <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 relative">
                              <div className="absolute -top-3 left-6 bg-orange-500 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                게으름 꿀팁
                              </div>
                              <p className="text-orange-800 font-bold text-sm leading-relaxed">{act.tip}</p>
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-10 flex flex-col gap-4">
               <button onClick={reset} className="bg-slate-900 text-white p-6 rounded-[2rem] font-black text-xl shadow-2xl hover:bg-slate-800 transition-all">
                  다른 여행 찾기 (아직 부족함)
               </button>
            </div>
          </div>
        )}
      </main>
      
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        body { scroll-behavior: smooth; }
      `}</style>
    </div>
  );
};

export default App;
