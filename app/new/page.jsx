import { redirect } from 'next/navigation';
import { quotaSummary } from '../../lib/credits.mjs';
import { getUser } from '../lib/session';
import NewForm from './NewForm';

export const metadata = { title: '生成书籍回顾' };
export const dynamic = 'force-dynamic';

export default async function NewPage({ searchParams }) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/new?title=${encodeURIComponent(sp.title || '')}`)}`);
  const q = quotaSummary(user);
  return (
    <div className="wrap narrow page">
      <div className="stack">
        <h1>生成书籍回顾</h1>
        <p className="muted">系统会先联网查找这本书的资料并判断是否足够可靠，再生成精读手册，整个过程大约 10 分钟。生成好的回顾会放进公共书库，你的昵称会显示为“首位生成者”。</p>
      </div>
      <NewForm initialTitle={sp.title || ''} quota={q} />
    </div>
  );
}
