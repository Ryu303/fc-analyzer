'use client';

import React, { useState, useEffect } from 'react';

interface MatchStats {
  matchResult: string;
  possession: number;
  averageRating: number;
  controller: string;
  shootTotal: number;
  effectiveShootTotal: number;
  goalTotal: number;
}

interface GoalkeeperData {
  name: string;
  ovr: number;
  saves: number;
  conceded: number;
  saveRate: number;
}

interface MvpData {
  name: string;
  rating: number;
}

interface TeamData {
  nickname: string;
  ovr: number;
  stats: MatchStats;
  gk?: GoalkeeperData;
  mvp?: MvpData;
  scorers?: string[];
}

interface AnalysisResult {
  probability: number;
  comment: string;
  reason: string;
  type: 'goldpost' | 'oneshot' | 'slow' | 'clean';
}

interface AnalyzeResponse {
  isMock: boolean;
  matchId: string;
  matchDate: string;
  matchType: number;
  user: TeamData;
  opponent: TeamData;
  analysis: AnalysisResult;
  apiErrorOccurred?: boolean;
  errorMessage?: string;
}

interface MatchListItem {
  matchId: string;
  matchResult: string;
  oppNickname: string;
  userScore: number;
  oppScore: number;
  matchDate: string;
}

export default function Home() {
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [matches, setMatches] = useState<MatchListItem[] | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadingStep, setDetailLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadingSteps = [
    '넥슨 데이터 센터에 유저 정보를 조회하고 있습니다...',
    '공식 경기 최근 매치 데이터를 연동하는 중입니다...',
    '경기 상세 정보 및 양 팀 스탯을 파싱하고 있습니다...',
    '골대 타격률, 선방 데이터, 능력치 격차 대비 보정 알고리즘을 연산하고 있습니다...',
    '최종 리포트 작성을 완료하는 중입니다...'
  ];

  const detailLoadingSteps = [
    '해당 매치 ID의 전체 기록을 가져오는 중입니다...',
    '양 팀 선수들의 OVR 및 강화 수치를 집계하고 있습니다...',
    '유효 슈팅 비율, 골키퍼 선방률, 보정 수치를 계산하는 중입니다...',
    '에스포트 스페셜 분석 매치업 카드를 생성하고 있습니다...',
    '최종 결과 리포트 작성을 완료했습니다!'
  ];

  // 로딩 단계 텍스트 전환 애니메이션
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => {
          if (prev < loadingSteps.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, 1200);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // 상세 분석 로딩 단계 애니메이션
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (detailLoading) {
      setDetailLoadingStep(0);
      interval = setInterval(() => {
        setDetailLoadingStep((prev) => {
          if (prev < detailLoadingSteps.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, 1200);
    }
    return () => clearInterval(interval);
  }, [detailLoading]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!nickname.trim()) {
      setError('구단주(닉네임)명을 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setMatches(null);

    try {
      const res = await fetch(`/api/analyze?nickname=${encodeURIComponent(nickname.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '분석 중 오류가 발생했습니다.');
      }

      if (data.matches) {
        setMatches(data.matches);
      } else {
        throw new Error('최근 경기 정보를 파싱할 수 없습니다.');
      }
    } catch (err: any) {
      setError(err.message || '네트워크 통신 중 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDetailSearch = async (matchId: string) => {
    setDetailLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/analyze?nickname=${encodeURIComponent(nickname.trim())}&matchId=${matchId}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '상세 분석 중 오류가 발생했습니다.');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || '매치 데이터를 연동하는 중 에러가 발생했습니다.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleQuickTest = () => {
    setNickname('test');
    setTimeout(() => {
      handleSearch();
    }, 50);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return dateStr;
    }
  };

  const getBadgeStyles = (type: string) => {
    switch (type) {
      case 'goldpost':
        return {
          bg: 'bg-red-950/60 text-red-400 border-red-800/80',
          text: '골대 저주 억까형 보정',
          shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.25)] border-neon-red'
        };
      case 'oneshot':
        return {
          bg: 'bg-amber-950/60 text-amber-400 border-amber-800/80',
          text: '상대 1타 1피 결정력 보정',
          shadow: 'shadow-[0_0_15px_rgba(245,158,11,0.25)] border-amber-700/50'
        };
      case 'slow':
        return {
          bg: 'bg-yellow-950/60 text-yellow-300 border-yellow-800/80',
          text: '스쿼드 체감/OVR 역보정',
          shadow: 'shadow-[0_0_15px_rgba(234,179,8,0.25)] border-yellow-700/50'
        };
      default:
        return {
          bg: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80',
          text: '보정 청정실력 구역 (클린 매치)',
          shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.25)] border-emerald-700/50'
        };
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center px-4 py-12 md:py-24 text-gray-200">
      {/* 축구장 스태디움 조명 효과 */}
      <div className="stadium-bg-glow" />

      {/* 헤더 섹션 */}
      <header className="text-center mb-12 max-w-2xl z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-4 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          Nexon OpenAPI Engine v1.0
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-3">
          FC 온라인 <span className="text-emerald-400 text-neon-green">보정 분석기</span>
        </h1>
        <p className="text-gray-400 text-sm md:text-base leading-relaxed">
          경기 결과 뒤에 숨겨진 보정(스크립트)의 기운을 계량화합니다. <br />
          최근 치른 1경기의 유효 슈팅 비율, 점유율 및 스쿼드 격차를 분석해 의심 확률을 제공합니다.
        </p>
      </header>

      {/* 메인 서치 박스 */}
      <main className="w-full max-w-3xl z-10 flex flex-col gap-8 flex-1">
        <section className="glass-panel rounded-2xl p-6 md:p-8 transition-all duration-300">
          <form id="search-form" onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">⚽</span>
              <input
                id="nickname-input"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="넥슨 공식 닉네임(구단주) 입력..."
                className="w-full pl-11 pr-4 py-3.5 bg-black/50 border border-emerald-900/60 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all text-sm md:text-base font-semibold"
                disabled={loading}
              />
            </div>
            <button
              id="analyze-btn"
              type="submit"
              disabled={loading}
              className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-emerald-800/50 text-black font-extrabold rounded-xl shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer text-sm md:text-base flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-black" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  분석 중...
                </>
              ) : (
                '최근 경기 분석'
              )}
            </button>
          </form>

          {/* 에러 피드백 */}
          {error && (
            <div className="mt-4 p-3 bg-red-950/40 border border-red-500/30 rounded-lg text-red-300 text-xs md:text-sm flex items-center gap-2 animate-shake">
              <span>⚠️</span>
              <p>{error}</p>
            </div>
          )}

          {/* 퀵 가이드 및 테스트 */}
          {!loading && !result && (
            <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-emerald-950/80 pt-6 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">📌</span>
                <span>넥슨 API가 준비되지 않았어도 <b>"test"</b>를 검색하시면 샘플 리포트를 체험하실 수 있습니다.</span>
              </div>
              <button
                type="button"
                onClick={handleQuickTest}
                className="px-3 py-1.5 bg-emerald-950/50 hover:bg-emerald-900 border border-emerald-900/50 text-emerald-400 rounded-md font-semibold cursor-pointer transition-all self-start md:self-auto hover:text-emerald-300"
              >
                테스트 데이터로 즉시 확인
              </button>
            </div>
          )}
        </section>

        {/* 로딩 상태화면 */}
        {loading && (
          <section className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px] text-center animate-pulse">
            <div className="relative w-20 h-20 mb-6">
              {/* 축구장 전경 형상 스피너 */}
              <div className="absolute inset-0 rounded-full border-4 border-emerald-950" />
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
              <div className="absolute inset-2 bg-black/60 rounded-full flex items-center justify-center text-2xl">⚽</div>
            </div>
            <h3 className="text-lg md:text-xl font-bold text-white mb-2 animate-bounce">
              데이터 연동 및 분석 중...
            </h3>
            <p className="text-gray-400 text-xs md:text-sm max-w-md h-12 flex items-center justify-center font-medium leading-relaxed">
              {loadingSteps[loadingStep]}
            </p>
            
            <div className="w-full max-w-xs bg-emerald-950 h-1.5 rounded-full mt-6 overflow-hidden">
              <div 
                className="bg-emerald-400 h-full rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${((loadingStep + 1) / loadingSteps.length) * 100}%` }}
              />
            </div>
          </section>
        )}

        {/* 상세 분석 중 로딩 화면 */}
        {detailLoading && (
          <section className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px] text-center animate-pulse">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-950" />
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
              <div className="absolute inset-2 bg-black/60 rounded-full flex items-center justify-center text-2xl">⚡</div>
            </div>
            <h3 className="text-lg md:text-xl font-bold text-white mb-2 animate-bounce">
              선택한 경기 상세 분석 및 보정 지수 산출 중...
            </h3>
            <p className="text-gray-400 text-xs md:text-sm max-w-md h-12 flex items-center justify-center font-medium leading-relaxed">
              {detailLoadingSteps[detailLoadingStep]}
            </p>
            
            <div className="w-full max-w-xs bg-emerald-950 h-1.5 rounded-full mt-6 overflow-hidden">
              <div 
                className="bg-emerald-400 h-full rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${((detailLoadingStep + 1) / detailLoadingSteps.length) * 100}%` }}
              />
            </div>
          </section>
        )}

        {/* 최근 5경기 매치 리스트 */}
        {matches && !detailLoading && !result && (
          <section className="glass-panel rounded-2xl p-6 md:p-8 animate-fade-in flex flex-col gap-6">
            <div className="border-b border-emerald-950/80 pb-4 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>📅</span> 최근 5경기 리스트
                </h3>
                <p className="text-xs text-gray-500 mt-1">상세 분석할 경기를 선택하여 보정 분석을 진행하세요.</p>
              </div>
              <span className="px-2.5 py-1 bg-emerald-950/80 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg animate-pulse">
                구단주: {nickname}
              </span>
            </div>

            <div className="flex flex-col gap-3.5">
              {matches.map((match) => {
                const isWin = match.matchResult === '승';
                const isLose = match.matchResult === '패';
                
                return (
                  <div 
                    key={match.matchId}
                    className="p-4 rounded-xl bg-black/35 hover:bg-black/50 border border-emerald-950/40 hover:border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-200"
                  >
                    {/* 경기 정보 요약 */}
                    <div className="flex flex-wrap items-center gap-4 text-sm w-full sm:w-auto justify-between sm:justify-start">
                      {/* 승패 배지 */}
                      <span className={`px-3 py-1 text-xs font-black rounded-lg border text-center min-w-[50px] ${
                        isWin ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80 shadow-[0_0_10px_rgba(16,185,129,0.15)]' :
                        isLose ? 'text-red-400 bg-red-950/60 border-red-800/80 shadow-[0_0_10px_rgba(239,68,68,0.15)]' :
                        'text-gray-400 bg-gray-900 border-gray-800'
                      }`}>
                        {match.matchResult}
                      </span>
                      
                      {/* 매치 상대방 및 점수 */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-gray-400 text-xs font-medium">VS</span>
                        <span className="font-extrabold text-white text-base tracking-tight">{match.oppNickname}</span>
                        <span className="px-2 py-0.5 bg-black/60 border border-emerald-950/60 rounded text-emerald-400 text-xs font-black tracking-widest ml-1">
                          {match.userScore} : {match.oppScore}
                        </span>
                      </div>
                    </div>

                    {/* 날짜 및 분석하기 버튼 */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto border-t sm:border-t-0 border-emerald-950/40 pt-3 sm:pt-0">
                      <span className="text-[11px] text-gray-500 font-semibold">{formatDate(match.matchDate)}</span>
                      <button
                        type="button"
                        onClick={() => handleDetailSearch(match.matchId)}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black text-xs font-black rounded-lg shadow-md transition-all cursor-pointer flex items-center gap-1"
                      >
                        보정 분석하기 ⚡
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 분석 결과 카드 리포트 (모달 팝업 형태) */}
        {result && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-4xl bg-[#030d07]/95 border border-emerald-500/20 rounded-3xl shadow-2xl relative max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-900 scrollbar-track-transparent flex flex-col">
              {/* 모달 헤더 - 고정 */}
              <div className="flex justify-between items-center border-b border-emerald-950/80 px-6 md:px-8 py-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📊</span>
                  <h3 className="text-lg md:text-xl font-black text-white">매치 상세 보정 분석 리포트</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="px-3.5 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800/80 text-emerald-400 text-xs font-black rounded-lg transition-all cursor-pointer"
                >
                  ✕ 닫기
                </button>
              </div>
              {/* 스크롤 가능 콘텐츠 영역 */}
              <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6 flex flex-col gap-6 scrollbar-thin scrollbar-thumb-emerald-900 scrollbar-track-transparent">
            {/* 1. 요약 및 게이지 카드 */}
            <div className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
              {/* API 에러 발생 시 Fallback 알림 뱃지 */}
              {result.apiErrorOccurred && (
                <div className="absolute -right-16 top-6 rotate-45 bg-amber-500 text-black text-[10px] font-black py-1 px-16 text-center shadow-md select-none">
                  FALLBACK MOCK
                </div>
              )}

              {/* dynamic probability circle */}
              <div className="relative w-44 h-44 flex-shrink-0 flex items-center justify-center">
                {/* SVG circular progress */}
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="rgba(16, 185, 129, 0.05)"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke={result.analysis.probability >= 80 ? 'rgb(239, 68, 68)' : result.analysis.probability >= 40 ? 'rgb(245, 158, 11)' : 'rgb(16, 185, 129)'}
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={263.8}
                    strokeDashoffset={263.8 - (263.8 * result.analysis.probability) / 100}
                    className="transition-all duration-1000 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className={`text-4xl md:text-5xl font-black ${result.analysis.probability >= 80 ? 'text-red-500 text-neon-red' : result.analysis.probability >= 40 ? 'text-amber-400' : 'text-emerald-400 text-neon-green'}`}>
                    {result.analysis.probability}%
                  </span>
                  <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest mt-1">의심 수치</span>
                </div>
              </div>

              {/* 텍스트 설명 */}
              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
                  <span className={`inline-block px-3 py-1.5 rounded-lg border text-xs font-bold ${getBadgeStyles(result.analysis.type).bg} ${result.analysis.probability >= 80 ? getBadgeStyles(result.analysis.type).shadow : ''}`}>
                    {getBadgeStyles(result.analysis.type).text}
                  </span>
                  <span className="text-gray-500 text-xs self-center font-medium">
                    최근 매치 ID: {result.matchId.startsWith('mock_') ? '테스트 매치' : result.matchId.substring(0, 12)}...
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">
                  "이 경기의 보정 의심 확률은 <span className={result.analysis.probability >= 80 ? 'text-red-500 text-neon-red font-black' : result.analysis.probability >= 40 ? 'text-amber-400 font-black' : 'text-emerald-400 text-neon-green font-black'}>{result.analysis.probability}%</span> 입니다!"
                </h2>
                <p className="text-gray-400 text-sm leading-relaxed border-l-2 border-emerald-500/30 pl-4 italic bg-emerald-950/10 py-2 rounded-r-lg">
                  {result.analysis.comment}
                </p>
              </div>
            </div>

            {/* 2. 스쿼드 및 스탯 비교 카드 */}
            <div className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col gap-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-emerald-950/80 pb-4">
                📊 상세 경기 스탯 매칭 리포트
              </h3>
              
              {/* 유저 vs 상대 닉네임 / OVR */}
              <div className="grid grid-cols-3 items-center text-center bg-black/40 p-4 rounded-xl border border-emerald-950">
                <div className="text-left">
                  <p className="text-gray-500 text-xs font-bold mb-1">내 구단</p>
                  <p className="text-emerald-400 font-black text-base truncate">{result.user.nickname}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-950 border border-emerald-500/30 text-emerald-400 text-[10px] rounded font-bold">
                    OVR {result.user.ovr}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-gray-500">경기 결과</span>
                  <span className={`text-xl font-black mt-1 ${result.user.stats.matchResult === '승' ? 'text-emerald-400 text-neon-green' : result.user.stats.matchResult === '패' ? 'text-red-400' : 'text-gray-400'}`}>
                    {result.user.stats.matchResult === '무' ? '무승부' : result.user.stats.matchResult === '승' ? '승리' : '패배'}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-gray-500 text-xs font-bold mb-1">상대 구단</p>
                  <p className="text-amber-400 font-black text-base truncate">{result.opponent.nickname}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-amber-950/60 border border-amber-500/30 text-amber-400 text-[10px] rounded font-bold">
                    OVR {result.opponent.ovr}
                  </span>
                </div>
              </div>

              {/* 세부 수치 그래프식 대결 */}
              <div className="flex flex-col gap-5 mt-2">
                {/* 0. 평균 OVR 비교 */}
                <div className="flex flex-col gap-1.5 animate-pulse-subtle">
                  <div className="flex justify-between text-xs font-bold text-gray-400">
                    <span className="text-emerald-400 font-extrabold">OVR {result.user.ovr}</span>
                    <span className="text-white font-black">평균 스쿼드 능력치 (OVR)</span>
                    <span className="text-amber-400 font-extrabold">OVR {result.opponent.ovr}</span>
                  </div>
                  <div className="w-full bg-black/60 h-4 rounded-full overflow-hidden flex border border-emerald-950/60 p-0.5">
                    <div 
                      className={`h-full flex items-center justify-end pr-2 text-[9px] font-black text-black rounded-l-full transition-all duration-1000 ${result.user.ovr > result.opponent.ovr ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-emerald-600/40 text-emerald-300'}`}
                      style={{ width: `${(result.user.ovr / Math.max(1, result.user.ovr + result.opponent.ovr)) * 100}%` }}
                    >
                      {result.user.ovr}
                    </div>
                    <div 
                      className={`h-full flex items-center justify-start pl-2 text-[9px] font-black text-black rounded-r-full transition-all duration-1000 ${result.opponent.ovr > result.user.ovr ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-amber-600/40 text-amber-300'}`}
                      style={{ width: `${(result.opponent.ovr / Math.max(1, result.user.ovr + result.opponent.ovr)) * 100}%` }}
                    >
                      {result.opponent.ovr}
                    </div>
                  </div>
                </div>

                {/* 1. 득점 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-bold text-gray-400">
                    <span>{result.user.stats.goalTotal} 골</span>
                    <span className="text-white font-black">득점 (Score)</span>
                    <span>{result.opponent.stats.goalTotal} 골</span>
                  </div>
                  <div className="w-full bg-black/60 h-2.5 rounded-full overflow-hidden flex">
                    <div 
                      className={`h-full rounded-l-full ${result.user.stats.goalTotal > result.opponent.stats.goalTotal ? 'bg-emerald-400' : 'bg-emerald-600/50'}`}
                      style={{ width: `${(result.user.stats.goalTotal / Math.max(1, result.user.stats.goalTotal + result.opponent.stats.goalTotal)) * 100}%` }}
                    />
                    <div 
                      className={`h-full rounded-r-full ${result.opponent.stats.goalTotal > result.user.stats.goalTotal ? 'bg-amber-400' : 'bg-amber-600/50'}`}
                      style={{ width: `${(result.opponent.stats.goalTotal / Math.max(1, result.user.stats.goalTotal + result.opponent.stats.goalTotal)) * 100}%` }}
                    />
                  </div>
                </div>

                {/* 2. 슈팅 수 / 유효 슈팅 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-bold text-gray-400">
                    <span>{result.user.stats.shootTotal}개 / 유효 {result.user.stats.effectiveShootTotal}개</span>
                    <span className="text-white font-black">슈팅 / 유효 슈팅</span>
                    <span>{result.opponent.stats.shootTotal}개 / 유효 {result.opponent.stats.effectiveShootTotal}개</span>
                  </div>
                  <div className="w-full bg-black/60 h-2.5 rounded-full overflow-hidden flex">
                    <div 
                      className={`h-full rounded-l-full ${result.user.stats.shootTotal > result.opponent.stats.shootTotal ? 'bg-emerald-400' : 'bg-emerald-600/50'}`}
                      style={{ width: `${(result.user.stats.shootTotal / Math.max(1, result.user.stats.shootTotal + result.opponent.stats.shootTotal)) * 100}%` }}
                    />
                    <div 
                      className={`h-full rounded-r-full ${result.opponent.stats.shootTotal > result.user.stats.shootTotal ? 'bg-amber-400' : 'bg-amber-600/50'}`}
                      style={{ width: `${(result.opponent.stats.shootTotal / Math.max(1, result.user.stats.shootTotal + result.opponent.stats.shootTotal)) * 100}%` }}
                    />
                  </div>
                </div>

                {/* 3. 유효슈팅 대비 득점률 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-bold text-gray-400">
                    <span>{((result.user.stats.goalTotal / Math.max(1, result.user.stats.effectiveShootTotal)) * 100).toFixed(0)}%</span>
                    <span className="text-white font-black">유효슈팅 결정력 (Conversion)</span>
                    <span>{((result.opponent.stats.goalTotal / Math.max(1, result.opponent.stats.effectiveShootTotal)) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-black/60 h-2.5 rounded-full overflow-hidden flex">
                    <div 
                      className="h-full rounded-l-full bg-emerald-400"
                      style={{ width: `${((result.user.stats.goalTotal / Math.max(1, result.user.stats.effectiveShootTotal)) / Math.max(0.1, (result.user.stats.goalTotal / Math.max(1, result.user.stats.effectiveShootTotal)) + (result.opponent.stats.goalTotal / Math.max(1, result.opponent.stats.effectiveShootTotal)))) * 100}%` }}
                    />
                    <div 
                      className="h-full rounded-r-full bg-amber-400"
                      style={{ width: `${((result.opponent.stats.goalTotal / Math.max(1, result.opponent.stats.effectiveShootTotal)) / Math.max(0.1, (result.user.stats.goalTotal / Math.max(1, result.user.stats.effectiveShootTotal)) + (result.opponent.stats.goalTotal / Math.max(1, result.opponent.stats.effectiveShootTotal)))) * 100}%` }}
                    />
                  </div>
                </div>

                {/* 4. 점유율 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-bold text-gray-400">
                    <span>{result.user.stats.possession}%</span>
                    <span className="text-white font-black">볼 점유율 (Possession)</span>
                    <span>{result.opponent.stats.possession}%</span>
                  </div>
                  <div className="w-full bg-black/60 h-2.5 rounded-full overflow-hidden flex">
                    <div 
                      className="h-full rounded-l-full bg-emerald-400"
                      style={{ width: `${result.user.stats.possession}%` }}
                    />
                    <div 
                      className="h-full rounded-r-full bg-amber-400"
                      style={{ width: `${result.opponent.stats.possession}%` }}
                    />
                  </div>
                </div>

                {/* 5. 평균 선수 평점 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-bold text-gray-400">
                    <span>{result.user.stats.averageRating.toFixed(1)} / 10</span>
                    <span className="text-white font-black">평균 선수 평점 (Rating)</span>
                    <span>{result.opponent.stats.averageRating.toFixed(1)} / 10</span>
                  </div>
                  <div className="w-full bg-black/60 h-2.5 rounded-full overflow-hidden flex">
                    <div 
                      className="h-full rounded-l-full bg-emerald-400"
                      style={{ width: `${(result.user.stats.averageRating / (result.user.stats.averageRating + result.opponent.stats.averageRating)) * 100}%` }}
                    />
                    <div 
                      className="h-full rounded-r-full bg-amber-400"
                      style={{ width: `${(result.opponent.stats.averageRating / (result.user.stats.averageRating + result.opponent.stats.averageRating)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

              {/* ✨ 팀별 경기 MVP & 득점 현황 */}
              {((result.user.mvp && result.opponent.mvp) || (result.user.scorers && result.opponent.scorers)) && (
                <div className="mt-8 pt-6 border-t border-emerald-950/80 flex flex-col gap-4">
                  <h4 className="text-sm font-black text-emerald-400 flex items-center gap-2 tracking-wide uppercase">
                    ✨ 팀별 경기 MVP & 득점 현황
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 내 팀 하이라이트 */}
                    <div className="bg-emerald-950/10 border border-emerald-500/20 p-4 rounded-2xl flex flex-col gap-2 relative">
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-emerald-950 border border-emerald-500/30 text-emerald-400 text-[9px] rounded font-extrabold uppercase">
                        내 구단 하이라이트
                      </span>
                      {result.user.mvp && (
                        <div className="flex flex-col gap-0.5 bg-black/40 p-3 rounded-xl border border-emerald-950/40">
                          <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">경기 MVP (최고 평점)</p>
                          <p className="text-xs text-gray-200 font-bold mt-1">
                            이름:{' '}
                            <span className="text-sm font-black text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">
                              {result.user.mvp.name}
                            </span>
                          </p>
                          <p className="text-[10px] text-gray-400 font-semibold mt-0.5">평점: <span className="text-emerald-400 font-black">{result.user.mvp.rating.toFixed(1)}</span> / 10</p>
                        </div>
                      )}
                      {result.user.scorers && (
                        <div className="flex flex-col gap-1 bg-black/40 p-3 rounded-xl border border-emerald-950/40 mt-1">
                          <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">득점자 명단</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {result.user.scorers.map((s, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-emerald-950 border border-emerald-500/30 text-emerald-400 text-[10px] rounded font-black">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 상대 팀 하이라이트 */}
                    <div className="bg-amber-950/10 border border-amber-500/20 p-4 rounded-2xl flex flex-col gap-2 relative">
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-amber-950 border border-amber-500/30 text-amber-400 text-[9px] rounded font-extrabold uppercase">
                        상대 구단 하이라이트
                      </span>
                      {result.opponent.mvp && (
                        <div className="flex flex-col gap-0.5 bg-black/40 p-3 rounded-xl border border-amber-950/40">
                          <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">경기 MVP (최고 평점)</p>
                          <p className="text-xs text-gray-200 font-bold mt-1">
                            이름:{' '}
                            <span className="text-sm font-black text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]">
                              {result.opponent.mvp.name}
                            </span>
                          </p>
                          <p className="text-[10px] text-gray-400 font-semibold mt-0.5">평점: <span className="text-amber-400 font-black">{result.opponent.mvp.rating.toFixed(1)}</span> / 10</p>
                        </div>
                      )}
                      {result.opponent.scorers && (
                        <div className="flex flex-col gap-1 bg-black/40 p-3 rounded-xl border border-amber-950/40 mt-1">
                          <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">득점자 명단</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {result.opponent.scorers.map((s, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-amber-950 border border-amber-500/30 text-amber-400 text-[10px] rounded font-black">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 🧤 골키퍼 스페셜 매치업 */}
              {result.user.gk && result.opponent.gk && (
                <div className="mt-8 pt-6 border-t border-emerald-950/80 flex flex-col gap-4">
                  <h4 className="text-sm font-black text-emerald-400 flex items-center gap-2 tracking-wide uppercase">
                    🧤 골키퍼 스페셜 매치업 (Goalkeeper Matchup)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-emerald-950/20 border border-emerald-500/20 p-5 rounded-2xl relative overflow-hidden">
                    {/* 내 키퍼 */}
                    <div className="flex flex-col gap-2 bg-black/40 p-4 rounded-xl border border-emerald-950/40 relative">
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-emerald-950 border border-emerald-500/30 text-emerald-400 text-[9px] rounded font-extrabold uppercase">
                        내 구단 GK
                      </span>
                      <p className="text-gray-400 text-xs font-bold">이름: <span className="text-sm font-black text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.4)] tracking-tight">{result.user.gk.name}</span></p>
                      <div className="flex justify-between items-center text-xs font-extrabold text-gray-200 mt-1">
                        <span>능력치 (OVR): <span className="text-emerald-400 font-black">{result.user.gk.ovr}</span></span>
                        <span>선방률: <span className="text-emerald-400 font-black">{result.user.gk.saveRate}%</span></span>
                      </div>
                      
                      {/* 선방률 게이지 */}
                      <div className="w-full bg-black/60 h-2 rounded-full overflow-hidden mt-1 border border-emerald-950">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-1000"
                          style={{ width: `${result.user.gk.saveRate}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 font-bold mt-1">선방 횟수: {result.user.gk.saves}회 / 실점: {result.user.gk.conceded}골</p>
                    </div>

                    {/* 상대 키퍼 */}
                    <div className="flex flex-col gap-2 bg-black/40 p-4 rounded-xl border border-amber-950/40 relative">
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-amber-950/60 border border-amber-500/30 text-amber-400 text-[9px] rounded font-extrabold uppercase">
                        상대 GK
                      </span>
                      <p className="text-gray-400 text-xs font-bold">이름: <span className="text-sm font-black text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.4)] tracking-tight">{result.opponent.gk.name}</span></p>
                      <div className="flex justify-between items-center text-xs font-extrabold text-gray-200 mt-1">
                        <span>능력치 (OVR): <span className="text-amber-400 font-black">{result.opponent.gk.ovr}</span></span>
                        <span>선방률: <span className="text-amber-400 font-black">{result.opponent.gk.saveRate}%</span></span>
                      </div>
                      
                      {/* 선방률 게이지 */}
                      <div className="w-full bg-black/60 h-2 rounded-full overflow-hidden mt-1 border border-amber-950">
                        <div 
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-1000"
                          style={{ width: `${result.opponent.gk.saveRate}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 font-bold mt-1">선방 횟수: {result.opponent.gk.saves}회 / 실점: {result.opponent.gk.conceded}골</p>
                    </div>

                    {/* GK 매치업 분석 텍스트 */}
                    <div className="md:col-span-2 mt-2 bg-black/60 p-3.5 rounded-xl border border-emerald-950/80">
                      <p className="text-xs text-emerald-300 font-semibold leading-relaxed">
                        🔍 <b>골키퍼 단일 매치 분석:</b>{' '}
                        {result.user.gk.ovr - result.opponent.gk.ovr >= 10 && result.user.gk.saveRate < result.opponent.gk.saveRate - 30 ? (
                          <span className="text-red-400 font-extrabold">
                            🚨 상대 저급여 키퍼({result.opponent.gk.name}, OVR {result.opponent.gk.ovr})가 미친 선방쇼(선방률 {result.opponent.gk.saveRate}%)를 보여준 반면, 당신의 고급여 키퍼({result.user.gk.name}, OVR {result.user.gk.ovr})는 아무것도 하지 못했습니다. 보정 스크립트에 의해 키퍼 AI 손가락이 다 부러졌음이 의심됩니다!
                          </span>
                        ) : result.user.gk.saveRate > result.opponent.gk.saveRate ? (
                          <span>
                            우리 골키퍼({result.user.gk.name})가 안정적인 선방률({result.user.gk.saveRate}%)을 유지하여 골문을 견고히 지켰습니다.
                          </span>
                        ) : (
                          <span>
                            양 팀 골키퍼가 각자의 오버롤에 걸맞은 무난한 세이브 활약을 기록했습니다.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 하단 메타 정보 */}
              <div className="mt-2 pt-4 border-t border-emerald-950/80 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500 font-semibold justify-between">
                <div>경기 일시: {formatDate(result.matchDate)}</div>
                <div className="capitalize">입력 디바이스: 내 팀 ({result.user.stats.controller}) / 상대 ({result.opponent.stats.controller})</div>
              </div>
              </div>{/* 스크롤 콘텐츠 영역 닫기 */}

              {/* 모달 푸터 - 고정 */}
              <div className="border-t border-emerald-950/80 flex justify-end gap-3 px-6 md:px-8 py-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="px-6 py-2.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800/80 text-emerald-400 font-extrabold rounded-xl transition-all cursor-pointer text-sm"
                >
                  리스트로 돌아가기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const savedMatchId = result.matchId;
                    setResult(null);
                    handleDetailSearch(savedMatchId);
                  }}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl shadow-lg transition-all cursor-pointer text-sm flex items-center gap-1"
                >
                  ⚡ 현재 경기 재분석
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 푸터 */}
      <footer className="w-full mt-12 text-center text-xs text-gray-600 z-10 py-4">
        <p>© 2026 FC Online Calibration Script Analyzer. All rights reserved.</p>
        <p className="mt-1">This product is created using the NEXON OpenAPI engine, but is not officially endorsed or sponsored by NEXON.</p>
      </footer>
    </div>
  );
}
