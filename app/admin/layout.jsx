import { notFound } from 'next/navigation';
import { getUser } from '../lib/session';
import AdminNav from './AdminNav';

export const metadata = { title: '后台' };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }) {
  const user = await getUser();
  if (user?.role !== 'admin') notFound();
  return (
    <div className="wrap page">
      <div className="row" style={{ justifyContent: 'space-between' }}><h1>后台管理</h1><AdminNav /></div>
      {children}
    </div>
  );
}
