
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
    includeFood: true
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
      const messages = ["지도를 펼치는 중...", "최단 동선 연산 중...", "사람 적은 곳 찾는 중...", "거의 다 됐어요. 누워계세요."];
      let i = 0;
      const interval = setInterval(() => {
        setLoadingMessage(messages[i % messages.length]);
        i++;
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [step]);

  useEffect(() => {
    const data = localStorage.getItem('lazy_travel_v7');
    if (data) { try { setSavedTravels(JSON.parse(data)); } catch (e) {} }
  }, []);

  useEffect(() => {
    localStorage.setItem('lazy_travel_v7', JSON.stringify(savedTravels));
  }, [savedTravels]);

  const reset = () => { setStep('home'); setRawResult(null); window.scrollTo(0,0); };

  const requestLocation = () => {
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRequest({ ...request, location: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } });
        setIsLoadingLocation(false);
      },
      () => { alert("위치를 가져올 수 없습니다."); setIsLoadingLocation(false); }
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
    } catch (err) {
      alert("생성 실패. 잠시 후 다시 시도해주세요.");
      setStep('form');
    }
  };

  const getLazinessInfo = (score: number) => {
    if (score >= 90) return { label: '침대 합일', color: 'bg-indigo-500', emoji: '🛌' };
    if (score >= 70) return { label: '정통 귀차니스트', color: 'bg-lazy-500', emoji: '🛋️' };
    if (score >= 40) return { label: '사회적 게으름', color: 'bg-yellow-500', emoji: '🚶' };
    return { label: '강제 극기훈련', color: 'bg-red-500', emoji: '🏃' };
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* 고정 헤더 */}
      <header className="glass fixed top-0 left-0 right-0 z-50">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div onClick={reset} className="flex items-center gap-2 cursor-pointer group">
            <div className="w-9 h-9 bg-lazy-500 rounded-xl flex items-center justify-center text-white shadow-lg group-active:scale-90 transition-transform">
              <span className="material-symbols-rounded text-xl">bed</span>
            </div>
            <h1 className="text-xl font-black tracking-tighter">귀차니스트의 방랑</h1>
          </div>
          <button 
            onClick={() => { setStep('mypage'); window.scrollTo(0,0); }}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              step === 'mypage' ? 'bg-lazy-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-100'
            }`}
          >
            보관함
          </button>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 pt-24 pb-32">
        {step === 'home' && (
          <div className="space-y-10 fade-in-up">
            <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl aspect-[4/5] sm:aspect-video card-shadow">
              <img src="https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?q=80&w=2060&auto=format&fit=crop" className="w-full h-full object-cover" alt="lazy travel" />
              <div className="absolute inset-0 bg-gradient-to-t from-lazy-900 via-lazy-900/40 to-transparent flex flex-col justify-end p-8 sm:p-12">
                <span className="inline-block bg-lazy-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest mb-4 w-fit shadow-lg">AI Travel Butler</span>
                <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4 tracking-tighter">
                  집 밖은 위험하지만<br/><span className="text-lazy-500">인생샷</span>은 필요해.
                </h2>
                <p className="text-slate-200 text-sm sm:text-lg font-bold leading-relaxed">에너지 소모 0%에 수렴하는<br/>궁극의 껌딱지 코스를 설계합니다.</p>
              </div>
            </div>
            <button onClick={() => setStep('form')} className="w-full bg-lazy-900 text-white py-7 rounded-3xl font-black text-xl shadow-2xl hover:bg-lazy-800 transition-all flex items-center justify-center gap-3 active:scale-95 group">
              여정 설계 시작하기
              <span className="material-symbols-rounded group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
            </button>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-8 fade-in-up">
            <div className="bg-white p-6 sm:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-12">
              <section className="space-y-6">
                <label className="text-slate-400 font-black text-[11px] uppercase tracking-widest block px-1">1. 기간 & 이동수단</label>
                <div className="space-y-4">
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                    {Object.values(Duration).map((d) => (
                      <button key={d} type="button" onClick={() => setRequest({ ...request, duration: d })}
                        className={`flex-1 py-3 px-1 rounded-xl font-bold text-xs transition-all ${request.duration === d ? 'bg-white text-lazy-900 shadow-sm' : 'text-slate-400'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                    {Object.values(TransportMode).map((m) => (
                      <button key={m} type="button" onClick={() => setRequest({ ...request, transport: m })}
                        className={`flex-1 py-3 px-1 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${request.transport === m ? 'bg-white text-lazy-900 shadow-sm' : 'text-slate-400'}`}>
                        <span className="material-symbols-rounded text-lg">{m.includes('자차') ? 'directions_car' : 'subway'}</span>
                        {m.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <label className="text-slate-400 font-black text-[11px] uppercase tracking-widest block px-1">2. 동행 인원</label>
                <div className="grid grid-cols-3 gap-3">
                  {Object.values(Participant).map((p) => (
                    <button key={p} type="button" onClick={() => setRequest({ ...request, participants: p })}
                      className={`flex flex-col items-center gap-3 py-6 rounded-3xl border-2 transition-all ${request.participants === p ? 'border-lazy-500 bg-lazy-50 text-lazy-500' : 'border-slate-50 bg-slate-50 text-slate-400'}`}>
                      <span className="material-symbols-rounded text-2xl">{p.includes('1인') ? 'person' : p.includes('2~3인') ? 'group' : 'groups'}</span>
                      <span className="font-bold text-[11px]">{p.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-6">
                <label className="text-slate-400 font-black text-[11px] uppercase tracking-widest block px-1">3. 방랑 지역</label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(Region).map((r) => (
                    <button key={r} type="button" onClick={() => setRequest({ ...request, region: r })}
                      className={`p-5 rounded-3xl border-2 text-left transition-all ${request.region === r ? 'border-lazy-900 bg-lazy-900 text-white shadow-xl' : 'border-slate-50 bg-slate-50 text-slate-500'}`}>
                      <span className="font-bold text-sm tracking-tight">{r}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-6">
                <label className="text-slate-400 font-black text-[11px] uppercase tracking-widest block px-1">4. 예산 & 식사</label>
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                    {Object.values(Budget).map((b) => (
                      <button key={b} type="button" onClick={() => setRequest({ ...request, budget: b })}
                        className={`py-3 rounded-xl font-bold text-[10px] transition-all ${request.budget === b ? 'bg-white text-lazy-900 shadow-sm' : 'text-slate-400'}`}>
                        {b}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setRequest({ ...request, includeFood: !request.includeFood })}
                    className={`w-full flex items-center justify-between p-6 rounded-3xl border-2 transition-all ${request.includeFood ? 'border-lazy-500 bg-lazy-50 text-lazy-500 shadow-sm shadow-lazy-100' : 'border-slate-100 bg-white text-slate-400'}`}>
                    <div className="flex items-center gap-4">
                      <span className="material-symbols-rounded">restaurant</span>
                      <span className="font-black text-sm">미슐랭/로컬 맛집 코스 포함</span>
                    </div>
                    <div className={`w-11 h-6 rounded-full relative transition-colors ${request.includeFood ? 'bg-lazy-500' : 'bg-slate-200'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${request.includeFood ? 'left-6' : 'left-1'}`}></div>
                    </div>
                  </button>
                </div>
              </section>

              <section className="space-y-6">
                <label className="text-slate-400 font-black text-[11px] uppercase tracking-widest block px-1">5. 현재 나의 상태</label>
                <div className="grid gap-3">
                  {Object.values(TravelStyle).map((s) => (
                    <button key={s} type="button" onClick={() => setRequest({ ...request, style: s })}
                      className={`w-full p-5 rounded-3xl text-left flex justify-between items-center border-2 transition-all ${request.style === s ? 'border-lazy-500 bg-lazy-50 text-lazy-500 shadow-sm' : 'border-slate-50 bg-slate-50 text-slate-400'}`}>
                      <span className="font-bold text-sm">{s}</span>
                      {request.style === s && <span className="material-symbols-rounded text-xl">check_circle</span>}
                    </button>
                  ))}
                </div>
              </section>

              <button type="button" onClick={requestLocation} disabled={isLoadingLocation}
                className={`w-full p-6 rounded-3xl border-2 border-dashed flex items-center justify-center gap-3 font-black text-sm transition-all ${request.location ? 'border-lazy-500 text-lazy-500 bg-lazy-50' : 'border-slate-200 text-slate-400 hover:border-slate-400'}`}>
                <span className={`material-symbols-rounded ${isLoadingLocation ? 'animate-spin' : ''}`}>{isLoadingLocation ? 'progress_activity' : 'location_on'}</span>
                {request.location ? "현재 위치 정보 반영 완료" : "내 위치 주변으로 찾기"}
              </button>
            </div>

            <button type="submit" className="w-full bg-lazy-500 text-white py-8 rounded-[2rem] font-black text-2xl shadow-2xl shadow-lazy-200 hover:scale-[1.01] active:scale-95 transition-all">
              여정 결과 보기
            </button>
          </form>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-40 space-y-10 fade-in-up">
            <div className="relative">
              <div className="w-28 h-28 bg-lazy-100 rounded-full animate-ping opacity-20 absolute"></div>
              <div className="text-7xl animate-bounce relative">🛌</div>
            </div>
            <div className="text-center space-y-3">
              <h2 className="text-3xl font-black text-lazy-900 tracking-tight">{loadingMessage}</h2>
              <p className="text-slate-400 text-sm font-bold">궁극의 게으른 경로를 찾는 중입니다.</p>
            </div>
          </div>
        )}

        {step === 'result' && parsedData && (
          <div className="space-y-12 fade-in-up">
            <div className="relative bg-lazy-900 rounded-[3rem] p-10 sm:p-14 shadow-2xl overflow-hidden min-h-[350px] flex flex-col justify-end">
              <div className="absolute top-10 right-10 bg-white/10 backdrop-blur-xl px-5 py-3 rounded-2xl text-center border border-white/10">
                <p className="text-white/40 text-[9px] font-black uppercase tracking-widest mb-1">Laziness</p>
                <p className="text-white text-2xl font-black">{parsedData.difficulty}%</p>
              </div>
              <div className="space-y-8 relative z-10">
                <div className="flex flex-wrap gap-2">
                  <span className="bg-lazy-500 text-white text-[11px] font-black px-4 py-1.5 rounded-full shadow-lg">{request.participants.split(' ')[0]}</span>
                  <span className="bg-white/10 text-white text-[11px] font-black px-4 py-1.5 rounded-full border border-white/10">{request.budget}</span>
                </div>
                <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight tracking-tighter">{parsedData.title}</h2>
                <div className="bg-white/5 border border-white/10 p-6 rounded-3xl flex items-start gap-4 backdrop-blur-md">
                  <span className="text-2xl">💡</span>
                  <p className="text-slate-200 text-base font-bold italic leading-relaxed">"{parsedData.comment}"</p>
                </div>
              </div>
              <div className="absolute -left-20 -top-20 w-80 h-80 bg-lazy-500/20 rounded-full blur-[100px]"></div>
              <div className="absolute -right-20 bottom-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-[80px]"></div>
            </div>

            <div className="space-y-20">
              {parsedData.days.map((day: any) => (
                <div key={day.day} className="space-y-10">
                  <div className="flex items-center gap-5">
                    <span className="bg-lazy-900 text-white px-8 py-2.5 rounded-2xl font-black text-base shadow-xl">DAY {day.day}</span>
                    <div className="flex-1 h-px bg-slate-200"></div>
                  </div>
                  <div className="grid gap-12">
                    {day.activities.map((act: any, idx: number) => (
                      <div key={idx} className="relative group">
                        {idx !== day.activities.length - 1 && <div className="absolute left-7 top-24 bottom-0 w-px border-l-2 border-dashed border-slate-200 -z-10"></div>}
                        <div className="bg-white rounded-[3rem] shadow-sm p-8 sm:p-10 border border-slate-50 hover:shadow-2xl hover:-translate-y-1 transition-all duration-500">
                          <div className="flex justify-between items-start mb-8">
                            <h4 className="text-2xl font-black text-lazy-900 pr-12 leading-tight">{act.name}</h4>
                            {act.mapLink && (
                              <a href={act.mapLink.uri} target="_blank" rel="noopener noreferrer" className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-lazy-500 hover:text-white transition-all shadow-sm">
                                <span className="material-symbols-rounded text-2xl">near_me</span>
                              </a>
                            )}
                          </div>
                          <p className="text-slate-600 text-base font-medium leading-relaxed mb-8">{act.desc}</p>
                          <div className="bg-lazy-50 p-6 rounded-3xl flex gap-5 items-start border border-lazy-100">
                            <span className="material-symbols-rounded text-lazy-500 mt-1">tips_and_updates</span>
                            <p className="text-lazy-900 font-bold text-sm leading-relaxed">{act.tip}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 pt-10">
              <button onClick={handleSave} className="bg-lazy-900 text-white py-8 rounded-[2.5rem] font-black text-2xl shadow-2xl flex items-center justify-center gap-4 active:scale-95 transition-all">
                <span className="material-symbols-rounded text-3xl">bookmark_add</span>
                이 여정 보관하기
              </button>
              <button onClick={reset} className="bg-white text-slate-400 py-6 rounded-3xl font-bold text-sm border border-slate-100 hover:bg-slate-50 transition-all">
                처음으로 돌아가기
              </button>
            </div>
          </div>
        )}

        {step === 'mypage' && (
          <div className="space-y-10 fade-in-up">
            <div className="px-2">
              <h2 className="text-4xl font-black text-lazy-900 tracking-tighter">게으른 보관함</h2>
              <p className="text-slate-400 font-bold mt-3">나중에 정말 어쩔 수 없을 때 꺼내보세요.</p>
            </div>
            
            {savedTravels.length === 0 ? (
              <div className="bg-white border-4 border-dashed border-slate-100 rounded-[3rem] py-40 text-center space-y-5">
                <span className="material-symbols-rounded text-7xl text-slate-100">inventory_2</span>
                <p className="text-slate-300 font-black text-xl">보관된 여정이 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {savedTravels.map(t => (
                  <div key={t.id} onClick={() => { setRawResult({ text: t.content, links: t.links }); setStep('result'); window.scrollTo(0,0); }}
                    className="bg-white p-8 rounded-[3rem] border border-white shadow-sm cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group relative">
                    <div className="space-y-5">
                      <div className="flex gap-2">
                        <span className="bg-lazy-50 text-lazy-500 text-[10px] font-black px-3 py-1 rounded-full uppercase">{t.region}</span>
                        <span className="bg-slate-50 text-slate-300 text-[10px] font-black px-3 py-1 rounded-full uppercase">{t.savedAt}</span>
                      </div>
                      <h3 className="text-2xl font-black text-lazy-900 group-hover:text-lazy-500 transition-colors pr-12 leading-tight">{t.title}</h3>
                    </div>
                    <button onClick={(e) => deleteSaved(t.id, e)} className="absolute top-8 right-8 w-11 h-11 bg-slate-50 text-slate-200 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all">
                      <span className="material-symbols-rounded text-xl">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={reset} className="w-full text-slate-400 font-bold text-sm py-8 hover:text-lazy-900 transition-colors">홈으로 돌아가기</button>
          </div>
        )}
      </main>

      {/* 고정 하단 네비게이션 */}
      {step !== 'home' && step !== 'loading' && (
        <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm h-16 glass rounded-full flex items-center justify-around px-8 shadow-2xl border border-white/50 z-50">
          <button onClick={reset} className={`p-3 transition-all ${step === 'form' ? 'text-lazy-500 scale-125' : 'text-slate-300 hover:text-slate-900'}`}>
            <span className="material-symbols-rounded text-3xl">add_circle</span>
          </button>
          <button onClick={() => { setStep('mypage'); window.scrollTo(0,0); }} className={`p-3 transition-all ${step === 'mypage' ? 'text-lazy-500 scale-125' : 'text-slate-300 hover:text-slate-900'}`}>
            <span className="material-symbols-rounded text-3xl">folder_open</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default App;
