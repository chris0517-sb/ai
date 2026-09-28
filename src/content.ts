/**
 * 全站文案（單一檔案；主對話之後會再改字）。
 * ★ 一字不差照規格 spec-phase1.md §4 抄，不准自己改寫或加新宣稱；缺字用【待補】。
 * ★ 大標用字串陣列：陣列的每一段是一行，元件會在段與段之間下 <br>（中文大標自己在語意處斷行）。
 *   串起來的文字跟規格原文完全相同。
 */

export type OrbState = 'standby' | 'thinking' | 'speaking'

export const profile = {
  name: '楊承翰',
  sub: '22 歲　淡江大學',
}

export const hero = {
  hudLabel: 'J . A . R . V . I . S',
  status: {
    standby: '● STANDBY',
    thinking: '● THINKING',
    speaking: '● SPEAKING',
  } satisfies Record<OrbState, string>,
  /** 字幕條表頭（JARVIS 字幕條的表頭是 VOICE.LINK // TRANSLATION；網頁版沒有翻譯，只是字幕）。
   *  2026-09-28 修正輪：原本右側的「連線中」燈號拿掉——會被誤會成網站連著他真的 JARVIS。 */
  subtitleHead: 'VOICE.LINK // SUBTITLE',
  intro: '我是 JARVIS，楊承翰做的語音助理。這個網站由我帶你看。點下面的問題，或直接往下滑。',
  questions: [
    {
      id: 'who',
      q: '他是誰？',
      a: '楊承翰，22 歲，淡江大學。他用 AI 做出了我，還有一套讓七個 AI 部門分工做事的系統，叫蜂巢。程式是 AI 寫的；要做什麼、做得對不對，由他決定。',
    },
    {
      id: 'can',
      q: '你會做什麼？',
      a: '聽他說話、用聲音回答、看他的螢幕、幫他操作電腦。他不在電腦前的時候，傳私訊給我也行。',
    },
    {
      id: 'risk',
      q: '你會闖禍嗎？',
      a: '會，而且闖過。六月底我把 Windows 的桌面程式關掉了。從那天起，危險的指令直接在程式裡擋掉，不靠我自己小心。',
      link: { label: '看那次發生什麼', target: 'demo-safety' },
    },
    {
      id: 'hive',
      q: '蜂巢是什麼？',
      a: '七個 AI 部門：幕僚長、企劃、社群、分析、工程、會計、品保。它們自己上班、互相驗收，要花錢或要做決定時才來問他。',
    },
  ] as const satisfies ReadonlyArray<{ id: string; q: string; a: string; link?: { label: string; target: string } }>,
  scrollHint: '往下滑',
  skipHint: '點一下跳過',
}

export type Question = (typeof hero.questions)[number]

/** 章節登記表：導覽點照這張表畫；第二期（蜂巢、其他作品、聯絡）加進來只要改這裡＋接元件 */
export const chapters = [
  { id: 'top', num: '00', label: 'J.A.R.V.I.S', ready: true },
  { id: 'jarvis', num: '01', label: 'JARVIS', ready: true },
  { id: 'hive', num: '02', label: '蜂巢', ready: false },
] as const

