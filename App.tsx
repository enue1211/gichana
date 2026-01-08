
import React, { useState, useEffect, useMemo } from 'react';
import { Region, TravelStyle, TravelRequest, SavedTravel, GroundingLink, TransportMode, Duration, Budget, Participant } from './types';
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
      
      const mapLink = links.find(l => name.toLowerCase().includes(l.title.toLowerCase()) || l.title.toLowerCase().includes(name.toLowerCase()));
      
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
    participants: Participant.SOLO,
    transport: TransportMode.PUBLIC,
    includeFood: true,
    lazinessLevel: 4
  });
  const [rawResult, setRawResult] = useState<{ text: string, links: GroundingLink[] } | null>(null);
  const [savedTravels, setSavedTravels] = useState<SavedTravel[]>([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("침대에서 일어나는 중...");

  const parsedData = useMemo(() => {
    if (!rawResult) return null;
    return parseResult(rawResult.text, rawResult.links);
  }, [rawResult]);

  useEffect(() => {
    if (step === 'loading') {
      const messages = [
        "지도를 펼치는 중...", 
        "최단 동선 연산 중...", 
        "사람 적은 곳 찾는 중...", 
        "침대 반경 1km 탐색 중...",
        "셔터 한 번 누르고 튈 곳 찾는 중..."
      ];
      let i = 0;
      const interval = setInterval(() => {
        setLoadingMessage(messages[i % messages.length]);
        i++;
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [step]);

  useEffect(() => {
    const data = localStorage.getItem('lazy_travel_final_v1');
    if (data) { try { setSavedTravels(JSON.parse(data)); } catch (e) {} }
  }, []);

  useEffect(() => {
    localStorage.setItem('lazy_travel_final_v1', JSON.stringify(savedTravels));
  }, [savedTravels]);

  const reset = () => { setStep('home'); setRawResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const requestLocation = () => {
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRequest({ ...request, location: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } });
        setIsLoadingLocation(false);
      },
      () => { alert("위치 정보를 가져올 수 없습니다."); setIsLoadingLocation(false); }
    );
  };

  const handleSave = () => {
    if (!parsedData || !rawResult) return;
    if (savedTravels.some(t => t.title === parsedData.title)) { alert("이미 저장된 코스입니다."); return; }
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
      budget: request.budget,
      participants: request.participants
    };
    setSavedTravels([newSave, ...savedTravels]);
    alert("보관함에 저장되었습니다!");
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
      window.scrollTo(0,0);
    } catch (err: any) {
      alert(err.message || "생성 실패. 잠시 후 다시 시도해주세요.");
      setStep('form');
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col relative">
      {/* Header */}
      <header className="glass fixed top-0 left-0 right-0 z-[100] h-20">
        <div className="max-w-2xl mx-auto px-6 h-full flex items-center justify-between">
          <div onClick={reset} className="flex items-center gap-3 cursor-pointer group">
            <div className="w-12 h-12 bg-lazy-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-lazy-200 group-active:scale-95 transition-transform">
              <span className="material-symbols-rounded text-2xl font-bold">king_bed</span>
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-black tracking-tighter text-lazy-900 leading-none">귀차니스트의 방랑</h1>
              <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Minimalism Travel</span>
            </div>
          </div>
          <button 
            onClick={() => { setStep('mypage'); window.scrollTo(0,0); }}
            className={`w-12 h-12 rounded-2xl transition-all flex items-center justify-center ${
              step === 'mypage' ? 'bg-lazy-900 text-white shadow-xl' : 'bg-white text-slate-400 border border-slate-100'
            }`}
          >
            <span className="material-symbols-rounded">folder_heart</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-5 pt-28 pb-44">
        {step === 'home' && (
          <div className="space-y-10 fade-in-up">
            <div className="relative rounded-[3rem] overflow-hidden shadow-2xl aspect-[4/5] sm:aspect-video bg-lazy-900">
              <img src="https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?q=80&w=2060&auto=format&fit=crop" className="w-full h-full object-cover opacity-60" alt="lazy travel" />
              <div className="absolute inset-0 bg-gradient-to-t from-lazy-900 via-lazy-900/40 to-transparent flex flex-col justify-end p-10 sm:p-14">
                <div className="flex items-center gap-2 mb-6">
                  <span className="bg-lazy-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg">Service Concept</span>
                  <span className="bg-white/10 backdrop-blur-md text-white text-[10px] font-bold px-4 py-1.5 rounded-full border border-white/20">Planning v2.5</span>
                </div>
                <h2 className="text-5xl sm:text-6xl font-black text-white leading-[1.05] mb-8 tracking-tighter">
                  여행 가기 싫은<br/>사람을 위한<br/><span className="text-lazy-500 italic">침대 위 여정</span>
                </h2>
                <p className="text-slate-200 text-base sm:text-lg font-medium leading-relaxed max-w-sm opacity-90">
                  집 밖은 위험하지만, 어쩔 수 없이 떠나야 하는 당신을 위한 '최소 동선' 전문 큐레이션.
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <button onClick={() => setStep('form')} className="w-full bg-lazy-900 text-white py-9 rounded-[2.5rem] font-black text-2xl shadow-2xl shadow-lazy-900/30 flex items-center justify-center gap-4 active:scale-[0.97] transition-all group">
                게으른 여정 설계하기
                <span className="material-symbols-rounded text-3xl group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
              </button>
              <p className="text-center text-slate-400 text-xs font-bold tracking-widest uppercase">AI-Powered Minimalism Travel Planner</p>
            </div>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-16 fade-in-up">
            <div className="space-y-20">
              {/* 게으름 강도 */}
              <section className="space-y-8">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-lazy-500">
                      <span className="material-symbols-rounded">speed</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-800">게으름 강도</h3>
                  </div>
                  <span className="text-lazy-500 font-black text-lg bg-slate-50 px-4 py-1 rounded-full">Lv.{request.lazinessLevel}</span>
                </div>
                <div className="px-2 space-y-4">
                  <input 
                    type="range" min="1" max="5" step="1" 
                    value={request.lazinessLevel} 
                    onChange={(e) => setRequest({...request, lazinessLevel: parseInt(e.target.value)})}
                    className="w-full h-3 bg-slate-100 rounded-full appearance-none cursor-pointer accent-lazy-500"
                  />
                  <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <span>살짝 귀찮음</span>
                    <span>영혼만 여행</span>
                  </div>
                </div>
              </section>

              {/* 기간 & 수단 */}
              <section className="space-y-8">
                <div className="flex items-center gap-4 px-2">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-lazy-500">
                    <span className="material-symbols-rounded">event_note</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-800">어느 정도 누워있을까요?</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {Object.values(Duration).map((d) => (
                    <button key={d} type="button" onClick={() => setRequest({ ...request, duration: d })}
                      className={`py-5 rounded-3xl font-black text-sm transition-all border-2 ${request.duration === d ? 'border-lazy-500 bg-lazy-500 text-white shadow-xl shadow-lazy-100' : 'border-slate-50 bg-white text-slate-400 hover:border-slate-200'}`}>
                      {d}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {Object.values(TransportMode).map((m) => (
                    <button key={m} type="button" onClick={() => setRequest({ ...request, transport: m })}
                      className={`flex flex-col items-center gap-4 p-8 rounded-5xl border-2 transition-all ${request.transport === m ? 'border-lazy-900 bg-lazy-900 text-white shadow-2xl' : 'border-slate-50 bg-white text-slate-400 hover:border-slate-200'}`}>
                      <span className="material-symbols-rounded text-4xl leading-none">{m.includes('자차') ? 'directions_car' : 'directions_subway'}</span>
                      <span className="font-black text-base">{m.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* 동행 */}
              <section className="space-y-8">
                <div className="flex items-center gap-4 px-2">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-lazy-500">
                    <span className="material-symbols-rounded">group_add</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-800">누구랑 귀찮아질까요?</h3>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {Object.values(Participant).map((p) => (
                    <button key={p} type="button" onClick={() => setRequest({ ...request, participants: p })}
                      className={`flex flex-col items-center gap-4 py-10 rounded-5xl border-2 transition-all ${request.participants === p ? 'border-lazy-500 bg-slate-50 text-lazy-500' : 'border-slate-50 bg-white text-slate-400 hover:border-slate-200'}`}>
                      <span className="material-symbols-rounded text-4xl">{p.includes('1인') ? 'person' : p.includes('2~3인') ? 'diversity_1' : 'diversity_3'}</span>
                      <span className="font-black text-xs tracking-tight">{p.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* 지역 */}
              <section className="space-y-8">
                <div className="flex items-center gap-4 px-2">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-lazy-500">
                    <span className="material-symbols-rounded">explore</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-800">어디까지 갈 수 있나요?</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {Object.values(Region).map((r) => (
                    <button key={r} type="button" onClick={() => setRequest({ ...request, region: r })}
                      className={`p-7 rounded-4xl border-2 text-left transition-all ${request.region === r ? 'border-lazy-900 bg-lazy-900 text-white shadow-2xl ring-4 ring-slate-100' : 'border-slate-50 bg-white text-slate-500 hover:border-slate-200'}`}>
                      <span className="font-black text-base tracking-tight">{r}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* 설정 섹션 */}
              <section className="space-y-8">
                <div className="flex items-center gap-4 px-2">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-lazy-500">
                    <span className="material-symbols-rounded">tune</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-800">나머지 취향 존중</h3>
                </div>
                <div className="space-y-6">
                  <div className="grid grid-cols-4 gap-2 bg-slate-100 p-2 rounded-3xl">
                    {Object.values(Budget).map((b) => (
                      <button key={b} type="button" onClick={() => setRequest({ ...request, budget: b })}
                        className={`py-4 rounded-2xl font-black text-xs transition-all ${request.budget === b ? 'bg-white text-lazy-900 shadow-sm' : 'text-slate-400'}`}>
                        {b}
                      </button>
                    ))}
                  </div>
                  
                  <button type="button" onClick={() => setRequest({ ...request, includeFood: !request.includeFood })}
                    className={`w-full flex items-center justify-between p-8 rounded-5xl border-2 transition-all ${request.includeFood ? 'border-lazy-500 bg-slate-50 text-lazy-500 shadow-sm' : 'border-slate-100 bg-white text-slate-400'}`}>
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${request.includeFood ? 'bg-lazy-500 text-white' : 'bg-slate-100 text-slate-300'}`}>
                        <span className="material-symbols-rounded text-2xl">restaurant</span>
                      </div>
                      <span className="font-black text-base">유명 맛집 무조건 포함</span>
                    </div>
                    <div className={`w-14 h-8 rounded-full relative transition-colors ${request.includeFood ? 'bg-lazy-500' : 'bg-slate-200'}`}>
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${request.includeFood ? 'left-7' : 'left-1'}`}></div>
                    </div>
                  </button>

                  <div className="grid gap-4">
                    {Object.values(TravelStyle).map((s) => (
                      <button key={s} type="button" onClick={() => setRequest({ ...request, style: s })}
                        className={`w-full p-7 rounded-4xl text-left flex justify-between items-center border-2 transition-all ${request.style === s ? 'border-lazy-500 bg-slate-50 text-lazy-500 shadow-lg' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}>
                        <span className="font-black text-base">{s}</span>
                        {request.style === s && <span className="material-symbols-rounded text-2xl animate-pulse">verified</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <button type="button" onClick={requestLocation} disabled={isLoadingLocation}
                className={`w-full p-8 rounded-5xl border-2 border-dashed flex items-center justify-center gap-4 font-black text-base transition-all ${request.location ? 'border-lazy-500 text-lazy-500 bg-slate-50' : 'border-slate-200 text-slate-400 hover:border-slate-400 hover:bg-slate-50'}`}>
                <span className={`material-symbols-rounded text-3xl ${isLoadingLocation ? 'animate-spin' : ''}`}>{isLoadingLocation ? 'progress_activity' : 'near_me'}</span>
                {request.location ? "현재 위치 기반 연산 활성화" : "내 주변 코스 찾기 (선택)"}
              </button>
            </div>

            <button type="submit" className="w-full bg-lazy-500 text-white py-10 rounded-5xl font-black text-3xl shadow-2xl shadow-lazy-300 hover:scale-[1.01] active:scale-95 transition-all">
              여정 결과 보기
            </button>
          </form>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-48 space-y-16 fade-in-up">
            <div className="relative">
              <div className="w-40 h-40 bg-slate-100 rounded-full animate-ping absolute -inset-2"></div>
              <div className="w-36 h-36 bg-lazy-500 rounded-5xl flex items-center justify-center text-white text-7xl shadow-2xl animate-bounce relative z-10">
                <span className="material-symbols-rounded text-7xl">airline_seat_recline_extra</span>
              </div>
            </div>
            <div className="text-center space-y-6">
              <h2 className="text-4xl font-black text-lazy-900 tracking-tighter px-4">{loadingMessage}</h2>
              <div className="flex gap-2 justify-center items-center">
                <div className="w-3 h-3 bg-lazy-500 rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-lazy-500/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-3 h-3 bg-lazy-500/30 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              </div>
            </div>
          </div>
        )}

        {step === 'result' && parsedData && (
          <div className="space-y-20 fade-in-up">
            {/* Result Hero */}
            <div className="relative bg-lazy-900 rounded-5xl p-10 sm:p-16 shadow-2xl overflow-hidden min-h-[480px] flex flex-col justify-end">
              <div className="absolute top-10 right-10 flex flex-col items-end gap-3">
                <div className="bg-lazy-500 px-7 py-3 rounded-2xl shadow-2xl border border-white/20">
                  <p className="text-white text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Laziness Score</p>
                  <p className="text-white text-4xl font-black">{parsedData.difficulty}%</p>
                </div>
              </div>
              <div className="space-y-10 relative z-10">
                <div className="flex flex-wrap gap-3">
                  <span className="bg-white/10 text-white text-[11px] font-black px-5 py-2.5 rounded-full border border-white/20 backdrop-blur-md uppercase tracking-widest">{request.region}</span>
                  <span className="bg-white/10 text-white text-[11px] font-black px-5 py-2.5 rounded-full border border-white/20 backdrop-blur-md uppercase tracking-widest">{request.duration}</span>
                  <span className="bg-lazy-500 text-white text-[11px] font-black px-5 py-2.5 rounded-full shadow-lg uppercase tracking-widest">Lv.{request.lazinessLevel}</span>
                </div>
                <h2 className="text-5xl sm:text-7xl font-black text-white leading-[1.1] tracking-tighter drop-shadow-2xl">{parsedData.title}</h2>
                <div className="bg-white/10 border border-white/10 p-10 rounded-4xl flex items-start gap-6 backdrop-blur-2xl">
                  <span className="text-4xl filter drop-shadow-lg">🧘‍♂️</span>
                  <p className="text-white text-xl font-bold italic leading-relaxed opacity-90">"{parsedData.comment}"</p>
                </div>
              </div>
              <div className="absolute -left-20 -top-20 w-[500px] h-[500px] bg-lazy-500/20 rounded-full blur-[120px]"></div>
              <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px]"></div>
            </div>

            {/* Itinerary Timeline */}
            <div className="space-y-32 px-2">
              {parsedData.days.map((day: any) => (
                <div key={day.day} className="space-y-16">
                  <div className="flex items-center gap-8">
                    <div className="bg-lazy-900 text-white px-12 py-4 rounded-full font-black text-2xl shadow-2xl tracking-tighter">Day {day.day}</div>
                    <div className="flex-1 h-px bg-slate-200"></div>
                  </div>
                  <div className="grid gap-24 relative">
                    <div className="absolute left-[38px] top-10 bottom-0 w-1 bg-gradient-to-b from-slate-200 via-slate-100 to-transparent -z-10 rounded-full"></div>
                    
                    {day.activities.map((act: any, idx: number) => (
                      <div key={idx} className="relative pl-24 group">
                        <div className="absolute left-[32px] top-12 w-4 h-4 rounded-full bg-white border-4 border-lazy-500 shadow-[0_0_0_12px_rgba(255,107,53,0.1)] group-hover:scale-150 transition-transform duration-700 z-10"></div>
                        
                        <div className="lazy-card p-10 sm:p-14">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8 mb-10">
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="text-lazy-500 font-black text-[10px] uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-lg">STOP {idx + 1}</span>
                                <div className="flex gap-1">
                                  {[...Array(5)].map((_, i) => (
                                    <span key={i} className={`material-symbols-rounded text-sm ${i < act.photo ? 'text-lazy-500' : 'text-slate-200'}`}>photo_camera</span>
                                  ))}
                                </div>
                              </div>
                              <h4 className="text-4xl font-black text-lazy-900 leading-tight tracking-tight">{act.name}</h4>
                            </div>
                            {act.mapLink && (
                              <a href={act.mapLink.uri} target="_blank" rel="noopener noreferrer" className="bg-slate-50 text-lazy-500 px-8 py-5 rounded-3xl flex items-center justify-center gap-3 hover:bg-lazy-500 hover:text-white transition-all shadow-md group/link self-start">
                                <span className="font-black text-sm uppercase">Navigation</span>
                                <span className="material-symbols-rounded text-2xl group-hover/link:translate-x-1 transition-transform">explore</span>
                              </a>
                            )}
                          </div>
                          
                          <p className="text-slate-600 text-xl font-medium leading-relaxed mb-12">{act.desc}</p>
                          
                          <div className="bg-slate-50 p-10 rounded-4xl flex gap-8 items-start border border-slate-100 group/tip">
                            <div className="w-16 h-16 rounded-3xl bg-white shadow-md flex items-center justify-center shrink-0 group-hover/tip:rotate-[15deg] transition-transform duration-500">
                              <span className="material-symbols-rounded text-lazy-500 text-3xl">lightbulb_circle</span>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Efficiency Strategy</p>
                              <p className="text-lazy-900 font-bold text-lg leading-relaxed">{act.tip}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-5 pt-12 pb-10">
              <button onClick={handleSave} className="bg-lazy-900 text-white py-11 rounded-5xl font-black text-3xl shadow-2xl flex items-center justify-center gap-6 active:scale-[0.98] transition-all group">
                <span className="material-symbols-rounded text-4xl group-hover:scale-125 transition-transform">bookmark_heart</span>
                이대로 눕기 (여정 저장)
              </button>
              <button onClick={reset} className="bg-white text-slate-400 py-8 rounded-4xl font-black text-base border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-3">
                <span className="material-symbols-rounded">refresh</span>
                새로운 코스 다시 짜기
              </button>
            </div>
          </div>
        )}

        {step === 'mypage' && (
          <div className="space-y-16 fade-in-up">
            <div className="px-4 space-y-4">
              <h2 className="text-6xl font-black text-lazy-900 tracking-tighter">보관함</h2>
              <p className="text-slate-400 font-bold text-xl leading-snug">담아둔 여정들은 정말 어쩔 수 없을 때 꺼내보세요.</p>
            </div>
            
            {savedTravels.length === 0 ? (
              <div className="bg-white border-4 border-dashed border-slate-100 rounded-[4rem] py-64 text-center space-y-10 shadow-inner">
                <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                  <span className="material-symbols-rounded text-7xl text-slate-200">sentiment_very_dissatisfied</span>
                </div>
                <div className="space-y-4">
                  <p className="text-slate-300 font-black text-3xl tracking-tight">아직 비어있습니다.</p>
                  <button onClick={() => setStep('form')} className="text-lazy-500 font-black text-lg underline underline-offset-[12px] decoration-2">첫 여정 짜러가기</button>
                </div>
              </div>
            ) : (
              <div className="grid gap-8 px-2">
                {savedTravels.map(t => (
                  <div key={t.id} onClick={() => { setRawResult({ text: t.content, links: t.links }); setStep('result'); window.scrollTo(0,0); }}
                    className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm cursor-pointer hover:shadow-2xl hover:-translate-y-2 transition-all group relative">
                    <div className="space-y-8">
                      <div className="flex gap-4">
                        <span className="bg-slate-50 text-lazy-500 text-[10px] font-black px-5 py-2 rounded-full uppercase tracking-widest shadow-sm">{t.region}</span>
                        <span className="bg-slate-50 text-slate-400 text-[10px] font-bold px-5 py-2 rounded-full border border-slate-100">{t.savedAt}</span>
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-4xl font-black text-lazy-900 group-hover:text-lazy-500 transition-colors pr-16 leading-tight tracking-tighter">{t.title}</h3>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-rounded text-lazy-500 text-lg">hotel</span>
                          <p className="text-slate-400 text-sm font-bold opacity-80">게으름 지수 {t.totalDifficulty}%의 눕방 여정</p>
                        </div>
                      </div>
                    </div>
                    <button onClick={(e) => deleteSaved(t.id, e)} className="absolute top-12 right-12 w-16 h-16 bg-slate-50 text-slate-300 rounded-3xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all shadow-sm">
                      <span className="material-symbols-rounded text-3xl">delete_forever</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={reset} className="w-full text-slate-300 font-black text-lg py-12 hover:text-lazy-900 transition-colors flex items-center justify-center gap-4">
              <span className="material-symbols-rounded text-2xl">arrow_back</span>
              홈으로 돌아가기
            </button>
          </div>
        )}
      </main>

      {/* Floating Bottom Nav */}
      {step !== 'home' && step !== 'loading' && (
        <nav className="fixed bottom-12 left-1/2 -translate-x-1/2 w-[90%] max-w-sm h-24 glass rounded-[3rem] flex items-center justify-around px-10 shadow-2xl border border-white/40 z-[100] transition-all animate-bounce-short">
          <button onClick={reset} className={`p-5 transition-all ${step === 'form' ? 'text-lazy-500 scale-125' : 'text-slate-300 hover:text-slate-900'}`}>
            <span className="material-symbols-rounded text-4xl font-black">add_circle</span>
          </button>
          <div className="w-px h-10 bg-slate-200/50"></div>
          <button onClick={() => { setStep('mypage'); window.scrollTo(0,0); }} className={`p-5 transition-all ${step === 'mypage' ? 'text-lazy-500 scale-125' : 'text-slate-300 hover:text-slate-900'}`}>
            <span className="material-symbols-rounded text-4xl font-black">dashboard_customize</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default App;
