'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * ヘッダとナビゲーション。
 *
 * 文献の詳細は書架のサブページなので、そこにいるときも「書架」を現在地として
 * 示す（ナビの項目自体は増やさない）。
 */
export function Nav() {
  const pathname = usePathname();
  const isWrite = pathname?.startsWith('/write');
  const isShelf = !isWrite;

  return (
    <header>
      <div className="bar">
        <span className="brand">refcite</span>
        <span className="sub">文献管理・引用リスト作成</span>
      </div>
      <nav>
        <Link href="/" className={isShelf ? 'on' : ''}>書架</Link>
        <Link href="/write" className={isWrite ? 'on' : ''}>執筆</Link>
      </nav>
    </header>
  );
}
