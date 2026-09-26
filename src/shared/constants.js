// Power Link — shared constants & defaults
// Loaded as an ES module by extension pages and the service worker.

export const PLATFORMS = {
  yt: { id: 'yt', name: '유튜브', short: '유튜브', follower: '구독자', account: '채널', openAccount: '채널 열기', textAction: '자막 추출' },
  tt: { id: 'tt', name: '틱톡', short: '틱톡', follower: '팔로워', account: '계정', openAccount: '계정 열기', textAction: '자막 추출' },
  ig: { id: 'ig', name: '인스타그램', short: '인스타', follower: '팔로워', account: '계정', openAccount: '계정 열기', textAction: '캡션 추출' },
  x: { id: 'x', name: 'X', short: 'X', follower: '팔로워', account: '계정', openAccount: '계정 열기', textAction: '본문 추출' },
  blog: { id: 'blog', name: '블로그', short: '블로그', follower: '이웃', account: '블로그', openAccount: '블로그 열기', textAction: '본문 추출' },
  web: { id: 'web', name: '웹', short: '웹', follower: '', account: '사이트', openAccount: '사이트 열기', textAction: '본문 추출' }
};
export const PLATFORM_IDS = ['yt', 'tt', 'ig', 'x', 'blog'];

export const ACTIONS = {
  copy: { label: '복사', color: '#2F6BFF' },
  tabs: { label: '새 탭으로 열기', color: '#E8590C' },
  window: { label: '새 창으로 열기', color: '#7A5AF8' },
  save: { label: '목록에 저장', color: '#0E9384' }
};
export const MODIFIERS = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt' };
export const RULE_COLORS = ['#2F6BFF', '#E8590C', '#0E9384', '#7A5AF8'];

// Collectable fields per platform. id is stable (stored in settings), label is UI text.
export const FIELDS = {
  yt: {
    source: 'YouTube API',
    post: [['url', '링크'], ['title', '제목'], ['category', '카테고리'], ['thumb', '썸네일'], ['views', '조회수'], ['uploadedAt', '업로드 일자'], ['likes', '좋아요'], ['comments', '댓글수'], ['duration', '영상 길이'], ['isShort', '쇼츠 여부'], ['tags', '태그'], ['outlier', '떡상 점수']],
    account: [['name', '채널명'], ['accountUrl', '채널 링크'], ['created', '채널 개설일'], ['followers', '구독자수'], ['total', '전체 영상 수'], ['longCount', '롱폼 수'], ['shortCount', '숏폼 수'], ['recent30', '최근 30일 영상 수'], ['avgViews', '평균 조회수'], ['power', '채널력']]
  },
  tt: {
    source: '열린 페이지에서 읽기',
    post: [['url', '링크'], ['title', '설명'], ['category', '카테고리'], ['thumb', '썸네일'], ['views', '조회수'], ['likes', '좋아요'], ['comments', '댓글수'], ['shares', '공유수'], ['uploadedAt', '업로드 일자'], ['tags', '해시태그']],
    account: [['name', '계정명'], ['handle', '핸들'], ['followers', '팔로워'], ['following', '팔로잉'], ['likesTotal', '받은 좋아요'], ['total', '게시물 수'], ['power', '채널력']]
  },
  ig: {
    source: '열린 페이지에서 읽기',
    post: [['url', '링크'], ['title', '캡션'], ['category', '카테고리'], ['thumb', '썸네일'], ['postType', '유형 (릴스·피드)'], ['likes', '좋아요'], ['comments', '댓글수'], ['uploadedAt', '업로드 일자'], ['tags', '해시태그']],
    account: [['name', '계정명'], ['handle', '핸들'], ['followers', '팔로워'], ['following', '팔로잉'], ['total', '게시물 수'], ['power', '채널력']]
  },
  x: {
    source: '열린 페이지에서 읽기',
    post: [['url', '링크'], ['title', '본문'], ['category', '카테고리'], ['views', '조회수'], ['likes', '좋아요'], ['reposts', '리포스트'], ['comments', '답글'], ['uploadedAt', '게시 일시'], ['tags', '해시태그']],
    account: [['name', '계정명'], ['handle', '핸들'], ['followers', '팔로워'], ['following', '팔로잉'], ['total', '게시물 수'], ['power', '채널력']]
  },
  blog: {
    source: '열린 페이지에서 읽기',
    post: [['url', '링크'], ['title', '제목'], ['category', '카테고리'], ['thumb', '대표 이미지'], ['uploadedAt', '작성일'], ['likes', '공감수'], ['comments', '댓글수'], ['tags', '태그']],
    account: [['name', '블로그명'], ['accountUrl', '블로그 주소'], ['followers', '이웃수'], ['total', '전체 글 수'], ['power', '채널력']]
  }
};

