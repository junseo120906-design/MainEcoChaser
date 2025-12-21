export const onRequestPost = async (context) => {
  try {
    const body = await context.request.json();
    const {
      playerName,
      score,
      regionId,
      regionName,
      timestamp,
      wasteStats, // 선택: 쓰레기 종류별 정답/오답 요약 배열
    } = body;

    if (!playerName || typeof score !== 'number') {
      return new Response(JSON.stringify({ error: 'playerName, score는 필수입니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ts = timestamp || new Date().toISOString();

    // 1) 기본 점수는 기존과 동일하게 game_scores 테이블에 저장
    const insertScore = context.env.DB.prepare(
      `INSERT INTO game_scores (player_name, region_id, region_name, score, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    );

    const result = await insertScore
      .bind(playerName, regionId || null, regionName || null, score, ts)
      .run();

    const gameId = result.meta?.last_row_id || null;

    // 2) wasteStats 배열이 넘어오면 game_waste_stats 테이블에도 저장
    if (Array.isArray(wasteStats) && wasteStats.length > 0) {
      const insertWaste = context.env.DB.prepare(
        `INSERT INTO game_waste_stats
           (game_id, player_name, region_id, region_name, waste_type, correct_count, wrong_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const item of wasteStats) {
        const wasteType = item.wasteType || '기타';
        const correct = Number(item.correct ?? 0);
        const wrong = Number(item.wrong ?? 0);

        await insertWaste
          .bind(
            gameId,
            playerName,
            regionId || null,
            regionName || null,
            wasteType,
            correct,
            wrong,
            ts
          )
          .run();
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};