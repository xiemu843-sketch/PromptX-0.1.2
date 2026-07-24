export const STORAGE_KEYS = {
  SETTINGS: "promptLens.settings",
  STATE: "promptLens.state",
  HISTORY: "promptLens.history"
};

export const DEFAULT_SETTINGS = {
  apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
  apiKey: "",
  model: "Qwen/Qwen3-VL-32B-Instruct",
  maxTokens: 900,
  temperature: 0.2
};

export const DEFAULT_UI_OPTIONS = {
  promptMode: "concise",
  language: "en"
};

export const STATUS_TEXT = {
  idle: "请选择图片或截选区域",
  missing_key: "请先配置 API Key",
  selecting: "点击网页图片",
  selecting_area: "拖拽截选区域",
  capturing: "正在截取图片区域",
  analyzing: "正在生成提示词",
  done: "提示词已生成",
  error: "生成失败，请重试"
};

export function getDefaultState() {
  return {
    status: "idle",
    message: STATUS_TEXT.idle,
    promptMode: DEFAULT_UI_OPTIONS.promptMode,
    language: DEFAULT_UI_OPTIONS.language,
    result: null,
    lastError: "",
    updatedAt: Date.now()
  };
}

export function normalizeSettings(value = {}) {
  const maxTokens = Number(value.maxTokens);
  const temperature = Number(value.temperature);

  return {
    apiUrl: typeof value.apiUrl === "string" && value.apiUrl.trim()
      ? value.apiUrl.trim()
      : DEFAULT_SETTINGS.apiUrl,
    apiKey: typeof value.apiKey === "string" ? value.apiKey.trim() : "",
    model: typeof value.model === "string" && value.model.trim()
      ? value.model.trim()
      : DEFAULT_SETTINGS.model,
    maxTokens: Number.isFinite(maxTokens)
      ? Math.min(Math.max(Math.round(maxTokens), 64), 4000)
      : DEFAULT_SETTINGS.maxTokens,
    temperature: Number.isFinite(temperature)
      ? Math.min(Math.max(temperature, 0), 1)
      : DEFAULT_SETTINGS.temperature
  };
}

export function hasApiKey(settings) {
  return Boolean(normalizeSettings(settings).apiKey);
}

export function normalizeUiOptions(value = {}) {
  return {
    promptMode: value.promptMode === "detailed" ? "detailed" : "concise",
    language: value.language === "zh" ? "zh" : "en"
  };
}

export function formatCombinedPrompt(prompt) {
  return normalizePromptText(prompt);
}

export function originPatternFromApiUrl(apiUrl) {
  const url = new URL(apiUrl);
  return `${url.protocol}//${url.host}/*`;
}

export function buildSystemPrompt() {
  return [
    "You are an expert prompt engineer for AI image generation.",
    "You do not recover the original hidden prompt.",
    "You infer one useful image generation prompt from the visible image content.",
    "Do not create a negative prompt.",
    "Return valid JSON only, without Markdown, explanations, headings, or code fences.",
    "The JSON schema is: {\"prompt\":\"string\"}."
  ].join(" ");
}

export function buildUserPrompt({ promptMode, language }) {
  const modeText = promptMode === "detailed"
    ? "使用详细模式，输出一段信息充分、细节完整的提示词。"
    : "使用简洁模式，输出一段较短但保留关键视觉特征的提示词。";

  const languageText = language === "zh"
    ? "最终提示词使用中文。"
    : "Write the final prompt in English.";

  return [
    "请仔细分析我提供的参考图片，反向推导出一份能够最大程度还原原图视觉效果的 AI 绘图提示词。",
    "请从以下维度进行分析：主体内容、主体外观特征、姿态与动作、表情与情绪、服装与配饰、场景环境、背景元素、构图方式、主体位置、镜头视角、景别、焦距与景深、光线方向、光线类型、色彩风格、材质细节、画面氛围、视觉风格、摄影风格、画质与细节。",
    "重点描述图片中最关键的视觉特征，并准确还原主体与环境之间的空间关系和比例关系。",
    "不要描述图片中不存在或无法确定的内容，不要擅自添加文字、Logo、品牌、水印等元素。",
    "如果图片中存在人物或动物，请重点描述其外貌、毛发、肤色、五官、身体比例、姿态和动作；如果存在产品，请重点描述产品的外观结构、材质、颜色、形状和摆放方式。",
    "输出一段完整、连贯、适合直接用于 AI 图像生成模型的提示词，不要分点，不要解释分析过程。",
    "不要输出负向提示词。",
    modeText,
    languageText,
    "Return only JSON with a single prompt field."
  ].join(" ");
}

export function parsePromptResponse(rawContent) {
  const content = normalizeModelContent(rawContent);
  const jsonText = extractJsonText(content);

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const prompt = normalizePromptText(parsed.prompt || parsed.positive || parsed.text || "");
      if (prompt) {
        return {
          prompt
        };
      }
    } catch {
      // Fall through to text parsing.
    }
  }

  return {
    prompt: normalizePromptText(content)
  };
}

function normalizeModelContent(rawContent) {
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item.text === "string") return item.text;
        return "";
      })
      .join("\n")
      .trim();
  }

  return String(rawContent || "").trim();
}

function extractJsonText(content) {
  const trimmed = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return "";
}

function stripPromptLabel(value) {
  return String(value || "")
    .replace(/^\s*(positive prompt|positive|prompt|正向提示词|正向|提示词)\s*[:：-]\s*/i, "")
    .trim();
}

export function normalizePromptText(value) {
  const withoutFence = String(value || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const promptOnly = withoutFence
    .split(/\n\s*(?:negative prompt|negative|negative_prompt|负向提示词|负向)\s*[:：-]/i)[0]
    .trim();

  return stripPromptLabel(promptOnly);
}
