// netlify/functions/translate.js
// 필요한 환경 변수: ANTHROPIC_API_KEY (generate.js와 동일한 키 재사용)

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST 요청만 허용됩니다." }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: "요청 본문이 올바른 JSON이 아닙니다." }) }; }

  const { title, description, targetLang } = payload;
  if (!title || !description || !targetLang) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "title, description, targetLang 값이 모두 필요합니다." }) };
  }

  const langNames = { en: "English (US)", ja: "일본어" };
  const langLabel = langNames[targetLang];
  if (!langLabel) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "지원하지 않는 언어입니다. (en 또는 ja만 가능)" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }) };
  }

  const system = `당신은 유튜브 채널의 제목·설명글을 ${langLabel}로 현지화하는 번역가입니다.
직역이 아니라 그 언어권 시청자에게 자연스럽게 읽히는 톤으로 번역하되, 원문의 핵심 정보와 뉘앙스는 유지합니다.
YouTube Studio의 '번역' 탭에 그대로 붙여넣을 용도이므로, 링크나 URL, 이모지(🎬/📝 등)는 원문 그대로 유지하고 텍스트만 번역합니다.
아래 JSON 형식으로만 응답하세요. 마크다운, 코드블록, 설명 문장 없이 순수 JSON 객체 하나만 출력합니다.
{"title": "번역된 제목", "description": "번역된 설명글 (줄바꿈 구조 유지)"}`;

  const userContent = `[제목]\n${title}\n\n[설명글]\n${description}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: userContent }]
      })
    });
    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, headers, body: JSON.stringify({ error: "Claude API 오류: " + (data.error?.message || JSON.stringify(data)) }) };
    }
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    let s = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
    const first = s.indexOf("{"), last = s.lastIndexOf("}");
    if (first === -1 || last === -1) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "번역 결과에서 JSON을 찾지 못했습니다." }) };
    }
    const parsed = JSON.parse(s.slice(first, last + 1));
    return { statusCode: 200, headers, body: JSON.stringify({ title: parsed.title || "", description: parsed.description || "" }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "번역 요청 중 오류: " + e.message }) };
  }
};
