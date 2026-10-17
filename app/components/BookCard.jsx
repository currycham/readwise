import Link from 'next/link';

export default function BookCard({ b }) {
  const cat = b.categories?.[0];
  return (
    <Link href={`/b/${encodeURIComponent(b.slug)}`} className="book">
      <div>
        <div className="bt">{b.title}</div>
        <div className="ba">{b.author}</div>
      </div>
      <p className="bl">{b.one_line}</p>
      <div className="bf">
        <span>{cat ? <span className="chip">{cat.sub}</span> : null}</span>
        <span>{b.douban_rating ? <span className="db">豆瓣 {b.douban_rating.toFixed(1)}</span> : null}</span>
      </div>
      <div className="bf"><span>{b.first_by ? `首位生成：${b.first_by}` : ''}</span><span>{b.podcast_status === 'ready' ? '有播客' : ''}</span></div>
    </Link>
  );
}
