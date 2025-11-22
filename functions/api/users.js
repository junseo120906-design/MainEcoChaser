// D1 바인딩을 통해 데이터베이스 객체를 받아옵니다.
// 이 변수명(DB)은 Cloudflare Pages 설정에서 지정한 'Variable name'과 일치해야 합니다.

// users 테이블에 새 사용자를 등록하는 POST 요청 처리
export const onRequestPost = async (context) => {
    try {
        // 요청 본문(body)에서 사용자 데이터를 JSON으로 파싱합니다.
        // 프론트에서 보내는 필드: username, password, nickname
        const { username, password, nickname, region } = await context.request.json();
        
        // 아이디, 비밀번호, 닉네임은 필수
        if (!username || !password || !nickname) {
            return new Response(JSON.stringify({ error: "아이디, 비밀번호, 닉네임은 필수입니다." }), { status: 400 });
        }

        // SQL 쿼리 준비 (D1의 .prepare를 사용)
        // user_name, pw, nickname, region 컬럼에 저장
        const stmt = context.env.DB.prepare(
            "INSERT INTO users (user_name, pw, nickname, region) VALUES (?, ?, ?, ?)"
        );

        // 쿼리 실행
        const result = await stmt
            .bind(username, password, nickname, region || null)
            .run();

        // 성공 응답 반환
        return new Response(JSON.stringify({ 
            success: true, 
            message: "사용자 등록 완료",
            result: result
        }), { 
            status: 201, // 201 Created
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        // 데이터베이스 또는 닉네임 중복 등의 오류 처리
        return new Response(JSON.stringify({ 
            success: false, 
            error: "등록 오류 발생: " + error.message 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

// 모든 사용자 목록을 조회하는 GET 요청 처리
export const onRequestGet = async (context) => {
    try {
        // users 테이블의 user_id, nickname, tier, region 필드 조회
        const { results } = await context.env.DB.prepare(
            "SELECT user_id, nickname, tier, region FROM users ORDER BY user_id DESC"
        ).all();

        // 성공 응답 반환
        return new Response(JSON.stringify({ users: results }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: "조회 오류 발생: " + error.message 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' }
        });
    }
};