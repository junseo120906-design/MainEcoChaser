export async function onRequestGet(context) {
  const { env } = context;

  try {
    // 플레이어별로 최고 점수, 시도 횟수, 최고 점수 기록 시각을 집계
    const { results } = await env.DB.prepare(
      `SELECT
         player_name,
         COALESCE(region_name, '기타') AS region_name,
         COUNT(*)                    AS attempts,
         MAX(score)                  AS best_score,
         MIN(timestamp)              AS first_timestamp
       FROM game_scores
       GROUP BY player_name, region_name`
    ).all();

    const rows = results || [];

    // 최고 점수 내림차순, 동점 시 더 이른 기록 시각(= 먼저 달성한 사람) 우선
    const sorted = rows.sort((a, b) => {
      const aScore = Number(a.best_score) || 0;
      const bScore = Number(b.best_score) || 0;
      if (aScore !== bScore) return bScore - aScore;

      const aTime = new Date(a.first_timestamp).getTime() || 0;
      const bTime = new Date(b.first_timestamp).getTime() || 0;
      return aTime - bTime;
    });

    const top = sorted.slice(0, 10);

    const ranking = top.map((row, idx) => ({
      rank: idx + 1,
      nickname: row.player_name || 'Unknown',
      score: Number(row.best_score) || 0,
      attempts: Number(row.attempts) || 0,
      bestTime: row.first_timestamp || null,
      region: row.region_name,
    }));

    return new Response(JSON.stringify({ success: true, ranking }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: '랭킹 조회 오류: ' + err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}