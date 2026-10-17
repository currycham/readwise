import './globals.css';
import Header from './components/Header';
import Footer from './components/Footer';

export const metadata = {
  title: { default: 'Readwise · 60 分钟吃透一本书', template: '%s · Readwise' },
  description: '输入书名，生成按《如何阅读一本书》和《学习之道》设计的精读手册：双人播客、限时精读、检测、内化，还能向作者提问。',
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
