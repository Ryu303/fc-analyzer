import { NextResponse } from 'next/server';

// 1. 선수 메타데이터(spid.json) 인메모리 캐싱 및 비동기 조회
let spidMapCache: Map<number, string> | null = null;

async function getSpidMap() {
  if (spidMapCache) {
    return spidMapCache;
  }
  const map = new Map<number, string>();
  try {
    const res = await fetch('https://open.api.nexon.com/static/fconline/meta/spid.json', {
      next: { revalidate: 86400 } // 24시간 캐싱 처리
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          map.set(item.id, item.name);
        }
      }
      spidMapCache = map;
      console.log(`[FC 분석기] 선수 메타데이터 ${map.size}개 로드 완료!`);
    } else {
      console.warn(`[FC 분석기] 선수 메타데이터 로드 실패: ${res.statusText}`);
    }
  } catch (error) {
    console.error('[FC 분석기] 선수 메타데이터 로드 오류:', error);
  }
  return map;
}

interface NexonOuidResponse {
  ouid: string;
}

interface NexonMatchListResponse extends Array<string> {}

interface MatchDetailDTO {
  matchResult: string;
  possession: number;
  averageRating: number;
  controller: string;
  shootTotal: number;
  effectiveShootTotal: number;
  goalTotal: number;
}

interface PlayerDTO {
  spId: number;
  spPosition: number;
  spGrade: number;
  status: {
    spRating: number;
    goal?: number;
    assist?: number;
    shoot?: number;
    effectiveShoot?: number;
  };
}

interface MatchInfoDTO {
  accessId: string;
  nickname: string;
  matchDetail: {
    matchResult: string;
    possession: number;
    averageRating: number;
    controller: string;
    [key: string]: any;
  };
  shoot: {
    shootTotal: number;
    effectiveShootTotal: number;
    goalTotal: number;
    [key: string]: any;
  };
  player: PlayerDTO[];
}

interface MatchDetailResponse {
  matchId: string;
  matchDate: string;
  matchType: number;
  matchInfo: MatchInfoDTO[];
}

