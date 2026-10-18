import { REPO_URL } from '../lib/site';

export default function Footer() {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <p>书籍回顾、播客和“问作者”的内容均由 AI 基于公开资料生成，可能存在错误，不能替代阅读原书。“问作者”为 AI 模拟，非作者本人观点。</p>
        <p>所用模型：腾讯混元、DeepSeek（均已完成生成式人工智能服务备案）。{process.env.NEXT_PUBLIC_ICP && <>　<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{process.env.NEXT_PUBLIC_ICP}</a></>}</p>
        <p>© {new Date().getFullYear()} Readwise　<a href="/terms">用户协议</a>　<a href="/privacy">隐私政策</a>{REPO_URL && <>　<a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub 开源</a></>}</p>
      </div>
    </footer>
  );
}
