// 问作者：流式返回。额度内免费，超出扣积分；提问和回答都过内容审核。
import { LIMITS } from '../../../config/plans.mjs';
import { withContext } from '../../../engine/context.mjs';
import { askAuthor, sanitizeMessages } from '../../../engine/ask.mjs';
import { getBookBySlug } from '../../../lib/books.mjs';
import { addCredits, assertBudget, chargeAsk } from '../../../lib/credits.mjs';
import { checkText } from '../../../lib/moderation.mjs';
import { fail, json, sameOrigin } from '../../lib/http';
import { getUser } from '../../lib/session';

export async function POST(req) {
  let user, charged = 0;
  try {
    if (!sameOrigin(req)) return json({ error: '非法请求' }, 403);
    user = await getUser();
    if (!user) return json({ error: '登录后可以向作者提问', code: 'login' }, 401);
    const { slug, messages } = await req.json();
    const book = getBookBySlug(String(slug || ''));
    if (!book || book.status !== 'ready') return json({ error: '找不到这本书' }, 404);
    const msgs = sanitizeMessages(messages);
    const question = msgs.at(-1).content;
    if ([...question].length > LIMITS.askChars) return json({ error: `问题请控制在 ${LIMITS.askChars} 字以内` }, 400);
    if (!(await checkText(question)).ok) return json({ error: '这个问题包含不合适的内容，换个问法试试' }, 400);
    assertBudget();
    charged = chargeAsk(user, `book:${book.id}`);

    const page = JSON.parse(book.page_json);
    const enc = new TextEncoder();
    const userId = user.id;
    const stream = new ReadableStream({
      async start(controller) {
        let full = '';
        try {
          await withContext({ userId, bookId: book.id }, () =>
            askAuthor(page, msgs, { onDelta: t => { full += t; controller.enqueue(enc.encode(t)); } }));
          if (!(await checkText(full)).ok) controller.enqueue(enc.encode('\n[[BLOCKED]]'));
        } catch (e) {
          console.error('问作者失败：', e.message);
          if (charged) addCredits(userId, charged, 'refund', `ask:${book.id}`);
          controller.enqueue(enc.encode('\n[[ERROR]]'));
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache', 'x-charged-credits': String(charged) } });
  } catch (e) {
    if (charged && user) addCredits(user.id, charged, 'refund', 'ask');
    return fail(e);
  }
}