// 1. 보정 의심 확률 및 코멘트 계산 알고리즘
function calculateCalibration(
  userNickname: string,
  userStats: MatchDetailDTO,
  oppStats: MatchDetailDTO,
  userOvr: number,
  oppOvr: number,
  userGkOvr: number,
  oppGkOvr: number,
  userGkSaveRate: number,
  oppGkSaveRate: number
) {
  let probability = 20; // 기본 확률 20%
  let comment = '';
  let reason = '';
  let type: 'goldpost' | 'oneshot' | 'slow' | 'clean' = 'clean';

  const isUserLostOrDraw = userStats.matchResult === '패' || userStats.matchResult === '무';
  const ovrDiff = userOvr - oppOvr;
  const userShootConversion = userStats.goalTotal / Math.max(1, userStats.effectiveShootTotal);
  const oppShootConversion = oppStats.goalTotal / Math.max(1, oppStats.effectiveShootTotal);

  const userEffectiveShootRatio = userStats.effectiveShootTotal / Math.max(1, userStats.shootTotal);
  const saves = userStats.effectiveShootTotal - userStats.goalTotal;
  const oppGkSaveRateCalculated = saves / Math.max(1, userStats.effectiveShootTotal);

  // 1. 골키퍼 보정 억까 조건 체크 (가장 강력한 가중치)
  // 내 골키퍼 OVR이 상대 골키퍼 OVR보다 10 이상 높은데 선방률은 상대보다 30% 이상 낮을 때
  const isGkBending = (userGkOvr - oppGkOvr >= 10) && (userGkSaveRate < oppGkSaveRate - 30);

  if (isUserLostOrDraw && isGkBending) {
    probability = Math.floor(Math.random() * 10) + 89; // 89% ~ 99%
    type = 'goldpost';
    reason = '골키퍼 OVR 역보정 및 야신 선방';
    comment = `상대 저급여 키퍼(OVR ${oppGkOvr})가 미친 선방쇼(선방률 ${oppGkSaveRate.toFixed(0)}%)를 보여준 반면, 당신의 고급여 키퍼(OVR ${userGkOvr})는 선방률 ${userGkSaveRate.toFixed(0)}%로 아무것도 하지 못했습니다. 전형적인 키퍼 역보정이 발동한 판입니다!`;
  }
  // 2. 오버롤 우위 속 억까 조건 체크
  else if (isUserLostOrDraw && ovrDiff >= 5 && (userEffectiveShootRatio <= 0.3 || (userStats.effectiveShootTotal >= 3 && oppGkSaveRateCalculated >= 0.8))) {
    probability = Math.floor(Math.random() * 20) + 80; // 80% ~ 99%
    type = 'goldpost';
    reason = '스쿼드 우위 속 슈팅 효율 억까 및 야신 선방';
    comment = `상대보다 오버롤이 평균 ${ovrDiff.toFixed(1)}만큼 높았지만, 슈팅 효율에서 알 수 없는 힘이 작용했습니다. 우리 팀의 유효슈팅 비율은 ${(userEffectiveShootRatio * 100).toFixed(0)}%에 불과했거나, 상대 키퍼의 선방률이 ${(oppGkSaveRateCalculated * 100).toFixed(0)}%에 달했습니다. 보정이 의심 단계를 넘어 확신 단계에 이르렀습니다!`;
  }
  // 3. 오버롤 차이 기준 가중치 (오버롤 차이 OVR 10 이상 vs 5~10 미만)
  else if (isUserLostOrDraw && ovrDiff >= 10) {
    probability = 75; // 확신 단계
    if (userStats.possession >= 55) probability += 10;
    if (userShootConversion <= 0.2) probability += 10;
    type = 'slow';
    reason = '평균 OVR 10 이상 격차 (확신 단계)';
    comment = `상대보다 오버롤이 평균 ${ovrDiff.toFixed(1)}만큼 높았지만, 경기장에서 선수들은 다리가 굳은 듯 움직였습니다. 스쿼드 10 이상의 압도적 격차가 있음에도 패배/무승부를 기록했다는 것은 강력한 체감 보정이 적용되었음을 시사합니다.`;
  }
  else if (isUserLostOrDraw && ovrDiff >= 5 && ovrDiff < 10) {
    probability = 55; // 의심 단계
    if (userStats.possession >= 55) probability += 8;
    if (userShootConversion <= 0.2) probability += 10;
    type = 'slow';
    reason = '평균 OVR 5~10 미만 격차 (의심 단계)';
    comment = `상대보다 오버롤이 평균 ${ovrDiff.toFixed(1)}만큼 우위에 있었지만 아쉬운 무승부 혹은 패배를 맞이했습니다. 선수들의 턴 속도나 반응속도에서 알 수 없는 위화감을 느꼈다면, 5점 이상의 OVR 격차에 따른 보정이 작동했기 때문일 수 있습니다.`;
  }
  // 4. 기존 시나리오들 (골대 저주형, 1타 1피형 등)
  else if (isUserLostOrDraw && userStats.effectiveShootTotal >= 6 && userShootConversion <= 0.15 && oppShootConversion >= 0.6) {
    probability = 65;
    type = 'goldpost';
    reason = '골대 강타 및 야신 모드 발동';
    comment = `유효 슈팅을 무려 ${userStats.effectiveShootTotal}개나 날렸음에도 득점은 단 ${userStats.goalTotal}골에 그쳤습니다. 반면 상대방은 유효 슈팅 대비 골 전환율이 ${(oppShootConversion * 100).toFixed(0)}%에 달했습니다. 골대의 저주와 상대 골키퍼의 초자연적인 선방 쇼가 겹친 억까 보정이 의심됩니다!`;
  }
  else if (isUserLostOrDraw && oppStats.effectiveShootTotal <= 2 && oppStats.goalTotal >= 1 && userStats.effectiveShootTotal >= 4 && userStats.goalTotal < oppStats.goalTotal) {
    probability = 58;
    type = 'oneshot';
    reason = '상대의 극단적인 원샷원킬 득점';
    comment = `상대방의 유효 슈팅은 단 ${oppStats.effectiveShootTotal}개에 불과했으나 ${oppStats.goalTotal}골로 이어지는 신들린 골 결정력을 보였습니다. 반면 우리 팀은 슈팅 찬스를 만들고도 상대 키퍼 정면으로 공이 빨려 들어갑니다. 전형적인 보정의 기운이 감돕니다.`;
  }
  else if (isUserLostOrDraw && userStats.possession >= 57 && userStats.effectiveShootTotal >= 3) {
    probability = 45;
    type = 'slow';
    reason = '점유율 압도 중 역습 피격';
    comment = `경기 점유율을 ${userStats.possession}%나 가져가며 경기장을 완전히 지배했지만, 상대방의 단조로운 역습 한두 번에 수비진이 힘없이 허물어졌습니다. 보정의 영향으로 수비 AI가 멍하니 서 있었을 가능성이 큽니다.`;
  }
  // 5. 무난하고 클린한 경기
  else {
    if (userStats.matchResult === '승') {
      probability = Math.max(5, Math.floor(Math.random() * 15) + 5); // 5~20%
      type = 'clean';
      reason = '비교적 공정했던 승리';
      comment = `축하합니다! 양 팀의 데이터와 경기 운영이 비교적 투명하고 공정한 상태에서 거둔 실력 있는 승리입니다. 이 경기는 보정보다는 순수한 손가락 컨트롤과 전술의 승리입니다!`;
    } else {
      probability = Math.floor(Math.random() * 25) + 15; // 15~40%
      type = 'clean';
      reason = '일반적인 경기 흐름';
      comment = `경기 스탯과 골 결정력이 양 팀 모두 평이한 수준이었습니다. 보정 요소보다는 미세한 골 결정력 차이 또는 경기 도중 집중력 차이로 패배했을 가능성이 큽니다. 다음 경기는 멋진 승리를 기대합니다!`;
    }
  }

  // 최종 확률 5% ~ 99% 범위 보정
  probability = Math.min(99, Math.max(5, probability));

  return {
    probability,
    comment,
    reason,
    type
  };
}

