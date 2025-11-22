export const onRequestGet = async (context) => {
  try {
    const query = context.env.DB.prepare(
      `SELECT
         COALESCE(region_id, 'unknown')  AS region_id,
         COALESCE(region_name, '기타')  AS region_name,
         COUNT(*)                        AS count,
         AVG(score)                      AS average_score
       FROM game_scores
       GROUP BY region_id, region_name
       ORDER BY average_score DESC`
    );

    const { results } = await query.all();

    return new Response(JSON.stringify(results), {
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