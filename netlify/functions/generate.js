// netlify/functions/generate.js
// 필요한 환경 변수:
//   ANTHROPIC_API_KEY   - console.anthropic.com
//   YOUTUBE_API_KEY     - console.cloud.google.com (YouTube Data API v3 활성화)
//   NAVER_CLIENT_ID     - developers.naver.com
//   NAVER_CLIENT_SECRET - developers.naver.com
//   GOOGLE_CSE_KEY      - console.cloud.google.com (Custom Search API 활성화)
//   GOOGLE_CSE_CX       - programmablesearchengine.google.com (검색엔진 ID, "전체 웹 검색"으로 설정)

const CHANNELS = {
  "뉴헤어": {
    channelId: "UCB1_zmwX--s9ccT0dNNFe8g",
    excludePlaylistId: "PLL_unjBR_puuNrS56sx8pqRyqJaQUVI91", // 외부채널 출연
    defaultTag: "ㅣ뉴헤어ㅣ모발건강"
  },
  "모벤저스": {
    channelId: "UC5vc8SwXmxfJua4sjrx85Fw",
    excludePlaylistId: null,
    defaultTag: "ㅣ모벤져스"
  }
};

const NBLOG2_SITE = "newhairps.com/nblog2";
const NAVER_BLOG_ID = "newhair_blog";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function claudeAnalyze(apiKey, channel, contentType, script) {
  const isLong = contentType === "롱폼";
  let schemaFields = `- "typos": [{"before":"오타/오류 표현","after":"수정 표현","note":"이유(짧게)"}] (최대 8개, 없으면 빈 배열)
- "titles": ["제목1","제목2","제목3","제목4","제목5"] (5개, 채널 태그 붙이지 말고 순수 제목만)
- "description_intro": "설명글 도입부 2~4문장. 정중한 설명체(-습니다), 어그로성 표현 금지, 영상 핵심 내용을 정보 전달 톤으로 요약"
- "search_keywords": ["키워드1","키워드2","키워드3"] (관련 영상/블로그를 검색할 핵심 키워드 2~3개, 명사 위주 짧은 구)`;

  if (isLong) {
    schemaFields += `
- "thumbnails": [{"category":"모발이식 정보|탈모치료 정보|탈모 팩트체크 중 하나","headline":"썸네일 메인 카피(굵고 짧게, 10자 내외)","sub":"보조 문구(선택, 없으면 빈 문자열)"}] (3개)`;
  } else {
    schemaFields += `
- "onscreen_titles": ["영상 내 삽입할 제목 텍스트 후보1","후보2","후보3","후보4"] (짧고 임팩트 있게, 4개)`;
  }

  const system = `당신은 탈모 전문 유튜브 채널의 영상 제작 보조 도구입니다.
채널: ${channel}
영상 유형: ${contentType}

아래 JSON 스키마로만 응답하세요. 마크다운, 코드블록, 설명 문장 없이 순수 JSON 객체 하나만 출력합니다.
${schemaFields}

제목 스타일은 정보성 채널 톤(예: "탈모 정기검사의 중요성!", "탈모 자가진단법 총정리")을 따르고 과도한 낚시성 문구는 피합니다.
설명글 도입부와 검색 키워드는 대본에 실제로 나온 내용에 근거해야 하며 지어내지 않습니다.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: `[대본/스크립트]\n${script}` }]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Claude API 오류: " + (data.error?.message || JSON.stringify(data)));
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  let s = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
  const first = s.indexOf("{"), last = s.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("Claude 응답에서 JSON을 찾지 못했습니다: " + text.slice(0, 300));
  return JSON.parse(s.slice(first, last + 1));
}

async function getExcludedVideoIds(playlistId, ytKey) {
  if (!playlistId) return new Set();
  const ids = new Set();
  let pageToken = "";
  for (let i = 0; i < 3; i++) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${playlistId}&key=${ytKey}${pageToken ? "&pageToken=" + pageToken : ""}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) break;
    (data.items || []).forEach(it => ids.add(it.contentDetails.videoId));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

async function searchChannelVideo(channelInfo, keyword, ytKey) {
  const excluded = await getExcludedVideoIds(channelInfo.excludePlaylistId, ytKey);
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance&maxResults=10&channelId=${channelInfo.channelId}&q=${encodeURIComponent(keyword)}&key=${ytKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) return { found: false, error: data.error?.message };
  const items = (data.items || []).filter(it => !excluded.has(it.id.videoId));
  if (items.length === 0) return { found: false };
  const top = items[0];
  return { found: true, title: stripTags(top.snippet.title), url: `https://www.youtube.com/watch?v=${top.id.videoId}` };
}

