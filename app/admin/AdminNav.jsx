'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [['/admin', '概览'], ['/admin/books', '书籍'], ['/admin/users', '用户'], ['/admin/jobs', '任务'], ['/admin/reports', '反馈']];

export default function AdminNav() {
  const p = usePathname();
  return <nav className="admin-nav">{ITEMS.map(([h, t]) => <Link key={h} href={h} className={p === h ? 'on' : ''}>{t}</Link>)}</nav>;
}
