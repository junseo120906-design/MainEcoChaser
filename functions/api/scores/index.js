export const onRequestPost = async (context) => {
  try {
    const body = await context.request.json();
    const { playerName, score, regionId, regionName, timestamp } = body;

    if (!playerName || typeof score !== 'number') {
      return new Response(JSON.stringify({ error: 'playerName, score는 필수입니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ts = timestamp || new Date().toISOString();

    const stmt = context.env.DB.prepare(
      `INSERT INTO game_scores (player_name, region_id, region_name, score, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    );

    await stmt.bind(playerName, regionId || null, regionName || null, score, ts).run();

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