// 2. Mock 데이터 생성 함수
function generateMockData(nickname: string, matchId?: string) {
  const isTest = nickname.toLowerCase() === 'test';
  
  // mock 시나리오 리스트
  const scenarios = [
    {
      // 1. 극강의 억까 + GK 자동문
      userNickname: nickname,
      userStats: {
        matchResult: '패',
        possession: 62,
        averageRating: 7.4,
        controller: 'keyboard',
        shootTotal: 16,
        effectiveShootTotal: 11,
        goalTotal: 1
      },
      oppNickname: '골대장인김덕배',
      oppStats: {
        matchResult: '승',
        possession: 38,
        averageRating: 6.2,
        controller: 'pad',
        shootTotal: 3,
        effectiveShootTotal: 2,
        goalTotal: 2
      },
      userOvr: 263,
      oppOvr: 242,
      userGk: {
        name: '쿠르투아 (고급여)',
        ovr: 115,
        saves: 0,
        conceded: 2,
        saveRate: 0
      },
      oppGk: {
        name: '조현우 (저급여)',
        ovr: 80,
        saves: 10,
        conceded: 1,
        saveRate: 91
      },
      userMvp: {
        name: '티에리 앙리 (+5)',
        rating: 7.4
      },
      userScorers: ['루드 굴리트 (1골)'],
      oppMvp: {
        name: '조현우 (저급여) (+8)',
        rating: 9.2
      },
      oppScorers: ['박주영 (1골)', '손흥민 (1골)'],
      matchDate: new Date(Date.now() - 3600000 * 1.5).toISOString(), // 1.5시간 전
    },
    {
      // 2. 1타 1피
      userNickname: nickname,
      userStats: {
        matchResult: '패',
        possession: 56,
        averageRating: 6.9,
        controller: 'pad',
        shootTotal: 9,
        effectiveShootTotal: 6,
        goalTotal: 0
      },
      oppNickname: '원샷원킬초보',
      oppStats: {
        matchResult: '승',
        possession: 44,
        averageRating: 6.8,
        controller: 'keyboard',
        shootTotal: 1,
        effectiveShootTotal: 1,
        goalTotal: 1
      },
      userOvr: 255,
      oppOvr: 251,
      userGk: {
        name: '반데사르 (고급여)',
        ovr: 112,
        saves: 0,
        conceded: 1,
        saveRate: 0
      },
      oppGk: {
        name: '이범영 (저급여)',
        ovr: 82,
        saves: 6,
        conceded: 0,
        saveRate: 100
      },
      userMvp: {
        name: '케빈 더 브라위너 (+5)',
        rating: 6.9
      },
      userScorers: ['득점 없음'],
      oppMvp: {
        name: '손흥민 (+6)',
        rating: 8.1
      },
      oppScorers: ['손흥민 (1골)'],
      matchDate: new Date(Date.now() - 3600000 * 3.2).toISOString(),
    },
    {
      // 3. 스쿼드 억까
      userNickname: nickname,
      userStats: {
        matchResult: '무',
        possession: 58,
        averageRating: 7.1,
        controller: 'pad',
        shootTotal: 11,
        effectiveShootTotal: 7,
        goalTotal: 1
      },
      oppNickname: '가성비스쿼드99',
      oppStats: {
        matchResult: '무',
        possession: 42,
        averageRating: 6.9,
        controller: 'keyboard',
        shootTotal: 4,
        effectiveShootTotal: 3,
        goalTotal: 1
      },
      userOvr: 269,
      oppOvr: 238,
      userGk: {
        name: '돈나룸마 (중급여)',
        ovr: 110,
        saves: 2,
        conceded: 1,
        saveRate: 67
      },
      oppGk: {
        name: '노이어 (중급여)',
        ovr: 105,
        saves: 6,
        conceded: 1,
        saveRate: 86
      },
      userMvp: {
        name: '리오넬 메시 (+5)',
        rating: 7.1
      },
      userScorers: ['호나우두 (1골)'],
      oppMvp: {
        name: '노이어 (중급여) (+5)',
        rating: 8.6
      },
      oppScorers: ['에우제비오 (1골)'],
      matchDate: new Date(Date.now() - 3600000 * 4.8).toISOString(),
    },
    {
      // 4. 클린 실력 승리
      userNickname: nickname,
      userStats: {
        matchResult: '승',
        possession: 49,
        averageRating: 7.6,
        controller: 'keyboard',
        shootTotal: 8,
        effectiveShootTotal: 5,
        goalTotal: 2
      },
      oppNickname: '진정한실력자',
      oppStats: {
        matchResult: '패',
        possession: 51,
        averageRating: 7.0,
        controller: 'pad',
        shootTotal: 7,
        effectiveShootTotal: 4,
        goalTotal: 1
      },
      userOvr: 251,
      oppOvr: 253,
      userGk: {
        name: '슈테겐 (중급여)',
        ovr: 105,
        saves: 3,
        conceded: 1,
        saveRate: 75
      },
      oppGk: {
        name: '알리송 (중급여)',
        ovr: 108,
        saves: 3,
        conceded: 2,
        saveRate: 60
      },
      userMvp: {
        name: '크리스티아누 호날두 (+5)',
        rating: 8.5
      },
      userScorers: ['크리스티아누 호날두 (2골)'],
      oppMvp: {
        name: '모하메드 살라 (+5)',
        rating: 7.0
      },
      oppScorers: ['모하메드 살라 (1골)'],
      matchDate: new Date(Date.now() - 3600000 * 6.5).toISOString(),
    }
  ];

  // 특정 매치 ID가 오면 대응하는 인덱스로 고정, 아니면 닉네임이 test일 경우 0, 그 외엔 랜덤 매칭
  let scenarioIndex = 0;
  if (matchId) {
    const idxStr = matchId.split('_').pop();
    const parsedIdx = idxStr ? parseInt(idxStr, 10) : 0;
    scenarioIndex = isNaN(parsedIdx) ? 0 : parsedIdx % scenarios.length;
  } else {
    scenarioIndex = isTest ? 0 : Math.floor(Math.random() * scenarios.length);
  }
  
  const selected = scenarios[scenarioIndex];

  // 계산
  const analysis = calculateCalibration(
    selected.userNickname,
    selected.userStats,
    selected.oppStats,
    selected.userOvr,
    selected.oppOvr,
    selected.userGk.ovr,
    selected.oppGk.ovr,
    selected.userGk.saveRate,
    selected.oppGk.saveRate
  );

  return {
    isMock: true,
    matchId: matchId || `mock_match_${scenarioIndex}`,
    matchDate: selected.matchDate,
    matchType: 50, // 공식 경기
    user: {
      nickname: selected.userNickname,
      ovr: selected.userOvr,
      stats: selected.userStats,
      gk: selected.userGk,
      mvp: selected.userMvp,
      scorers: selected.userScorers
    },
    opponent: {
      nickname: selected.oppNickname,
      ovr: selected.oppOvr,
      stats: selected.oppStats,
      gk: selected.oppGk,
      mvp: selected.oppMvp,
      scorers: selected.oppScorers
    },
    analysis
  };
}

