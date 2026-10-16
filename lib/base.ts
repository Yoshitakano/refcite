/**
 * 配信先のパス接頭辞。
 *
 * GitHub Pages ではリポジトリ名の下（/refcite/）に置かれるため、
 * ビルド時に NEXT_PUBLIC_BASE_PATH=/refcite を渡す。ローカルでは空。
 * <Link> と router は Next.js が自動で付けるので、ここを使うのは
 * fetch や Service Worker の登録など、自前で URL を組む箇所だけ。
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
