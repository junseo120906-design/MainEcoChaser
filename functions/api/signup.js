export const onRequestPost = async (context) => {
    try {
        const { username, password, nickname, region } = await context.request.json();
        
        if (!username || !password || !nickname) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: '아이디, 비밀번호, 닉네임은 필수입니다.' 
            }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const checkStmt = context.env.DB.prepare(
            "SELECT user_id FROM users WHERE user_name = ? OR nickname = ?"
        );
        const existing = await checkStmt.bind(username, nickname).first();

        if (existing) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: '이미 사용 중인 아이디 또는 닉네임입니다.' 
            }), { 
                status: 409,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const insertStmt = context.env.DB.prepare(
            "INSERT INTO users (user_name, pw, nickname, region) VALUES (?, ?, ?, ?)"
        );

        const result = await insertStmt
            .bind(username, password, nickname, region || null)
            .run();

        return new Response(JSON.stringify({ 
            success: true, 
            message: '회원가입 성공!',
            userId: result.meta?.last_row_id
        }), { 
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: '회원가입 오류 발생: ' + error.message 
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
