/**
 * 検証用の書誌サンプル。
 * 和文は NDL API の実レスポンスから起こしたもの（§5.4-a）。
 */

/** 和書・著者3名（NDL 実データ由来） */
export const JP_BOOK_3 = {
  id: 'jp-book-3',
  type: 'book',
  title: '地方創生を超えて : これからの地域政策',
  author: [
    { family: '小磯', given: '修二' },
    { family: '村上', given: '裕一' },
    { family: '山崎', given: '幹根' },
  ],
  issued: { 'date-parts': [[2018, 7]] },
  publisher: '岩波書店',
  'publisher-place': '東京',
  ISBN: '9784000238953',
  language: 'ja',
};

/** 和書・単著 */
export const JP_BOOK_1 = {
  id: 'jp-book-1',
  type: 'book',
  title: '社会学入門',
  author: [{ family: '田中', given: '太郎' }],
  issued: { 'date-parts': [[2020]] },
  publisher: '岩波書店',
  language: 'ja',
};

/** 和書・2名 */
export const JP_BOOK_2 = {
  id: 'jp-book-2',
  type: 'book',
  title: '社会調査の方法',
  author: [
    { family: '田中', given: '太郎' },
    { family: '佐藤', given: '花子' },
  ],
  issued: { 'date-parts': [[2019]] },
  publisher: '有斐閣',
  language: 'ja',
};

/** 和書・5名（et-al 境界の検証用） */
export const JP_BOOK_5 = {
  id: 'jp-book-5',
  type: 'book',
  title: '現代社会論',
  author: [
    { family: '田中', given: '太郎' },
    { family: '佐藤', given: '花子' },
    { family: '加藤', given: '次郎' },
    { family: '鈴木', given: '一郎' },
    { family: '高橋', given: '実' },
  ],
  issued: { 'date-parts': [[2021]] },
  publisher: '東京大学出版会',
  language: 'ja',
};

/** 和文・雑誌論文 */
export const JP_ARTICLE = {
  id: 'jp-article',
  type: 'article-journal',
  title: '地域社会における共同性の変容',
  author: [{ family: '山田', given: '花子' }],
  'container-title': '社会学評論',
  volume: '70',
  issue: '2',
  page: '123-140',
  issued: { 'date-parts': [[2019]] },
  language: 'ja',
};

/** 欧文・書籍（Open Library 実データ由来） */
export const EN_BOOK = {
  id: 'en-book',
  type: 'book',
  title: 'Reassembling the Social: An Introduction to Actor-Network-Theory',
  author: [{ family: 'Latour', given: 'Bruno' }],
  issued: { 'date-parts': [[2005]] },
  publisher: 'Oxford University Press',
  'publisher-place': 'Oxford',
  language: 'en',
};

/** 欧文・雑誌論文（Crossref 実データ由来） */
export const EN_ARTICLE = {
  id: 'en-article',
  type: 'article-journal',
  title: 'Nanometre-scale thermometry in a living cell',
  author: [
    { family: 'Kucsko', given: 'G.' },
    { family: 'Maurer', given: 'P. C.' },
    { family: 'Yao', given: 'N. Y.' },
  ],
  'container-title': 'Nature',
  volume: '500',
  issue: '7460',
  page: '54-58',
  issued: { 'date-parts': [[2013]] },
  DOI: '10.1038/nature12373',
  language: 'en',
};

/** 必須項目が欠けた文献（警告 UI の検証用） */
export const INCOMPLETE = {
  id: 'incomplete',
  type: 'book',
  title: '著者と出版年が欠けた本',
  language: 'ja',
};

export const ALL = [
  JP_BOOK_1, JP_BOOK_2, JP_BOOK_3, JP_BOOK_5,
  JP_ARTICLE, EN_BOOK, EN_ARTICLE,
];

/** 和文・書籍の章（マニュアル 5.3） */
export const JP_CHAPTER = {
  id: 'jp-chapter', type: 'chapter',
  title: '移民政策の国際比較',
  author: [{ family: '高橋', given: 'みどり' }],
  editor: [{ family: '田中', given: '健一' }],
  'container-title': 'グローバル社会の課題',
  page: '45-67',
  issued: { 'date-parts': [[2021]] },
  publisher: '東京大学出版会', language: 'ja',
};

/** 和文・ウェブサイト（マニュアル 5.6） */
export const JP_WEB = {
  id: 'jp-web', type: 'webpage',
  title: '人口推計',
  author: [{ literal: '総務省統計局' }],
  'container-title': '総務省統計局サイト',
  issued: { 'date-parts': [[2024]] },
  accessed: { 'date-parts': [[2026, 8, 2]] },
  URL: 'https://www.stat.go.jp/', language: 'ja',
};

/** 同一著者の2件目（横棒 ―――― 検証用・マニュアル 5.1） */
export const JP_SAME_A = {
  id: 'same-a', type: 'book', title: '社会学の方法',
  author: [{ family: '井上', given: '一郎' }],
  issued: { 'date-parts': [[2015]] }, publisher: '有斐閣', language: 'ja',
};
export const JP_SAME_B = {
  id: 'same-b', type: 'book', title: '社会学の理論',
  author: [{ family: '井上', given: '一郎' }],
  issued: { 'date-parts': [[2018]] }, publisher: '有斐閣', language: 'ja',
};
