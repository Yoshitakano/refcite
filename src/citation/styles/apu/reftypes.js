/**
 * APU: 文献種別ごとの入力項目（マニュアル 5章・9章）
 *
 * 種別を先に選ばせ、その種別の書式に必要な項目だけを出す。
 * 全種別で同じ欄を並べると、新聞記事に「巻・号」が出たり、
 * 書籍に「アクセス日」が出たりして入力しづらい。
 *
 * 各種別の `fields` は、マニュアルの書式に現れる順に並べてある。
 * 画面の並びが書式の並びと一致するので、何を入れるか迷いにくい。
 */

/** 入力欄の定義 */
const F = {
  authors: {
    key: 'authors', label: '著者名', type: 'lines', required: true,
    placeholder: '山田, 太郎\n佐藤, 花子',
    hint: '1行に1人。「姓, 名」の形で書くと姓名を正しく扱えます',
  },
  authorsOptional: {
    key: 'authors', label: '著者名', type: 'lines',
    placeholder: '山田, 太郎',
    hint: '不明なら空欄のまま（「著者名不明」と出力されます）',
  },
  reporter: {
    key: 'authors', label: '記者名', type: 'lines',
    placeholder: '斎藤, 修',
    hint: '不明な場合は新聞社名を入れてください',
  },
  organization: {
    key: 'authors', label: '著者名／管理者名', type: 'lines', required: true,
    placeholder: '環境省',
    hint: '組織名はそのまま1行で書きます',
  },
  presenter: {
    key: 'authors', label: '発表者名', type: 'lines', required: true,
    placeholder: '岡田, 里奈',
  },
  readings: {
    key: 'readings', label: '著者名の読み', type: 'lines',
    placeholder: 'ヤマダ, タロウ',
    hint: '引用文献一覧を50音順に並べるために使います（任意）',
  },
  year: {
    key: 'year', label: '出版年', type: 'text', required: true,
    placeholder: '2020', width: 'short',
  },
  publishedYear: {
    key: 'year', label: '公開年', type: 'text', required: true,
    placeholder: '2022', width: 'short',
    hint: '不明なら n.d. と出力されます',
  },
  date: {
    key: 'date', label: '発行年月日', type: 'date', required: true,
    hint: '新聞記事は日付まで記載します',
  },
  title: {
    key: 'title', label: '書名', type: 'text', required: true,
    placeholder: '地域社会と多文化共生：アジア太平洋地域の事例',
    hint: '副題があれば「主題：副題」の形で続けて書きます',
  },
  chapterTitle: {
    key: 'title', label: '章タイトル', type: 'text', required: true,
    placeholder: '移民政策の国際比較',
    hint: '「第1章」などの番号は除き、タイトルだけを書きます',
  },
  articleTitle: {
    key: 'title', label: '論文タイトル', type: 'text', required: true,
    placeholder: '観光地における住民参加の意義',
  },
  headline: {
    key: 'title', label: '見出し', type: 'text', required: true,
    placeholder: '観光業界に打撃：コロナ禍の影響続く',
    hint: '副見出しがあれば「見出し：副見出し」の形で続けます',
  },
  pageTitle: {
    key: 'title', label: 'ページ名', type: 'text', required: true,
    placeholder: '地球温暖化対策の推進に関する法律',
  },
  thesisTitle: {
    key: 'title', label: '論文タイトル', type: 'text', required: true,
    placeholder: '地方都市における観光政策の効果分析',
  },
  speechTitle: {
    key: 'title', label: '発表タイトル', type: 'text', required: true,
    placeholder: '地域観光の担い手育成に関する一考察',
  },
  editors: {
    key: 'editors', label: '編者名', type: 'lines', required: true,
    placeholder: '田中, 健一',
    hint: '原文が「編著」でも「編」と出力されます',
  },
  bookTitle: {
    key: 'containerTitle', label: '書名（収録されている本）', type: 'text', required: true,
    placeholder: 'グローバル社会の課題',
  },
  journal: {
    key: 'containerTitle', label: '雑誌名', type: 'text', required: true,
    placeholder: '観光学研究',
  },
  siteName: {
    key: 'containerTitle', label: 'サイト名', type: 'text', required: true,
    placeholder: '環境省ホームページ',
  },
  newspaper: {
    key: 'containerTitle', label: '新聞名', type: 'text', required: true,
    placeholder: '朝日新聞',
  },
  publisher: {
    key: 'publisher', label: '出版社', type: 'text', required: true,
    placeholder: 'ミネルヴァ書房',
    hint: '「株式会社」などは省きます',
  },
  university: {
    key: 'publisher', label: '大学名（大学院名）', type: 'text', required: true,
    placeholder: '○○大学大学院',
  },
  issuer: {
    key: 'publisher', label: '発行機関', type: 'text', required: true,
    placeholder: '国土交通省',
  },
  volume: { key: 'volume', label: '巻', type: 'text', placeholder: '15', width: 'short' },
  issue: {
    key: 'issue', label: '号', type: 'text', placeholder: '2', width: 'short',
    hint: '号のみの雑誌は巻を空欄に',
  },
  pageRange: {
    key: 'page', label: 'ページ', type: 'text', required: true,
    placeholder: '33-50', width: 'short',
  },
  chapterPages: {
    key: 'page', label: 'ページ（章の範囲）', type: 'text', required: true,
    placeholder: '45-67', width: 'short',
  },
  newspaperPage: {
    key: 'page', label: 'ページ', type: 'text', placeholder: '5', width: 'short',
  },
  edition: {
    key: 'edition', label: '朝刊／夕刊', type: 'select', width: 'short',
    options: [
      { value: '', label: '（記載しない）' },
      { value: '朝刊', label: '朝刊' },
      { value: '夕刊', label: '夕刊' },
    ],
  },
  degree: {
    key: 'genre', label: '学位種別', type: 'select', required: true, width: 'short',
    options: [
      { value: '博士学位論文', label: '博士学位論文' },
      { value: '修士学位論文', label: '修士学位論文' },
    ],
  },
  event: {
    key: 'eventTitle', label: '学会名', type: 'text', required: true,
    placeholder: '日本観光学会全国大会',
  },
  place: {
    key: 'place', label: '開催地', type: 'text', placeholder: '福岡', width: 'short' },
  url: {
    key: 'url', label: 'URL', type: 'text', required: true,
    placeholder: 'https://www.env.go.jp/example',
  },
  accessed: {
    key: 'accessed', label: 'アクセス日', type: 'date', required: true,
    hint: 'そのページを見た日付',
  },
};