// YouTube videoCategoryId → Korean label
export const YT_CATEGORIES = {
  1: '영화/애니메이션', 2: '자동차', 10: '음악', 15: '동물', 17: '스포츠', 19: '여행/이벤트', 20: '게임',
  22: '인물/블로그', 23: '코미디', 24: '엔터테인먼트', 25: '뉴스/정치', 26: '노하우/스타일', 27: '교육', 28: '과학기술', 29: '비영리/사회운동'
};

export const DEFAULT_SETTINGS = {
  schema: 2,
  rules: [
    { id: 'r1', enabled: true, mod: 'ctrl', button: 'right', shape: 'box', action: 'copy', color: '#2F6BFF' },
    { id: 'r2', enabled: true, mod: 'shift', button: 'right', shape: 'box', action: 'tabs', color: '#E8590C' },
    { id: 'r3', enabled: true, mod: 'alt', button: 'right', shape: 'lasso', action: 'save', color: '#0E9384' }
  ],
  collect: 'title',            // 'link' | 'title' | 'detail'
  copyFormat: 'text',          // 'text' | 'card' | 'table'
  alsoSave: true,
  dedupe: true,
  highlight: true,
  autoscroll: true,
  sameSite: false,
  bgTabs: true,
  confirmOver: 20,
  recentMax: 50,               // 최근 작업 화면 기록 수
  outlierHighlight: true,      // 떡상 점수 1.5배 이상을 초록색으로 강조
  notify: true,
  memoExport: true,
  memoSearch: true,
  fieldsOff: { 'yt:tags': 1 },
  categories: ['교육', '엔터테인먼트', '노하우/스타일', '과학기술', '게임', '음악', '인물/블로그', 'IT·콘텐츠'],
  catRules: [
    { k: '야담, 옛날이야기, 사극, 드라마', c: '엔터테인먼트' },
    { k: '알고리즘, 썸네일, 조회수, 쇼츠, 릴스', c: '노하우/스타일' },
    { k: 'AI, 자동화, 앱, 코딩', c: '과학기술' }
  ],
  popup: { method: 'window', scope: 'current', plats: ['all'], kinds: ['all'], after: 'keep', sort: 'none' },
  sidepanel: { view: 'list' }
};

export const STORAGE = {
  settings: 'pl_settings',     // chrome.storage.sync
  links: 'pl_links',           // chrome.storage.local
  apiKey: 'pl_ytApiKey',       // chrome.storage.local (never synced)
  ytCache: 'pl_ytCache',
  watch: 'pl_watch',
  quota: 'pl_quota',
  lastGrab: 'pl_lastGrab',
  recent: 'pl_recent',         // 최근 작업 화면 (chrome.storage.local)
  // 다른 프로필 연동 (native messaging 도우미) — 모두 chrome.storage.local.
  // profileName을 sync에 두면 같은 계정으로 로그인한 프로필끼리 이름이 겹쳐 써지므로 local에 둔다.
  profileId: 'pl_profileId',       // 이 프로필의 고유 ID
  profileName: 'pl_profileName',   // 다른 프로필에 보일 이 프로필의 이름
  recentOthers: 'pl_recentOthers', // 다른 프로필들의 최근 화면 { at, profiles: [...] }
  bridge: 'pl_bridge',             // 도우미 연결 상태 { connected, at }
  collections: 'pl_collections',   // 컬렉션 [{ id, name }] — 링크의 coll 필드가 id를 가리킴
  showMarks: 'pl_showMarks'        // 페이지 선택 테두리 표시 (false면 숨김)
};
