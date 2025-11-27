export const onRequestPost = async (context) => {
  const { request, env } = context;

  try {
    const body = await request.json().catch(() => null);
    const ids = (body && Array.isArray(body.ids)) ? body.ids : [];

    if (!ids.length) {
      return new Response(
        JSON.stringify({ success: false, message: '삭제할 id 목록이 비어 있습니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 여기서는 프론트에서 nickname을 id로 보내고 있으므로 player_name 기준으로 삭제
    // 만약 고유 ID 컬럼이 있다면 해당 컬럼명으로 수정해야 함.
    const placeholders = ids.map(() => '?').join(', ');
    const stmt = env.DB.prepare(
      `DELETE FROM game_scores WHERE player_name IN (${placeholders})`,
    );

    const result = await stmt.bind(...ids).run();
    const meta = result.meta || {};

    return new Response(
      JSON.stringify({
        success: true,
        message: '선택한 플레이어 기록이 삭제되었습니다.',
        deletedCount: meta.rows_written ?? meta.changes ?? null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: err.message || '삭제 중 오류가 발생했습니다.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