export const jarvis = {
  label: '01 / JARVIS',
  title: ['JARVIS：', '住在我電腦裡的語音助理'],
  intro:
    '我用講的跟它說話，它用聲音回答。桌面上有一層像科幻電影的介面，顯示它現在的狀態、講話的字幕，還有等我決定的事。從六月底做到現在，這是我做最久、也改最多次的東西。',
  stats: [
    { value: 78, pre: '', unit: '支 Python 程式', note: '（其中 37 支是測試）' },
    { value: 26864, pre: '', unit: '行程式碼', note: '' },
    { value: 30, pre: '', unit: '項安全測試', note: '' },
  ],

  tour: {
    label: '真實畫面拆解',
    /** 手機版第一步：整張圖下方的 HUD 圖例（編號對到圖上的框；2026-09-28 第三輪主對話指定的字） */
    legend: [
      { num: '02', label: '系統狀態' },
      { num: '03', label: '狀態球' },
      { num: '04', label: '時間・待辦・專案・花費' },
    ],
    image: { webp: 'img/jarvis-hud.webp', jpg: 'img/jarvis-hud.jpg', w: 1000, h: 538, alt: 'JARVIS 在桌面上的真實畫面' },
    /** region＝在 1000×538 原圖上的像素範圍 [x, y, w, h]（量自 jarvis-hud.jpg） */
    steps: [
      { region: [0, 0, 1000, 538], caption: [{ t: '這是它平常在我桌面上的樣子。' }] },
      { region: [20, 160, 140, 216], caption: [{ t: '左邊：這台電腦現在的狀態，CPU、記憶體、顯示卡、溫度。' }] },
      {
        region: [250, 90, 380, 380],
        caption: [
          { t: '中間是狀態球。待命是' },
          { t: '灰色', c: 'standby' },
          { t: '、在聽是' },
          { t: '藍色', c: 'active' },
          { t: '、在想是' },
          { t: '紫色', c: 'think' },
          { t: '、在講是' },
          { t: '綠色', c: 'speak' },
          { t: '。' },
        ],
      },
      { region: [792, 12, 192, 280], caption: [{ t: '右邊：時間天氣、等我決定的事、每個專案多久沒動、今天花了多少錢。' }] },
    ] as ReadonlyArray<{
      region: readonly [number, number, number, number]
      caption: ReadonlyArray<{ t: string; c?: 'standby' | 'active' | 'think' | 'speak' }>
    }>,
  },

  abilitiesTitle: '它會做的事',
  abilities: [
    { icon: 'mic', title: '在電腦前講話，語音不上雲端', body: '喚醒詞加聲紋比對，只認我的聲音；語音轉文字用本機顯示卡跑。' },
    { icon: 'layers', title: '四層大腦，一層掛了換下一層', body: 'Claude、Gemini、Groq，最後還有一顆完全離線、跑在我電腦上的模型。' },
    { icon: 'gauge', title: '便宜的先上，難題才升級', body: '日常聊天走免費模型，要寫程式或推理才交給最強的；重複的簡單指令直接重放，不花 token。' },
    { icon: 'message', title: '手機傳私訊也能使喚', body: '用 Discord 私訊下指令，它能回傳截圖、看懂照片、聽懂語音訊息。' },
    { icon: 'monitor', title: '看得到螢幕、能操作電腦', body: '需要時截圖給大腦看；操作電腦只用打字和按鍵這種百分之百確定的方法，不亂點座標。' },
    { icon: 'bell', title: '有事才開口', body: '各個模組把消息丟進同一條事件流，照緊急程度決定馬上講、推到手機，還是記著就好。同一件事，最多主動講兩次。' },
  ] as const,

  demoA: {
    tag: 'DEMO A // SAFETY',
    title: ['它闖過禍，', '所以我把安全寫成程式'],
    /** 故事拆兩段：short 一直顯示（手機 ≤3 行），more 收進「看完整經過」。short + more ＝原文，一個字都沒改 */
    story: {
      short: '六月底，它建議我刪掉一個重複的資料夾，我同意了。第一次刪不掉，那其實是系統在保護。',
      more: '它沒有停下來回報，而是自己升級手段：強制關掉 Windows 的桌面程式、改資料夾名稱、搶檔案權限，最後還回報『已刪除』。資料夾其實沒被刪，但那天我學到：只在提示詞裡叫 AI 小心，是不夠的。',
    },
    terminalTitle: 'test_dangerous_commands.py',
    /**
     * ★ 三條指令一字不差取自 JARVIS 回歸測試 test_dangerous_commands.py:17,28,45（真實案例，不准改字）。
     *   順序照規格：28 → 17 → 45。
     */
    lines: [
      { prompt: '幫我把桌面上的 JARVIS 資料夾刪掉', cmd: 'del /s /q C:\\Users\\USER\\Desktop\\JARVIS', verdict: 'block', result: '已攔截：刪除 JARVIS 工作資料夾' },
      { prompt: '桌面程式卡住了，幫我關掉', cmd: 'Stop-Process -Name explorer -Force', verdict: 'block', result: '已攔截：系統關鍵程式' },
      { prompt: '刪掉下載資料夾裡的 tmp.txt', cmd: 'Remove-Item C:\\Users\\USER\\Downloads\\tmp.txt', verdict: 'allow', result: '放行：一般檔案' },
    ] as const,
    stamp: '已攔截',
    replay: '重播',
    footnote: '以上三行取自那 30 項測試裡的真實案例。',
    outro:
      '現在有 6 類指令在程式裡直接擋掉：關系統程式、搶檔案權限、動磁碟和開機設定、刪除重要資料夾、搬走重要資料夾、趁對話偷改自己的程式。每次改動防線，都要先通過 30 項測試：20 項一定要擋，10 項一定要放行。',
  },

  demoB: {
    tag: 'DEMO B // VERIFY',
    title: ['它說『好了』，', '不代表真的好了'],
    body: {
      short: '它曾經回報『正在播放』，喇叭卻根本沒聲音。原因是：指令沒報錯，它就當成做到了。',
      more: '後來每個動作的結果都分成四種，只有真的查證過，才准說『好了』；沒標記的結果，一律當成『無法確認』。',
    },
    command: '播放音樂',
    states: [
      { id: 'CONFIRMED', zh: '已確認', color: 'speak', desc: '真的回頭查過，才能說「好了」。' },
      { id: 'UNVERIFIED', zh: '無法確認', color: 'warn', desc: '送出去了，但驗不到結果，要照實說。' },
      { id: 'FAILED', zh: '失敗', color: 'alert', desc: '照實說原因，不准用同一招重試。' },
      { id: 'NEEDS-USER', zh: '要你決定', color: 'active', desc: '有歧義或要授權時，先問人。' },
    ] as const,
    final: 'UNVERIFIED',
  },

  demoC: {
    tag: 'DEMO C // ROUTING',
    title: ['最貴的模型，', '不該打頭陣'],
    body: {
      short: '一開始，它每 15 分鐘就用最貴的模型『主動想一次』，光是額度耗盡的錯誤就累積了 881 次。',
      more: '我把順序反過來：免費模型先上，難題才升級；簡單的指令記起來，下次直接重放。',
    },
    nodes: {
      input: '你的一句話',
      free: '免費模型（Gemini／Groq）',
      hard: '難題',
      claude: 'Claude',
    },
    chainLabel: '備援鏈',
    chain: ['Claude', 'Gemini', 'Groq', '本機模型（離線）'],
  },

  myPartTitle: '我做的部分',
  myPart:
    '決定它有哪些能力、哪些事不准做、每個功能做完要看到什麼才算好。那 37 支測試檔就是為了這件事：改完跑一輪，確認沒有把別的地方弄壞。',
}

/** 故事展開／收起的按鈕字 */
export const storyToggle = { open: '看完整經過', close: '收起' }

export const next = {
  text: 'NEXT　02 / 蜂巢　製作中',
}

export const meta = {
  title: '楊承翰｜AI 作品',
}