// 3. Mock 최근 5경기 매치 리스트 생성 함수
function generateMockMatchList(nickname: string) {
  return [
    {
      matchId: 'mock_match_0',
      matchResult: '패',
      oppNickname: '골대장인김덕배',
      userScore: 1,
      oppScore: 2,
      matchDate: new Date(Date.now() - 3600000 * 1.5).toISOString()
    },
    {
      matchId: 'mock_match_1',
      matchResult: '패',
      oppNickname: '원샷원킬초보',
      userScore: 0,
      oppScore: 1,
      matchDate: new Date(Date.now() - 3600000 * 3.2).toISOString()
    },
    {
      matchId: 'mock_match_2',
      matchResult: '무',
      oppNickname: '가성비스쿼드99',
      userScore: 1,
      oppScore: 1,
      matchDate: new Date(Date.now() - 3600000 * 4.8).toISOString()
    },
    {
      matchId: 'mock_match_3',
      matchResult: '승',
      oppNickname: '진정한실력자',
      userScore: 2,
      oppScore: 1,
      matchDate: new Date(Date.now() - 3600000 * 6.5).toISOString()
    },
    {
      matchId: 'mock_match_4',
      matchResult: '승',
      oppNickname: '가상의유저',
      userScore: 3,
      oppScore: 0,
      matchDate: new Date(Date.now() - 3600000 * 24.5).toISOString()
    }
  ];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const nickname = searchParams.get('nickname');
    const matchId = searchParams.get('matchId');

    if (!nickname || nickname.trim() === '') {
      return NextResponse.json(
        { error: '닉네임을 입력해 주세요.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.NEXON_API_KEY;
    const isMock = !apiKey || apiKey.trim() === '' || apiKey === 'your_api_key_here' || nickname.toLowerCase() === 'test';

    // 1. Mock 모드일 때
    if (isMock) {
      await new Promise((resolve) => setTimeout(resolve, 1200)); // 1.2초 로딩 딜레이
      if (matchId) {
        // 상세 분석
        const mockResult = generateMockData(nickname, matchId);
        return NextResponse.json(mockResult);
      } else {
        // 최근 5경기 리스트
        const mockList = generateMockMatchList(nickname);
        return NextResponse.json({ matches: mockList });
      }
    }

    // 2. 실거래 Nexon OpenAPI 모드일 때
    const headers = {
      'x-nxopen-api-key': apiKey!,
    };

    // 공통: 닉네임으로 OUID 조회
    const idRes = await fetch(
      `https://open.api.nexon.com/fconline/v1/id?nickname=${encodeURIComponent(nickname)}`,
      { headers, next: { revalidate: 0 } }
    );

    if (!idRes.ok) {
      if (idRes.status === 404) {
        return NextResponse.json(
          { error: `닉네임 '${nickname}'을(를) 찾을 수 없습니다. (대소문자 및 띄어쓰기를 확인해 주세요)` },
          { status: 404 }
        );
      }
      throw new Error(`Nexon API OUID 조회 실패: ${idRes.statusText}`);
    }

    const idData = (await idRes.json()) as NexonOuidResponse;
    const ouid = idData.ouid;

    if (!ouid) {
      throw new Error('OUID 값이 응답에 존재하지 않습니다.');
    }

    // --- 분기 1: 특정 매치 상세 분석 (matchId 제공됨) ---
    if (matchId) {
      const detailRes = await fetch(
        `https://open.api.nexon.com/fconline/v1/match-detail?matchid=${matchId}`,
        { headers, next: { revalidate: 0 } }
      );

      if (!detailRes.ok) {
        throw new Error(`Nexon API 매치 상세 조회 실패: ${detailRes.statusText}`);
      }

      const detailData = (await detailRes.json()) as MatchDetailResponse;

      if (!detailData || !detailData.matchInfo || detailData.matchInfo.length < 2) {
        throw new Error('매치 상세 데이터가 불완전합니다.');
      }

      const matchInfo = detailData.matchInfo;
      const userIndex = matchInfo.findIndex((info) => info.accessId === ouid);
      const userMatch = userIndex !== -1 ? matchInfo[userIndex] : matchInfo[0];
      const oppMatch = userIndex !== -1 ? matchInfo[1 - userIndex] : matchInfo[1];

      // OVR 계산
      const calculateAvgOvr = (info: MatchInfoDTO) => {
        if (info.player && info.player.length > 0) {
          const ratings = info.player
            .map((p) => p.status?.spRating || 0)
            .filter((r) => r > 0);
          if (ratings.length > 0) {
            const avgGrade = info.player.reduce((sum, p) => sum + (p.spGrade || 1), 0) / info.player.length;
            return Math.round(245 + avgGrade * 1.5);
          }
        }
        return 250;
      };

      const userOvr = calculateAvgOvr(userMatch);
      const oppOvr = calculateAvgOvr(oppMatch);

      // 상세 스탯 정보 파싱
      const parseStats = (info: MatchInfoDTO): MatchDetailDTO => {
        return {
          matchResult: info.matchDetail.matchResult,
          possession: info.matchDetail.possession || 50,
          averageRating: info.matchDetail.averageRating || 6.0,
          controller: info.matchDetail.controller || 'unknown',
          shootTotal: info.shoot.shootTotal || 0,
          effectiveShootTotal: info.shoot.effectiveShootTotal || 0,
          goalTotal: info.shoot.goalTotal ?? info.matchDetail.goalTotal ?? 0
        };
      };

      const userStats = parseStats(userMatch);
      const oppStats = parseStats(oppMatch);

      // 선수 메타데이터(spid.json) 맵 로드
      const spidMap = await getSpidMap();

      // 골키퍼 데이터 추출
      const findGkData = (info: MatchInfoDTO, oppInfo: MatchInfoDTO) => {
        let gkPlayer = info.player?.find((p) => p.spPosition === 28);
        if (!gkPlayer) {
          gkPlayer = info.player?.find((p) => p.spPosition === 0);
        }

        let name = '주전 골키퍼';
        if (gkPlayer) {
          const parsedName = spidMap.get(gkPlayer.spId);
          name = parsedName ? `${parsedName} (+${gkPlayer.spGrade})` : `GK (선수 ID: ${gkPlayer.spId}, +${gkPlayer.spGrade})`;
        }

        const gkOvr = gkPlayer ? Math.round(92 + (gkPlayer.spGrade || 1) * 2.5) : 95;
        const conceded = oppInfo.shoot.goalTotal ?? oppInfo.matchDetail.goalTotal ?? 0;
        const oppEffective = oppInfo.shoot.effectiveShootTotal || 0;
        const saves = Math.max(0, oppEffective - conceded);
        const totalShotsOnGoal = saves + conceded;
        const saveRate = totalShotsOnGoal > 0 ? Math.round((saves / totalShotsOnGoal) * 100) : 0;

        return {
          name,
          ovr: gkOvr,
          saves,
          conceded,
          saveRate
        };
      };

      const userGk = findGkData(userMatch, oppMatch);
      const oppGk = findGkData(oppMatch, userMatch);

      // 최고 평점 선수 (MVP) 및 득점자 추출
      const extractMvpAndScorers = (info: MatchInfoDTO) => {
        let bestPlayer = info.player?.[0];
        if (info.player) {
          for (const p of info.player) {
            if ((p.status?.spRating || 0) > (bestPlayer?.status?.spRating || 0)) {
              bestPlayer = p;
            }
          }
        }

        let mvpName = '정보 없음';
        if (bestPlayer) {
          const parsedMvp = spidMap.get(bestPlayer.spId);
          mvpName = parsedMvp ? `${parsedMvp} (+${bestPlayer.spGrade})` : `선수 (ID: ${bestPlayer.spId})`;
        }
        const mvpRating = bestPlayer?.status?.spRating || 6.0;

        const scorersList: string[] = [];
        if (info.player) {
          for (const p of info.player) {
            const goals = p.status?.goal || 0;
            if (goals > 0) {
              const realName = spidMap.get(p.spId) || `선수 (ID: ${p.spId})`;
              scorersList.push(`${realName} (${goals}골)`);
            }
          }
        }

        return {
          mvp: {
            name: mvpName,
            rating: mvpRating
          },
          scorers: scorersList.length > 0 ? scorersList : ['득점 없음']
        };
      };

      const userMvpAndScorers = extractMvpAndScorers(userMatch);
      const oppMvpAndScorers = extractMvpAndScorers(oppMatch);

      const analysis = calculateCalibration(
        userMatch.nickname,
        userStats,
        oppStats,
        userOvr,
        oppOvr,
        userGk.ovr,
        oppGk.ovr,
        userGk.saveRate,
        oppGk.saveRate
      );

      return NextResponse.json({
        isMock: false,
        matchId,
        matchDate: detailData.matchDate,
        matchType: detailData.matchType,
        user: {
          nickname: userMatch.nickname,
          ovr: userOvr,
          stats: userStats,
          gk: userGk,
          mvp: userMvpAndScorers.mvp,
          scorers: userMvpAndScorers.scorers
        },
        opponent: {
          nickname: oppMatch.nickname,
          ovr: oppOvr,
          stats: oppStats,
          gk: oppGk,
          mvp: oppMvpAndScorers.mvp,
          scorers: oppMvpAndScorers.scorers
        },
        analysis
      });
    }

    // --- 분기 2: 최근 5경기 리스트 조회 (matchId 미제공) ---
    // 1단계: 매치 ID 5개 조회 (limit=5)
    const matchRes = await fetch(
      `https://open.api.nexon.com/fconline/v1/user/match?ouid=${ouid}&matchtype=50&offset=0&limit=5`,
      { headers, next: { revalidate: 0 } }
    );

    if (!matchRes.ok) {
      throw new Error(`Nexon API 매치 리스트 조회 실패: ${matchRes.statusText}`);
    }

    const matchIds = (await matchRes.json()) as NexonMatchListResponse;

    if (!matchIds || matchIds.length === 0) {
      return NextResponse.json(
        { error: '최근 공식경기 기록이 존재하지 않습니다.' },
        { status: 404 }
      );
    }

    // 2단계: 각 매치 상세 정보를 병렬로 조회하여 리스트 데이터 요약 가공
    const matchesSummary = await Promise.all(
      matchIds.map(async (mId: string) => {
        try {
          const detailRes = await fetch(
            `https://open.api.nexon.com/fconline/v1/match-detail?matchid=${mId}`,
            { headers, next: { revalidate: 0 } }
          );
          if (!detailRes.ok) return null;

          const detailData = (await detailRes.json()) as MatchDetailResponse;
          if (!detailData || !detailData.matchInfo || detailData.matchInfo.length < 2) return null;

          const matchInfo = detailData.matchInfo;
          const userIdx = matchInfo.findIndex((info) => info.accessId === ouid);
          const userMatch = userIdx !== -1 ? matchInfo[userIdx] : matchInfo[0];
          const oppMatch = userIdx !== -1 ? matchInfo[1 - userIdx] : matchInfo[1];

          return {
            matchId: mId,
            matchResult: userMatch.matchDetail.matchResult,
            oppNickname: oppMatch.nickname,
            userScore: userMatch.shoot.goalTotal ?? userMatch.matchDetail.goalTotal ?? 0,
            oppScore: oppMatch.shoot.goalTotal ?? oppMatch.matchDetail.goalTotal ?? 0,
            matchDate: detailData.matchDate
          };
        } catch (err) {
          console.error(`매치 상세 요약 조회 실패 (ID: ${mId}):`, err);
          return null;
        }
      })
    );

    const validMatches = matchesSummary.filter((m) => m !== null);

    return NextResponse.json({
      matches: validMatches
    });

  } catch (error: any) {
    console.error('FC 분석기 API 오류:', error);
    
    // 에러 발생 시 Fallback으로 Mock 5경기 목록 또는 특정 상세 mock 반환
    try {
      const { searchParams } = new URL(request.url);
      const nickname = searchParams.get('nickname') || '구단주';
      const matchId = searchParams.get('matchId');

      console.warn(`[Fallback 작동] Nexon OpenAPI 에러 발생(${error.message}). Mock 데이터를 반환합니다.`);

      if (matchId) {
        const mockResult = generateMockData(nickname, matchId);
        return NextResponse.json({
          ...mockResult,
          apiErrorOccurred: true,
          errorMessage: error.message
        });
      } else {
        const mockList = generateMockMatchList(nickname);
        return NextResponse.json({
          matches: mockList,
          apiErrorOccurred: true,
          errorMessage: error.message
        });
      }
    } catch (fallbackError) {
      return NextResponse.json(
        { error: '서버 분석 중 알 수 없는 치명적인 오류가 발생했습니다.' },
        { status: 500 }
      );
    }
  }
}
