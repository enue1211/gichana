
import React, { useState, useEffect, useMemo } from 'react';
import { Region, TravelStyle, TravelRequest, SavedTravel, GroundingLink, TransportMode, Duration, Budget, Participant } from './types';
import { generateTravelPlan } from './services/geminiService';

const parseResult = (text: string, links: GroundingLink[]) => {
  const title = text.match(/\[TITLE\]\s*(.*)/)?.[1] || "무제의 여정";
  const difficulty = parseInt(text.match(/\[DIFFICULTY\]\s*(\d+)/)?.[1] || "90");
  const comment = text.match(/\[COMMENT\]\s*(.*)/)?.[1] || "귀찮지만 이 정도면 갈 만 합니다.";

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
  }, []);

  useEffect(() => {
    localStorage.setItem('lazy_wander_v1', JSON.stringify(savedTravels));
  }, [savedTravels]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('loading');
    const loadingTexts = ["지도 앱 켜는 것조차 귀찮은 당신을 위해...", "최단 동선 계산 중 (뇌 빼는 중)", "침대 반경 1km 탐색 중...", "사람 적은 곳 선별 중..."];
    let i = 0;
    const interval = setInterval(() => setLoadingMsg(loadingTexts[++i % loadingTexts.length]), 2500);
    
    try {
      const result = await generateTravelPlan(request);
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
    const newSave: SavedTravel = {
      id: Date.now().toString(),
      title: parsedData.title,
      content: rawResult.text,
      links: rawResult.links,
      savedAt: new Date().toLocaleDateString(),
      region: request.region,
      totalDifficulty: parsedData.difficulty
    };
    setSavedTravels([newSave, ...savedTravels]);
    alert("보관함에 저장되었습니다. 정말 가실 건가요?");
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar */}
      <nav className="glass fixed top-0 w-full z-50 h-20 flex items-center justify-between px-6 max-w-2xl mx-auto left-0 right-0">
        <div onClick={() => setStep('home')} className="flex items-center gap-2 cursor-pointer">
          <div className="w-10 h-10 bg-lazy-500 rounded-xl flex items-center justify-center text-white">
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
          <div className="fade-in-up space-y-10 py-10">
            <div className="relative rounded-[3rem] overflow-hidden aspect-video shadow-2xl bg-lazy-900">
              <img src="https://images.unsplash.com/photo-1542128962-9d50ad7bf714?q=80&w=2070&auto=format&fit=crop" className="w-full h-full object-cover opacity-60" />
              <div className="absolute inset-0 flex flex-col justify-end p-8 sm:p-12 text-white">
                <h1 className="text-4xl sm:text-6xl font-black leading-[1.1] mb-4">여행은 싫지만<br/><span className="text-lazy-500">사진</span>은 남겨야죠</h1>
                <p className="text-slate-200 font-medium">침대에서 현관문까지가 가장 먼 당신을 위한<br/>초경량 동선 가이드</p>
              </div>
            </div>
            <button onClick={() => setStep('form')} className="w-full py-8 bg-lazy-900 text-white rounded-[2.5rem] font-black text-xl shadow-xl hover:translate-y-[-4px] transition-all">
              여정 설계 시작하기
            </button>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="fade-in-up space-y-12 pb-20">
            <section className="space-y-6">
              <h3 className="text-2xl font-black flex items-center gap-2"><span className="material-symbols-rounded text-lazy-500">hotel</span> 게으름 정도</h3>
              <input type="range" min="1" max="5" step="1" value={request.lazinessLevel} onChange={(e)=>setRequest({...request, lazinessLevel:parseInt(e.target.value)})} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-lazy-500" />
              <div className="flex justify-between text-xs font-bold text-slate-400"><span>살짝 귀찮음</span><span>Lv.{request.lazinessLevel}</span><span>영혼만 여행</span></div>
            </section>

            <section className="space-y-6">
              <h3 className="text-2xl font-black">어디까지 갈 건가요?</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.values(Region).map(r => (
                  <button key={r} type="button" onClick={()=>setRequest({...request, region:r})} className={`p-5 rounded-3xl border-2 text-left transition-all ${request.region === r ? 'border-lazy-500 bg-lazy-500 text-white shadow-lg' : 'border-slate-100 bg-white text-slate-400'}`}>
                    <span className="font-black text-sm">{r}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <h3 className="text-2xl font-black">기본 설정</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(TransportMode).map(m => (
                    <button key={m} type="button" onClick={()=>setRequest({...request, transport:m})} className={`p-6 rounded-4xl border-2 flex flex-col gap-2 ${request.transport === m ? 'border-lazy-900 bg-lazy-900 text-white shadow-lg' : 'border-slate-100'}`}>
                      <span className="material-symbols-rounded text-3xl">{m.includes('자차') ? 'directions_car' : 'subway'}</span>
                      <span className="font-black text-sm">{m.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
                <button type="button" onClick={()=>setRequest({...request, includeFood:!request.includeFood})} className={`w-full p-6 rounded-4xl border-2 flex items-center justify-between transition-all ${request.includeFood ? 'border-lazy-500 bg-slate-50 text-lazy-500' : 'border-slate-100 text-slate-400'}`}>
                  <span className="font-black">유명 맛집 무조건 포함</span>
                  <span className="material-symbols-rounded">{request.includeFood ? 'toggle_on' : 'toggle_off'}</span>
                </button>
              </div>
            </section>

            <button type="submit" className="w-full py-10 bg-lazy-500 text-white rounded-[3rem] font-black text-2xl shadow-2xl shadow-lazy-200">
              최소 동선 계산하기
            </button>
          </form>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-32 space-y-8 fade-in-up">
            <div className="w-32 h-32 bg-lazy-100 rounded-5xl flex items-center justify-center animate-bounce shadow-2xl">
              <span className="material-symbols-rounded text-6xl text-lazy-500">airline_seat_recline_extra</span>
            </div>
            <h2 className="text-2xl font-black text-center px-10">{loadingMsg}</h2>
          </div>
        )}

        {step === 'result' && parsedData && (
          <div className="fade-in-up space-y-12">
            <div className="bg-lazy-900 rounded-[3rem] p-8 sm:p-12 text-white space-y-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-8 right-8 bg-lazy-500 px-4 py-2 rounded-2xl font-black text-sm">Lv.{request.lazinessLevel}</div>
              <h2 className="text-4xl sm:text-5xl font-black leading-tight pr-12">{parsedData.title}</h2>
              <div className="p-6 bg-white/10 rounded-3xl border border-white/10 backdrop-blur-md">
                <p className="italic font-medium text-lg opacity-90">"{parsedData.comment}"</p>
              </div>
              <div className="flex gap-4 items-center">
                <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-lazy-500" style={{width: `${parsedData.difficulty}%`}}></div>
                </div>
                <span className="font-black text-xs uppercase tracking-widest">Lazy Score {parsedData.difficulty}%</span>
              </div>
            </div>

            <div className="space-y-16 relative">
              <div className="absolute left-[26px] top-10 bottom-10 w-1 bg-slate-100"></div>
              {parsedData.days.map((day: any) => (
                <div key={day.day} className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-lazy-900 text-white px-6 py-2 rounded-full font-black text-sm z-10 shadow-lg">Day {day.day}</div>
                  </div>
                  <div className="grid gap-10">
                    {day.activities.map((act: any, idx: number) => (
                      <div key={idx} className="relative pl-16 group">
                        <div className="absolute left-[20px] top-6 w-4 h-4 rounded-full bg-white border-4 border-lazy-500 z-10 group-hover:scale-125 transition-transform"></div>
                        <div className="lazy-card p-8 space-y-6">
                          <div className="flex justify-between items-start">
                            <h4 className="text-2xl font-black">{act.name}</h4>
                            <div className="flex gap-1">
                              {[...Array(5)].map((_, i) => (
                                <span key={i} className={`material-symbols-rounded text-sm ${i < act.photo ? 'text-lazy-500' : 'text-slate-100'}`}>photo_camera</span>
                              ))}
                            </div>
                          </div>
                          <p className="text-slate-500 font-medium leading-relaxed">{act.desc}</p>
                          <div className="bg-slate-50 p-6 rounded-3xl flex gap-4 items-start border border-slate-100">
                            <span className="material-symbols-rounded text-lazy-500">lightbulb</span>
                            <p className="text-sm font-bold text-slate-700">{act.tip}</p>
                          </div>
                          {act.mapLink && (
                            <a href={act.mapLink.uri} target="_blank" className="inline-flex items-center gap-2 text-lazy-500 font-black text-sm border-b-2 border-lazy-100 pb-1">
                              지도에서 보기 <span className="material-symbols-rounded text-sm">open_in_new</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-10 space-y-4">
              <button onClick={savePlan} className="w-full py-8 bg-lazy-900 text-white rounded-[2.5rem] font-black text-xl flex items-center justify-center gap-3 shadow-xl">
                <span className="material-symbols-rounded">bookmark</span> 보관함에 넣고 눕기
              </button>
              <button onClick={() => setStep('home')} className="w-full py-6 text-slate-400 font-bold hover:text-lazy-900 transition-colors">초기화하고 다시 짜기</button>
            </div>
          </div>
        )}

        {step === 'mypage' && (
          <div className="fade-in-up space-y-10">
            <h2 className="text-4xl font-black">나의 게으른 여정들</h2>
            {savedTravels.length === 0 ? (
              <div className="py-20 text-center space-y-4 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
                <span className="material-symbols-rounded text-6xl text-slate-200">bedtime</span>
                <p className="text-slate-400 font-bold">아직 저장된 여정이 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {savedTravels.map(t => (
                  <div key={t.id} onClick={() => { setRawResult({ text: t.content, links: t.links }); setStep('result'); window.scrollTo(0, 0); }} className="lazy-card p-8 cursor-pointer relative group">
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <span className="bg-lazy-100 text-lazy-500 px-3 py-1 rounded-lg text-[10px] font-black">{t.region}</span>
                        <span className="text-slate-300 text-[10px] font-bold">{t.savedAt}</span>
                      </div>
                      <h3 className="text-2xl font-black group-hover:text-lazy-500 transition-colors">{t.title}</h3>
                      <p className="text-slate-400 text-sm font-medium">게으름 지수 {t.totalDifficulty}%의 완벽한 눕방</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setStep('home')} className="w-full py-6 text-lazy-500 font-black flex items-center justify-center gap-2">
              <span className="material-symbols-rounded">arrow_back</span> 홈으로 돌아가기
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