async function searchNaverBlog(keyword, clientId, clientSecret) {
  if (!clientId || !clientSecret) return null;
  const url = `https://openapi.naver.com/v1/search/blog.json?display=15&sort=sim&query=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, { headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret } });
  if (!res.ok) return null;
  const data = await res.json();
  const match = (data.items || []).find(it => it.link.includes(`blog.naver.com/${NAVER_BLOG_ID}`));
  if (!match) return null;
  return { title: stripTags(match.title), url: match.link.split("?")[0] };
}

async function searchGoogleCSE(keyword, key, cx) {
  if (!key || !cx) return null;
  const q = `site:${NBLOG2_SITE} ${keyword}`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const items = data.items || [];
  if (items.length === 0) return null;
  return { title: items[0].title, url: items[0].link };
}

function keywordScore(title, keywords) {
  if (!title) return 0;
  return keywords.reduce((n, k) => n + (title.includes(k) ? 1 : 0), 0);
}

async function pickBestBlog(keywords, env) {
  const query = keywords.slice(0, 2).join(" ");
  const [naver, cse] = await Promise.all([
    searchNaverBlog(query, env.NAVER_CLIENT_ID, env.NAVER_CLIENT_SECRET).catch(() => null),
    searchGoogleCSE(query, env.GOOGLE_CSE_KEY, env.GOOGLE_CSE_CX).catch(() => null)
  ]);
  const candidates = [naver, cse].filter(Boolean);
  if (candidates.length === 0) return { found: false };
  candidates.sort((a, b) => keywordScore(b.title, keywords) - keywordScore(a.title, keywords));
  return { found: true, ...candidates[0] };
}

async function extractReferences(blogUrl) {
  try {
    if (blogUrl.includes("blog.naver.com")) {
      const mainRes = await fetch(blogUrl, { headers: { "User-Agent": UA } });
      const mainHtml = await mainRes.text();
      const m = mainHtml.match(/src="([^"]*PostView\.naver[^"]*)"/);
      if (!m) return { found: false };
      let iframeUrl = m[1].startsWith("http") ? m[1] : "https://blog.naver.com" + m[1];
      iframeUrl = iframeUrl.replace(/&amp;/g, "&");
      const postRes = await fetch(iframeUrl, { headers: { "User-Agent": UA } });
      const postHtml = await postRes.text();
      return extractRefFromText(stripTags(postHtml));
    } else {
      const res = await fetch(blogUrl, { headers: { "User-Agent": UA } });
      const html = await res.text();
      return extractRefFromText(stripTags(html));
    }
  } catch (e) {
    return { found: false };
  }
}

function extractRefFromText(text) {
  const idx = text.indexOf("참고문헌");
  if (idx === -1) return { found: false };
  let slice = text.slice(idx, idx + 2500);
  return { found: true, text: slice.trim() };
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST 요청만 허용됩니다." }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: "요청 본문이 올바른 JSON이 아닙니다." }) }; }

  const { channel, contentType, script } = payload;
  if (!channel || !contentType || !script) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "channel, contentType, script 값이 모두 필요합니다." }) };
  }
  const channelInfo = CHANNELS[channel];
  if (!channelInfo) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "알 수 없는 채널입니다: " + channel }) };
  }

  const env = process.env;
  if (!env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }) };
  }

  try {
    const analysis = await claudeAnalyze(env.ANTHROPIC_API_KEY, channel, contentType, script);
    const keywords = analysis.search_keywords && analysis.search_keywords.length ? analysis.search_keywords : [analysis.titles?.[0] || ""];
    const primaryKeyword = keywords[0];

    let video = { found: false };
    let blog = { found: false };
    let references = { found: false };

    if (env.YOUTUBE_API_KEY) {
      video = await searchChannelVideo(channelInfo, primaryKeyword, env.YOUTUBE_API_KEY).catch(e => ({ found: false, error: e.message }));
    }

    blog = await pickBestBlog(keywords, env).catch(() => ({ found: false }));

    if (blog.found) {
      references = await extractReferences(blog.url);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        typos: analysis.typos || [],
        titles: analysis.titles || [],
        thumbnails: analysis.thumbnails || null,
        onscreen_titles: analysis.onscreen_titles || null,
        description_intro: analysis.description_intro || "",
        defaultTag: channelInfo.defaultTag,
        video,
        blog,
        references,
        keywords_used: keywords
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
