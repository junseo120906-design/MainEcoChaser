// functions/login.js 파일 전체 내용

// CORS 헤더 설정 (개발 환경에서 모든 출처 허용)
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};

// ----------------------------------------------------
// [1] CORS Preflight 요청 처리 (OPTIONS 메서드)
// CORS 에러를 막기 위해 필수적으로 추가해야 합니다.
// ----------------------------------------------------
export async function onRequestOptions() {
  return new Response(null, {
    status: 204, // No Content
    headers: CORS_HEADERS,
  });
}

// ----------------------------------------------------
// [2] 비밀번호 해싱 및 비교 헬퍼 함수
// Cloudflare Workers 환경에서 보안을 위해 비밀번호를 해싱합니다.
// *주의: 실제 환경에서는 DB에 비밀번호를 저장할 때 이미 해싱되어 있어야 합니다.*
// 여기서는 입력된 비밀번호를 DB의 해시된 비밀번호와 비교한다고 가정합니다.
// 현재 users 테이블에 'pw'가 평문으로 저장되어 있다고 가정하고,
// 임시로 평문 비교 코드를 사용하겠습니다. (보안상 매우 위험, 반드시 해시 적용 필요)
// ----------------------------------------------------
const comparePassword = (inputPassword, dbPassword) => {
    // 🚨🚨🚨 긴급 경고: 이 코드는 임시 테스트용이며, 실제 서비스에서는
    // 반드시 해시(Bcrypt/PBKDF2)를 사용해야 합니다. 
    return inputPassword === dbPassword;
};


// ----------------------------------------------------
// [3] 로그인 요청 처리 (POST 메서드)
// ----------------------------------------------------
export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ success: false, message: '아이디와 비밀번호를 입력해주세요.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    // 1. 사용자 조회 (DB 스키마에 username 컬럼이 있다고 가정)
    // DB 테이블에 username 컬럼이 없다면 이 부분을 nickname으로 바꿔주세요.
    const { results } = await env.DB.prepare(
      'SELECT user_id, pw, nickname FROM users WHERE user_name = ?1' // 🌟 user_name 컬럼 사용 가정
    )
      .bind(username)
      .all();

    const user = results[0];

    // 2. 사용자 존재 및 비밀번호 비교
    if (!user || !comparePassword(password, user.pw)) {
      return new Response(
        JSON.stringify({ success: false, message: '아이디 또는 비밀번호가 틀립니다.' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    // 3. 로그인 성공 응답
    return new Response(
      JSON.stringify({
        success: true,
        message: '로그인 성공!',
        nickname: user.nickname,
        userId: user.user_id,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );

  } catch (err) {
    // 서버 오류 응답
    return new Response(
      JSON.stringify({ success: false, message: '로그인 오류: ' + err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }
}