/**
 * 文献種別。
 * `cslType` は CSL-JSON の type、`fields` は入力欄の並び。
 * `format` は画面に出す書式の見本（マニュアルの記載どおり）。
 */
/** @type {import('../types.js').RefType[]} */
export const REF_TYPES = [
  {
    id: 'book',
    label: '書籍',
    desc: '単著・共著の本',
    cslType: 'book',
    format: '著者名（出版年）『書名：副題』出版社.',
    section: 'マニュアル 5.1 / 5.2',
    fields: [F.authors, F.readings, F.year, F.title, F.publisher],
  },
  {
    id: 'edited-book',
    label: '編書（本全体）',
    desc: '「〜編」の本を、章ではなく本全体として引く',
    cslType: 'book',
    format: '編者名編（出版年）『書名』出版社.',
    section: 'マニュアル 5.4',
    fields: [F.editors, F.readings, F.year, F.title, F.publisher],
  },
  {
    id: 'chapter',
    label: '編書のなかの1章',
    desc: '「〜編」の本の、特定の章',
    cslType: 'chapter',
    format: '著者名（出版年）「章タイトル」編者名編『書名』（pp.開始-終了）出版社.',
    section: 'マニュアル 5.3',
    fields: [F.authors, F.readings, F.year, F.chapterTitle,
             F.editors, F.bookTitle, F.chapterPages, F.publisher],
  },
  {
    id: 'article-journal',
    label: '学術雑誌論文',
    desc: '学会誌・紀要などに載った論文',
    cslType: 'article-journal',
    format: '著者名（出版年）「論文タイトル」『雑誌名』巻(号), 開始-終了.',
    section: 'マニュアル 5.5',
    fields: [F.authors, F.readings, F.year, F.articleTitle,
             F.journal, F.volume, F.issue, F.pageRange],
  },
  {
    id: 'webpage',
    label: 'ウェブサイト',
    desc: '官公庁サイト・企業サイトなど',
    cslType: 'webpage',
    format: '著者名／管理者名（公開年）「ページ名」『サイト名』（オンライン）アクセス日<URL>',
    section: 'マニュアル 5.6',
    fields: [F.organization, F.publishedYear, F.pageTitle,
             F.siteName, F.accessed, F.url],
    note: 'Wikipedia など執筆者が特定できないサイトは、学術的な引用文献として原則不適切です。',
  },
  {
    id: 'article-newspaper',
    label: '新聞記事（紙）',
    desc: '紙面に載った記事',
    cslType: 'article-newspaper',
    format: '記者名（発行年月日）「見出し：副見出し」『新聞名』朝刊／夕刊, p.ページ.',
    section: 'マニュアル 5.7',
    fields: [F.reporter, F.date, F.headline, F.newspaper, F.edition, F.newspaperPage],
  },
  {
    id: 'newspaper-online',
    label: '新聞記事（オンライン）',
    desc: '新聞社サイトの記事',
    cslType: 'article-newspaper',
    format: '記者名（発行年月日）「見出し」『新聞名』（オンライン）アクセス日<URL>',
    section: 'マニュアル 5.7',
    fields: [F.reporter, F.date, F.headline, F.newspaper, F.accessed, F.url],
  },
  {
    id: 'thesis',
    label: '学位論文',
    desc: '修士・博士論文',
    cslType: 'thesis',
    format: '著者名（年）『論文タイトル』学位種別, 大学名.',
    section: 'マニュアル 9.1（規定外・APA 一般原則からの類推）',
    fields: [F.authors, F.readings, F.year, F.thesisTitle, F.degree, F.university],
  },
  {
    id: 'speech',
    label: '学会発表',
    desc: '学会・研究会での口頭発表',
    cslType: 'speech',
    format: '発表者名（年）「発表タイトル」学会名, 開催地.',
    section: 'マニュアル 9.2（規定外）',
    fields: [F.presenter, F.readings, F.year, F.speechTitle, F.event, F.place],
  },
  {
    id: 'report',
    label: '白書・報告書',
    desc: '官公庁の白書、研究機関の報告書',
    cslType: 'report',
    format: '発行機関名（年）『白書名』発行機関.',
    section: 'マニュアル 9.3（規定外）',
    fields: [F.organization, F.year, F.title, F.issuer],
  },
];

