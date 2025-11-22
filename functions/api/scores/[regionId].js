export const onRequestGet = async (context) => {
  const regionId = context.params.regionId;
  if (!regionId) {
    return new Response(JSON.stringify({ error: 'regionId가 필요합니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const stmt = context.env.DB.prepare(
      `SELECT
         player_name,
         score,
         region_id,
         region_name,
         timestamp
       FROM game_scores
       WHERE region_id = ?
       ORDER BY score DESC, timestamp ASC
       LIMIT 100`
    );
    const { results } = await stmt.bind(regionId).all();

    return new Response(JSON.stringify({ scores: results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};