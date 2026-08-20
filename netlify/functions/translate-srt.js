// netlify/functions/translate-srt.js
// 필요한 환경 변수: ANTHROPIC_API_KEY (다른 함수와 동일한 키 재사용)
// 입력: { texts: ["줄1", "줄2", ...], targetLang: "en" | "ja" }
// 출력: { texts: ["번역된 줄1", "번역된 줄2", ...] } — 반드시 입력과 같은 개수/순서

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST 요청만 허용됩니다." }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: "요청 본문이 올바른 JSON이 아닙니다." }) }; }

  const { texts, targetLang } = payload;
  if (!Array.isArray(texts) || texts.length === 0 || !targetLang) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "texts(배열), targetLang 값이 필요합니다." }) };
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

  // 자막 줄이 너무 많으면 한 번에 처리하기 어려우니 배치로 나눔
  const BATCH_SIZE = 60;
  const batches = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) batches.push(texts.slice(i, i + BATCH_SIZE));

  const system = `당신은 유튜브 자막(SRT)을 ${langLabel}로 번역하는 번역가입니다.
입력은 자막 줄들의 JSON 배열입니다. 각 줄을 자연스럽게 번역하고, 반드시 입력과 정확히 같은 개수·순서의 JSON 배열로만 응답하세요.
마크다운, 코드블록, 설명 문장 없이 순수 JSON 배열 하나만 출력합니다. 예: ["번역1","번역2"]
각 줄은 독립된 자막 한 덩어리이므로 원본의 줄바꿈 구조(있다면 \\n)도 최대한 유지합니다.`;

  try {
    const translatedAll = [];
    for (const batch of batches) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          system,
          messages: [{ role: "user", content: JSON.stringify(batch) }]
        })
      });
      const data = await res.json();
      if (!res.ok) {
        return { statusCode: res.status, headers, body: JSON.stringify({ error: "Claude API 오류: " + (data.error?.message || JSON.stringify(data)) }) };
      }
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
      let s = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
      const first = s.indexOf("["), last = s.lastIndexOf("]");
      if (first === -1 || last === -1) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "번역 결과에서 JSON 배열을 찾지 못했습니다." }) };
      }
      let arr;
      try { arr = JSON.parse(s.slice(first, last + 1)); }
      catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: "번역 결과 JSON 파싱 실패: " + e.message }) }; }

      if (!Array.isArray(arr) || arr.length !== batch.length) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: `번역 결과 개수가 맞지 않습니다 (요청 ${batch.length}줄, 응답 ${Array.isArray(arr) ? arr.length : "?"}줄).` }) };
      }
      translatedAll.push(...arr);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ texts: translatedAll }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "번역 요청 중 오류: " + e.message }) };
  }
};
