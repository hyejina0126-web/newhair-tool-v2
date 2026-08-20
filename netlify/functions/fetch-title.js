// netlify/functions/fetch-title.js
// URL 하나 받아서 그 페이지의 <title> 또는 og:title을 가져와 반환.
// API 키 필요 없음 — 그냥 페이지 HTML을 서버에서 대신 읽어오는 것뿐 (CORS 우회용).

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function extractTitle(html) {
  // 1. JSON-LD 구조화 데이터의 headline (뉴스 기사에 흔히 있고 보통 전체 제목)
  const ldMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldMatches) {
    const jsonText = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    try {
      const parsed = JSON.parse(jsonText);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item.headline === "string" && item.headline.trim()) {
          return decodeEntities(item.headline.trim());
        }
      }
    } catch (e) { /* JSON-LD 파싱 실패 시 다음 방법으로 */ }
  }

  // 2. <title> 태그 (보통 og:title보다 전체 제목을 담고 있음)
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (t && t[1]) {
    const cleaned = t[1].trim().replace(/\s*[|\-–]\s*[^|\-–]{1,30}$/, ""); // "제목 - 사이트명" 꼬리표 제거 시도
    if (cleaned) return decodeEntities(cleaned);
  }

  // 3. og:title (최후 수단, 잘려있을 수 있음)
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og && og[1]) return decodeEntities(og[1].trim());

  return null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  const url = event.queryStringParameters && event.queryStringParameters.url;

  if (!url) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "url 파라미터가 필요합니다." }) };
  }
  try {
    new URL(url);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "올바른 URL이 아닙니다." }) };
  }

  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!res.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: `페이지를 불러오지 못했습니다 (status ${res.status}).` }) };
    }
    const html = await res.text();
    const title = extractTitle(html);
    if (!title) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: "제목을 찾지 못했습니다. 직접 입력해주세요." }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ title }) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: "페이지 요청 중 오류: " + e.message }) };
  }
};
