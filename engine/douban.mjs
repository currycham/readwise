// 直接从豆瓣读书取评分：联想接口按书名找 subject，按作者挑版本，再从书页读评分和评价人数。
// 只读公开页面、限速（两次请求间隔 ≥ DOUBAN_GAP_MS），结果存库，不实时抓取。DOUBAN_FETCH=0 关闭。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const GAP = Number(process.env.DOUBAN_GAP_MS || 2000);
let last = 0;

async function get(url, referer) {
  const wait = last + GAP - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/json', ...(referer ? { referer } : {}) }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (res.status !== 200) throw new Error(`豆瓣返回 ${res.status}`); // 被限流时是 403 或跳登录页
  return res.text();
}

// 书名只比较主标题：去掉书名号、副标题、空白和标点
const normTitle = s => String(s || '').replace(/[《》]/g, '').split(/[：:（(—-]/)[0].replace(/[\s·・,，.。!！?？]/g, '').toLowerCase();
// 作者去掉国籍、译者等括号内容，只留汉字和字母
const normAuthor = s => String(s || '').replace(/[[【(（][^\]】)）]*[\]】)）]/g, '').replace(/[^\p{Script=Han}a-zA-Z]/gu, '').toLowerCase();

function authorMatch(a, b) {
  const x = normAuthor(a), y = normAuthor(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  // 译名用字可能不同（西奥迪尼 / 西奥迪），有连续两个字相同就算
  for (let i = 0; i + 2 <= x.length; i++) if (y.includes(x.slice(i, i + 2))) return true;
  return false;
}

export function parseSubject(html) {
  const avg = html.match(/property="v:average"[^>]*>\s*([\d.]+)/);
  const votes = html.match(/property="v:votes"[^>]*>\s*(\d+)/);
  const rating = avg ? Number(avg[1]) : NaN;
  if (!(rating > 0 && rating <= 10)) return null; // 评价人数不足时豆瓣不显示评分
  return { rating, count: votes ? Number(votes[1]) : null };
}

/** @returns {Promise<{rating:number, count:number|null, id:string, title:string}|null>} 找不到或被拦时返回 null */
export async function doubanLookup({ title, author = '' }, { log = () => {} } = {}) {
  if (process.env.DOUBAN_FETCH === '0' || !title) return null;
  try {
    const list = JSON.parse(await get(`https://book.douban.com/j/subject_suggest?q=${encodeURIComponent(String(title).replace(/[《》]/g, ''))}`));
    const t = normTitle(title);
    let cands = (Array.isArray(list) ? list : []).filter(x => x.type === 'b' && x.id && normTitle(x.title) === t);
    if (author) {
      const byAuthor = cands.filter(x => authorMatch(x.author_name, author));
      if (byAuthor.length) cands = byAuthor;
      else if (cands.length) { log(`豆瓣：《${title}》书名对上但作者对不上，跳过`); return null; }
    }
    // 同一本书常有多个版本，取评价人数最多的那个（最多看 3 个）
    let best = null;
    for (const c of cands.slice(0, 3)) {
      const r = parseSubject(await get(`https://book.douban.com/subject/${c.id}/`, 'https://book.douban.com/'));
      if (r && (!best || (r.count || 0) > (best.count || 0))) best = { ...r, id: String(c.id), title: c.title };
    }
    return best;
  } catch (e) {
    log(`豆瓣评分获取失败：${e.message}`);
    return null;
  }
}
