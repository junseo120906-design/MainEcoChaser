export const onRequestPost = async (context) => {
    try {
        const { username, password } = await context.request.json();
        
        if (!username || !password) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: '아이디와 비밀번호를 입력해주세요.' 
            }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const stmt = context.env.DB.prepare(
            "SELECT user_id, user_name, nickname, region, tier FROM users WHERE user_name = ? AND pw = ?"
        );

        const result = await stmt.bind(username, password).first();

        if (!result) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: '아이디 또는 비밀번호가 틀립니다.' 
            }), { 
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ 
            success: true, 
            message: '로그인 성공!',
            userId: result.user_id,
            nickname: result.nickname,
            region: result.region,
            tier: result.tier
        }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: '로그인 오류 발생: ' + error.message 
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