/**
 * 入力値を CSL-JSON へ組み立てる。
 *
 * 種別ごとに扱いが違うところ（編書は編者を著者位置に置く、
 * 新聞は日付を年月日まで持つ、など）をここで吸収する。
 *
 * @param {string} typeId
 * @param {Record<string, string>} values
 * @returns {Object} importManual に渡せる形
 */
export function buildManualFields(typeId, values) {
  const t = REF_TYPES.find((x) => x.id === typeId) ?? REF_TYPES[0];
  const lines = (v) => String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

  const out = {
    type: t.cslType,
    title: values.title,
    authors: lines(values.authors),
    readings: lines(values.readings),
    publisher: values.publisher,
    containerTitle: values.containerTitle,
    volume: values.volume,
    issue: values.issue,
    page: values.page,
    genre: values.genre,
    eventTitle: values.eventTitle,
    place: values.place,
    edition: values.edition,
    url: values.url,
    accessed: values.accessed,
  };

  // 編書全体は編者を著者の位置に出す（マニュアル 5.4）。
  // CSL の substitute が editor を拾うので、author は空にする。
  if (typeId === 'edited-book') {
    out.editors = lines(values.editors);
    out.authors = [];
  } else if (values.editors) {
    out.editors = lines(values.editors);
  }

  // 新聞記事は発行年月日まで持つ（マニュアル 5.7）
  if (values.date) {
    const [y, m, d] = String(values.date).split('-').map(Number);
    if (y) out.dateParts = [y, m, d].filter(Boolean);
  } else {
    out.year = values.year;
  }

  return out;
}

