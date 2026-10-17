import JobProgress from './JobProgress';

export const metadata = { title: '生成进度' };

export default async function JobPage({ params }) {
  const id = Number((await params).id);
  return <div className="wrap narrow page"><JobProgress id={id} /></div>;
}
