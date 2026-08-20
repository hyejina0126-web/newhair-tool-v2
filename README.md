# 뉴헤어 영상 제작 도구 — 완전 자동화판

스크립트만 넣으면: 오타체크 / 제목추천 / 썸네일(롱폼)·영상내제목(숏츠) / 설명글까지 자동.
설명글의 🎬 관련 영상은 유튜브 채널에서, 📝 관련 블로그는 nblog2(자사 사이트)에서 자동으로 찾아 채워집니다.
네이버블로그(blog.naver.com/newhair_blog)는 신규 검색 API 발급이 막혀 자동검색 대상에서 제외했습니다 — 필요할 때 결과 화면에서 직접 입력하면 됩니다 (참고문헌 자동추출은 그대로 동작).

## 필요한 API 키 (3개 서비스, 4개 값)

| 값 | 발급처 | 용도 |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com | 오타체크/제목/설명글 생성 |
| `YOUTUBE_API_KEY` | console.cloud.google.com | 채널 내 관련 영상 검색 |
| `GOOGLE_CSE_KEY` / `GOOGLE_CSE_CX` | console.cloud.google.com + programmablesearchengine.google.com | nblog2(자사블로그) 검색 |

### 1. Anthropic API 키
console.anthropic.com 가입 → 전화번호 인증(체험 크레딧 약 $5 지급) → Settings > API Keys에서 발급

### 2. YouTube Data API 키
1. console.cloud.google.com에서 프로젝트 선택(또는 새로 생성)
2. "API 및 서비스 > 라이브러리"에서 "YouTube Data API v3" 검색 → 사용 설정
3. "API 및 서비스 > 사용자 인증 정보" > "사용자 인증 정보 만들기" > "API 키"
4. 하루 무료 할당량 내(검색 1회당 100 유닛, 하루 총 10,000 유닛 = 약 100회 검색)에서 무료

### 3. Google Custom Search API (자사 블로그 nblog2 검색용)
1. 같은 Google Cloud 프로젝트에서 "Custom Search API" 사용 설정 → API 키 발급 (2번과 같은 키 재사용 가능)
2. programmablesearchengine.google.com 에서 새 검색엔진 만들기 → "전체 웹 검색"으로 설정 → 검색엔진 ID(cx) 복사
3. 무료 할당량: 하루 100회 검색

## 배포 순서

### 1. GitHub에 업로드
github.com 가입 → New repository → "uploading an existing file"로 이 폴더 전체(index.html, netlify.toml, netlify/, README.md) 드래그해서 업로드

### 2. Netlify 연결
app.netlify.com → Add new site > Import an existing project > GitHub > 방금 만든 저장소 선택 → 기본 설정 그대로 Deploy

### 3. 환경 변수 4개 등록
Site configuration > Environment variables에서 위 표의 4개 값을 하나씩 Add a variable로 등록
(하나라도 빠지면 해당 기능만 "자동 검색 실패"로 표시되고 나머지는 정상 작동합니다)

### 4. 재배포
Deploys 탭 > Trigger deploy > Deploy site (환경 변수는 재배포 후 적용됨)

## 참고
- 채널/재생목록 ID는 코드(`netlify/functions/generate.js`)에 이미 고정되어 있습니다: 뉴헤어(UCB1_zmwX--s9ccT0dNNFe8g, 외부채널출연 재생목록 제외), 모벤져스(UC5vc8SwXmxfJua4sjrx85Fw)
- 참고문헌 자동 추출은 nblog2·네이버블로그 둘 다 시도합니다(둘 다 직접 페이지를 읽는 방식이라 API 키 불필요). 실패 시 화면에 "못 찾음"으로 표시되니 원문 링크에서 직접 확인해주세요
- 자동으로 찾은 영상/블로그는 항상 화면에서 검토 후 사용하세요 (틀렸으면 그 자리에서 직접 수정 가능)
- API 키들은 절대 코드/GitHub에 직접 적지 말고 Netlify 환경 변수로만 등록하세요
