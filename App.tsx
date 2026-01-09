
import React, { useState, useEffect, useMemo } from 'react';
import { Region, TravelStyle, TravelRequest, SavedTravel, GroundingLink, TransportMode, Duration, Budget, Participant } from './types';
import { generateTravelPlan } from './services/geminiService';

const lazyLevelMap = ["살짝 귀찮음", "많이 귀찮음", "움직이면 사망", "침대와 합체", "영혼만 여행"];

const parseResult = (text: string, links: GroundingLink[]) => {
  const cleanText = text.replace(/google_maps\(.*?\)/g, '').replace(/```.*?```/g, '');
  
  const title = cleanText.match(/\[TITLE\]\s*(.*)/)?.[1] || "무제의 여정";
  const stars = parseInt(cleanText.match(/\[STARS\]\s*(\d+)/)?.[1] || "5");
  const steps = cleanText.match(/\[STEPS\]\s*(\d+)/)?.[1] || "4000";
  const movements = cleanText.match(/\[MOVEMENTS\]\s*(\d+)/)?.[1] || "3";
  const indoor = cleanText.match(/\[INDOOR\]\s*(\d+)/)?.[1] || "70";
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

      const desc = block.match(/\[DESC\]\s*([\s\S]*?)(?=\[|$)/)?.[1]?.trim() || "";
      const tip = block.match(/\[TIP\]\s*([\s\S]*?)(?=\[|$)/)?.[1]?.trim() || "";
      
      const mapLink = links.find(l => 
        name.toLowerCase().includes(l.title.toLowerCase()) || 
        l.title.toLowerCase().includes(name.toLowerCase())
      );
      activities.push({ name, desc, tip, mapLink });
    });

    if (activities.length > 0) {
      days.push({ day: dayNum, activities });
    }
  }
  return { title, stars, steps, movements, indoor, comment, days };
};

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
  const [rawResult, setRawResult] = useState<{ text: string, links: GroundingLink[] } | null>(null);
  const [savedTravels, setSavedTravels] = useState<SavedTravel[]>([]);
  const [loadingMsg, setLoadingMsg] = useState("침대에서 일어나는 중...");

  const parsedData = useMemo(() => rawResult ? parseResult(rawResult.text, rawResult.links) : null, [rawResult]);

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
    const loadingTexts = ["구글 맵 데이터 분석 중...", "최단 동선 계산 중...", "사람 적은 곳 선별 중..."];
    let i = 0;
    const interval = setInterval(() => setLoadingMsg(loadingTexts[++i % loadingTexts.length]), 2500);
    
    try {
      const result = await generateTravelPlan({ ...request, location: userLocation });
      setRawResult(result);
      setStep('result');
      window.scrollTo(0, 0);
    } catch (err: any) {
      alert(err.message);
      setStep('form');
    } finally {
      clearInterval(interval);
    }
  };

  const savePlan = () => {
    if (!parsedData || !rawResult) return;
    const isAlreadySaved = savedTravels.some(t => t.title === parsedData.title && t.savedAt === new Date().toLocaleDateString());
    if (isAlreadySaved) {
      alert("이미 저장된 여정입니다.");
      return;
    }
    const newSave: SavedTravel = {
      id: Date.now().toString(),
      title: parsedData.title,
      content: rawResult.text,
      links: rawResult.links,
      savedAt: new Date().toLocaleDateString(),
      region: request.region,
      totalDifficulty: 90
    };
    setSavedTravels([newSave, ...savedTravels]);
    alert("보관함에 저장되었습니다.");
  };

  const deletePlan = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("이 여정을 삭제할까요?")) {
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
          <span className="font-black text-lg tracking-tighter">귀차니스트의 방랑</span>
        </div>
        <button onClick={() => setStep('mypage')} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400">
          <span className="material-symbols-rounded">folder_special</span>
        </button>
      </nav>

      <main className="flex-1 pt-28 pb-10 px-6 max-w-2xl mx-auto w-full">
        {step === 'home' && (
          <div className="fade-in-up space-y-10 py-10 text-center">
            <div className="relative rounded-[3rem] overflow-hidden aspect-video shadow-2xl bg-brand-900 group">
              <img src="https://images.unsplash.com/photo-1542128962-9d50ad7bf714?q=80&w=2070&auto=format&fit=crop" className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 flex flex-col justify-center items-center p-8 text-white">
                <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4">가기 싫은 당신을 위한<br/>진짜 여행 설계</h1>
                <p className="text-slate-200 font-medium">가장 적게 걷고, 가장 많이 쉬는 법</p>
              </div>
            </div>
            <button onClick={() => setStep('form')} className="w-full py-8 bg-brand-900 text-white rounded-[2.5rem] font-black text-xl shadow-xl hover:bg-brand-800 transition-all">
              여정 설계 시작하기
            </button>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="fade-in-up space-y-12 pb-20">
            <section>
              <SectionTitle num="1" text="일정 & 이동" />
              <div className="grid grid-cols-2 gap-3 mb-3">
                {Object.values(Duration).map(d => (
                  <button key={d} type="button" onClick={()=>setRequest({...request, duration:d})} className={`p-4 rounded-3xl border-2 text-sm font-bold transition-all ${request.duration === d ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-100' : 'border-slate-100 bg-white text-slate-400'}`}>
                    {d}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.values(TransportMode).map(m => (
                  <button key={m} type="button" onClick={()=>setRequest({...request, transport:m})} className={`p-4 rounded-3xl border-2 text-sm font-bold flex items-center justify-center gap-2 ${request.transport === m ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-100 bg-white text-slate-400'}`}>
                    <span className="material-symbols-rounded text-lg">{m.includes('자차') ? 'directions_car' : 'subway'}</span>
                    {m.split(' ')[0]}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle num="2" text="여행 인원" />
              <div className="grid grid-cols-3 gap-3">
                {Object.values(Participant).map(p => (
                  <button key={p} type="button" onClick={()=>setRequest({...request, participants:p})} className={`p-4 rounded-3xl border-2 text-sm font-bold ${request.participants === p ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-100' : 'border-slate-100 bg-white text-slate-400'}`}>
                    {p.split(' ')[0]}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle num="3" text="목적지" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.values(Region).map(r => (
                  <button key={r} type="button" onClick={()=>setRequest({...request, region:r})} className={`p-3 rounded-2xl border-2 text-xs font-black transition-all ${request.region === r ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-100 bg-white text-slate-400'}`}>
                    {r.split(' ')[0]}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle num="4" text="예산" />
              <div className="grid grid-cols-2 gap-3">
                {Object.values(Budget).map(b => (
                  <button key={b} type="button" onClick={()=>setRequest({...request, budget:b})} className={`p-4 rounded-3xl border-2 text-sm font-bold ${request.budget === b ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-100' : 'border-slate-100 bg-white text-slate-400'}`}>
                    {b}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle num="5" text="맛집 포함 여부" />
              <button type="button" onClick={()=>setRequest({...request, includeFood:!request.includeFood})} className={`w-full p-6 rounded-4xl border-2 flex items-center justify-between transition-all ${request.includeFood ? 'border-brand-500 bg-brand-50 text-brand-500' : 'border-slate-100 text-slate-400'}`}>
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
                    <button key={s} type="button" onClick={()=>setRequest({...request, style:s})} className={`p-4 rounded-2xl border-2 text-left text-xs font-bold transition-all ${request.style === s ? 'border-brand-900 bg-brand-900 text-white' : 'border-white bg-white text-slate-400'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <button type="submit" className="w-full py-10 bg-brand-500 text-white rounded-[3rem] font-black text-2xl shadow-2xl shadow-brand-100 hover:scale-[1.02] active:scale-[0.98] transition-all">
              최소 동선 계산하기
            </button>
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

        {step === 'result' && parsedData && (
          <div className="fade-in-up space-y-12 pb-20">
            {/* Main Title Banner */}
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100">
                 <span className="material-symbols-rounded text-slate-500">search</span>
              </div>
              <h2 className="text-2xl font-black text-brand-900 tracking-tight">귀찮음을 해결해줄 코스</h2>
            </div>

            {/* Travel Summary Card (The Request Update) */}
            <div className="lazy-card p-10 space-y-10">
              <div className="flex justify-between items-start">
                <h2 className="text-3xl font-black leading-tight text-brand-900 max-w-[70%]">{parsedData.title}</h2>
                <div className="flex gap-0.5 text-brand-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="material-symbols-rounded text-xl" style={{ fontVariationSettings: `'FILL' ${i < parsedData.stars ? 1 : 0}` }}>
                      star
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-slate-500 font-medium leading-relaxed">
                {parsedData.comment}
              </p>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-50">
                <div className="text-center space-y-2">
                  <div className="flex justify-center">
                    <span className="material-symbols-rounded text-brand-500 text-3xl">footprint</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400">예상 걸음</p>
                  <p className="text-lg font-black text-brand-900">{Number(parsedData.steps).toLocaleString()}보</p>
                </div>
                <div className="text-center space-y-2 border-x border-slate-100">
                  <div className="flex justify-center">
                    <span className="material-symbols-rounded text-brand-500 text-3xl">near_me</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400">이동 횟수</p>
                  <p className="text-lg font-black text-brand-900">{parsedData.movements}회</p>
                </div>
                <div className="text-center space-y-2">
                  <div className="flex justify-center">
                    <span className="material-symbols-rounded text-brand-500 text-3xl">window</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400">실내 비중</p>
                  <p className="text-lg font-black text-brand-900">{parsedData.indoor}%</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {parsedData.days[0].activities.slice(0, 3).map((act: any, i: number) => (
                  <span key={i} className="px-4 py-2 bg-slate-50 text-slate-500 rounded-full text-[11px] font-bold border border-slate-100">
                    {act.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-12">
              {parsedData.days.map((day: any) => (
                <div key={day.day} className="space-y-6">
                  <h3 className="text-2xl font-black text-brand-900 px-2 flex items-center gap-2">
                    <span className="material-symbols-rounded">calendar_today</span> Day {day.day}
                  </h3>
                  <div className="grid gap-6">
                    {day.activities.map((act: any, idx: number) => (
                      <div key={idx} className="lazy-card p-8 space-y-6">
                        <div className="flex justify-between items-start gap-4">
                          <h4 className="text-2xl font-black leading-tight">{act.name}</h4>
                          {act.mapLink && (
                            <a href={act.mapLink.uri} target="_blank" className="shrink-0 bg-brand-50 text-brand-500 px-4 py-2 rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-brand-500 hover:text-white transition-all">
                              <span className="material-symbols-rounded text-sm">location_on</span> 핀
                            </a>
                          )}
                        </div>
                        <p className="text-slate-600 text-base font-medium leading-relaxed">{act.desc}</p>
                        {act.tip && (
                          <div className="bg-slate-50 p-5 rounded-3xl flex gap-3 items-start border border-slate-100">
                            <span className="material-symbols-rounded text-brand-500 text-lg">lightbulb</span>
                            <p className="text-sm font-bold text-slate-700 leading-snug">{act.tip}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-10 grid grid-cols-2 gap-4">
              <button onClick={savePlan} className="py-6 bg-brand-500 text-white rounded-3xl font-black text-lg flex items-center justify-center gap-2 shadow-xl shadow-brand-100 hover:scale-[1.02] transition-all">
                <span className="material-symbols-rounded">bookmark</span> 저장
              </button>
              <button onClick={() => setStep('form')} className="py-6 bg-brand-900 text-white rounded-3xl font-black text-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-all">
                <span className="material-symbols-rounded">refresh</span> 다시 짜기
              </button>
            </div>
          </div>
        )}

        {step === 'mypage' && (
          <div className="fade-in-up space-y-10">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black">저장된 여정</h2>
              <button onClick={() => setStep('home')} className="text-sm font-bold text-slate-400">닫기</button>
            </div>
            {savedTravels.length === 0 ? (
              <div className="py-20 text-center space-y-4 bg-slate-50 rounded-5xl border-2 border-dashed border-slate-200">
                <span className="material-symbols-rounded text-5xl text-slate-200">inbox</span>
                <p className="text-slate-400 font-bold">비어있습니다. 하나 짜보세요!</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {savedTravels.map(t => (
                  <div key={t.id} onClick={() => { setRawResult({ text: t.content, links: t.links }); setStep('result'); window.scrollTo(0, 0); }} className="lazy-card p-6 cursor-pointer group relative overflow-hidden flex items-center gap-4">
                    <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center text-brand-500 shrink-0">
                      <span className="material-symbols-rounded">map</span>
                    </div>
                    <div className="flex-1 min-w-0 pr-10">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-brand-100 text-brand-500 px-2 py-0.5 rounded text-[9px] font-black">{t.region.split(' ')[0]}</span>
                        <span className="text-slate-400 text-[10px]">{t.savedAt}</span>
                      </div>
                      <h3 className="text-lg font-black group-hover:text-brand-500 transition-colors truncate">{t.title}</h3>
                    </div>
                    <button onClick={(e) => deletePlan(t.id, e)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-400">
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
