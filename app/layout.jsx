import './globals.css';
import Header from './components/Header';
import Footer from './components/Footer';
import { SITE_URL } from './lib/site';

export const metadata = {
  title: { default: 'Readwise · 让读过的书成为你的一部分', template: '%s · Readwise' },
  description: '输入书名，生成按《如何阅读一本书》和《学习之道》设计的书籍回顾：双人播客、限时精读、闯关检测、联系自己，还能向作者提问。',
  metadataBase: new URL(SITE_URL),
  openGraph: { type: 'website', siteName: 'Readwise', locale: 'zh_CN', images: ['/podcast-art.png'] },
  twitter: { card: 'summary' },
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
