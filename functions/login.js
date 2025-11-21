export async function onRequestPost(context) {
  const { env, request } = context

  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return new Response(
        JSON.stringify({ success: false, message: '아이디와 비밀번호를 입력해주세요.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // username 대신 users 테이블의 어떤 컬럼을 아이디로 쓸지 정해야 합니다.
    // 지금 users에는 user_id, pw, nickname, tier, region만 있어서
    // "아이디" = nickname 으로 가정할게요.
    const { results } = await env.DB.prepare(
      'SELECT user_id, pw, nickname FROM users WHERE nickname = ?1'
    )
      .bind(username)
      .all()

    const user = results[0]

    if (!user || user.pw !== password) {
      return new Response(
        JSON.stringify({ success: false, message: '아이디 또는 비밀번호가 틀립니다.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '로그인 성공!',
        nickname: user.nickname,
        userId: user.user_id,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: '로그인 오류: ' + err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}