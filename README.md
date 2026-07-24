<<<<<<< HEAD
# PromptX Edge Extension

PromptX 是一个 Microsoft Edge Manifest V3 扩展原型，用于在网页中点选图片或截选区域后，通过自定义 API 生成 AI 生图提示词。

当前版本：`0.1.2`

## 已实现

- 暗色 Side Panel 操作面板
- Options 设置页
- 自定义 API URL
- 自定义 API Key
- 自定义模型名
- 点选图片
- 截选区域
- 简洁/详细提示词模式
- 中文/英文输出语言
- 输出一段完整、连贯、可直接用于 AI 图像生成模型的提示词
- 一键复制提示词
- 最近 10 条历史记录
- Side Panel 下稳定定位当前普通网页标签页
- 生成中状态显示在侧边栏提示词框内
- 浏览器 Side Panel 固定侧边栏页面

## 默认 API 配置

- API URL: `https://api.siliconflow.cn/v1/chat/completions`
- 默认模型: `Qwen/Qwen3-VL-32B-Instruct`

API Key 不写入源码。安装后进入设置页手动填写测试 Key 或自己的 Key。

## 本地加载

1. 打开 Microsoft Edge。
2. 进入 `edge://extensions`。
3. 打开“开发人员模式”。
4. 点击“加载解压缩的扩展”。
5. 选择本目录：

```text
C:\Users\zhuoz\Documents\Codex\2026-07-21\microsoft-edge-3\outputs\PromptX-0.1.2
```

旧版 `edge-image-prompt-extension` 和 `edge-image-prompt-extension-0.1.1` 目录没有被覆盖，可继续作为上一版备份。

## 使用流程

1. 点击扩展图标。
2. 点击“设置”。
3. 填写 API URL、模型名和 API Key。
4. 点击“测试连接”确认可用。
5. 回到网页。
6. 点击扩展图标，打开固定在浏览器一侧的 PromptX 面板。
7. 选择“简洁/详细”和“中文/English”。
8. 点击“点选图片”或“截选区域”。
9. 在网页中选择图片或区域。
10. 保持侧边栏打开，等待提示词框显示结果。
11. 点击“复制提示词”。

## 注意

- API Key 保存在 Edge 扩展的本地存储中，没有加密。正式商业版本建议改成账号登录和后端代理。
- `edge://`、扩展商店、浏览器设置页等内部页面不能注入脚本。
- 跨域图片、canvas、背景图等场景会走截图裁剪，不直接读取网页图片源文件。
- 自定义非 SiliconFlow API 时，该 API 需要兼容 OpenAI 风格的 `chat/completions` 多模态请求格式。
- `0.1.1` 使用 `<all_urls>` host permission，以便固定侧边栏长期打开后仍能向当前普通网页注入点选/截选脚本。
=======
# PromptX-0.1.2
PromptX 是一个 Microsoft Edge Manifest V3 扩展原型，用于在网页中点选图片或截选区域后，通过自定义 API 生成 AI 生图提示词。
>>>>>>> origin/main
