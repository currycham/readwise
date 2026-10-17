// 闯关检测判分：答案不下发到页面，每答一题由服务端判。登录用户的首次闯关计分，结算时发积分。
import { getBookBySlug } from '../../../lib/books.mjs';
import { answerQuiz } from '../../../lib/rewards.mjs';
import { fail, json, sameOrigin } from '../../lib/http';
import { getUser } from '../../lib/session';

export async function POST(req) {
  try {
    if (!sameOrigin(req)) return json({ error: '非法请求' }, 403);
    const { slug, q, choice } = await req.json();
    const book = getBookBySlug(String(slug || ''));
    if (!book || book.status !== 'ready') return json({ error: '找不到这本书' }, 404);
    return json(answerQuiz(await getUser(), book, Number(q), Number(choice)));
  } catch (e) { return fail(e); }
}
