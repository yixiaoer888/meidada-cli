import { basename, extname } from "node:path";
import { readFile, stat } from "node:fs/promises";
import JSZip from "jszip";
import mammoth from "mammoth";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { ApiClient } from "./api-client";
import { uploadDocumentImage } from "./assets";

const MAX_DOCX_BYTES = 20 * 1024 * 1024;
const MAX_EMBEDDED_IMAGES = 100;
const MAX_ARCHIVE_ENTRIES = 1000;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const SUPPORTED_FONT_SIZES = new Set([13, 18, 22, 28]);
const SUPPORTED_IMAGE_TYPES = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);
const ALIGNMENTS = ["Left", "Center", "Right", "Justify"] as const;
const PARAGRAPH_SEMANTICS = [
  { key: "Title", names: ["title", "标题"], tag: "h1" },
  { key: "Heading1", names: ["heading1", "heading 1", "标题 1", "标题1"], tag: "h1" },
  { key: "Heading2", names: ["heading2", "heading 2", "标题 2", "标题2"], tag: "h2" },
  { key: "Heading3", names: ["heading3", "heading 3", "标题 3", "标题3"], tag: "h3" },
] as const;

export type WordDocumentElement = {
  type: string;
  children?: WordDocumentElement[];
  styleId?: string | null;
  styleName?: string | null;
  alignment?: string | null;
  indent?: {
    start?: string | null;
    end?: string | null;
    firstLine?: string | null;
    hanging?: string | null;
  } | null;
  fontSize?: number | null;
  [key: string]: unknown;
};

export type EmbeddedImage = {
  contentType: string;
  read: () => Promise<Uint8Array>;
};

export type MammothAdapter = (
  buffer: Buffer,
  convertImage: (image: EmbeddedImage) => Promise<string>,
) => Promise<{ html: string; messages: Array<{ type: string; message: string }> }>;

export type ImportedDocument = {
  title: string;
  content: string;
  format: "DOCX" | "HTML" | "TEXT";
  imageCount: number;
  warnings: string[];
};

function fallbackTitle(file: string): string {
  return basename(file, extname(file)).slice(0, 255).trim() || "未命名稿件";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(value: string): string {
  const paragraphs = value.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (paragraphs.length === 0) throw new Error("文档没有有效正文");
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("\n");
}

function imageExtension(contentType: string): string {
  const subtype = contentType.split("/")[1]?.toLowerCase();
  if (subtype === "jpeg") return "jpg";
  return subtype?.replace(/[^a-z0-9]/g, "") || "bin";
}

function paragraphSemantic(element: WordDocumentElement) {
  const candidates = [element.styleId, element.styleName].filter(Boolean).map((value) => String(value).toLowerCase());
  return PARAGRAPH_SEMANTICS.find((semantic) => semantic.names.some((name) => candidates.includes(name)));
}

export function transformWordDocument(element: WordDocumentElement): WordDocumentElement {
  const transformed: WordDocumentElement = {
    ...element,
    ...(element.children ? { children: element.children.map(transformWordDocument) } : {}),
  };
  if (transformed.type === "paragraph") {
    const rawAlignment = transformed.alignment ?? "";
    const alignment = rawAlignment === "both" || rawAlignment === "distribute"
      ? "justify"
      : rawAlignment === "start"
        ? "left"
        : rawAlignment === "end"
          ? "right"
          : (["left", "center", "right", "justify"].includes(rawAlignment) ? rawAlignment : undefined);
    const hasFirstLineIndent = Number(transformed.indent?.firstLine) > 0
      && Number(transformed.indent?.hanging ?? 0) <= 0;
    const semantic = paragraphSemantic(transformed);
    if (alignment || hasFirstLineIndent) {
      const label = alignment ? `${alignment[0]!.toUpperCase()}${alignment.slice(1)}` : undefined;
      transformed.styleId = ["Docx", semantic?.key, label ? `Align${label}` : undefined, hasFirstLineIndent ? "FirstLineIndent" : undefined]
        .filter(Boolean)
        .join("");
      transformed.styleName = ["Docx", semantic?.key, label ? `Align ${label}` : undefined, hasFirstLineIndent ? "First Line Indent" : undefined]
        .filter(Boolean)
        .join(" ");
    }
  }
  if (transformed.type === "run" && transformed.fontSize && SUPPORTED_FONT_SIZES.has(transformed.fontSize)) {
    transformed.styleId = `DocxFont${transformed.fontSize}`;
    transformed.styleName = `Docx Font ${transformed.fontSize}`;
  }
  return transformed;
}

function normalizeControlledStyles(html: string): string {
  return html.replace(/\sclass="([^"]*)"/g, (_match, classValue: string) => {
    const classes = classValue.split(/\s+/);
    const alignment = ["left", "center", "right", "justify"].find((value) => classes.includes(`docx-align-${value}`));
    const fontSize = ["13", "18", "22", "28"].find((value) => classes.includes(`docx-font-${value}`));
    const firstLineIndent = classes.includes("docx-first-line-indent");
    const styles = [
      ...(alignment ? [`text-align: ${alignment}`] : []),
      ...(fontSize ? [`font-size: ${fontSize}px`] : []),
      ...(firstLineIndent ? ["text-indent: 2em"] : []),
    ];
    return styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
  });
}

function titleText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .trim();
}

function extractDocxTitle(
  html: string,
  fallback: string,
  allowParagraphFallback = true,
): { title: string; content: string; warning?: string } {
  const firstBlock = html.match(/^\s*<(h1|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>\s*/i);
  const candidate = firstBlock ? titleText(firstBlock[2]!) : "";
  const canUseParagraph = allowParagraphFallback
    && firstBlock?.[1]?.toLowerCase() === "p"
    && !/<(?:img|table)\b/i.test(firstBlock[2]!)
    && candidate.length <= 100;
  if (!firstBlock || (firstBlock[1]!.toLowerCase() !== "h1" && !canUseParagraph)) {
    return { title: fallback, content: html, warning: "未识别到 Word 标题，已使用文件名作为标题" };
  }
  const title = candidate.slice(0, 255);
  return title
    ? { title, content: html.slice(firstBlock[0].length).trim() }
    : { title: fallback, content: html, warning: "Word 标题为空，已使用文件名作为标题" };
}

async function assertSafeDocxArchive(buffer: Buffer): Promise<void> {
  const archive = await JSZip.loadAsync(buffer);
  const entries = Object.values(archive.files);
  const imageCount = entries.filter((entry) => /^word\/media\//i.test(entry.name)).length;
  const uncompressedBytes = entries.reduce(
    (sum, entry) => sum + ((entry as typeof entry & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0),
    0,
  );
  if (entries.length > MAX_ARCHIVE_ENTRIES || imageCount > MAX_EMBEDDED_IMAGES || uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new Error("DOCX 解压规模超过安全限制");
  }
}

function directChild(element: Element | undefined, tagName: string): Element | undefined {
  if (!element) return undefined;
  return Array.from(element.childNodes).find(
    (child): child is Element => child.nodeType === 1 && (child as Element).tagName === tagName,
  );
}

function positiveAttribute(element: Element | undefined, name: string): number | undefined {
  if (!element?.hasAttribute(name)) return undefined;
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function firstLineTwips(indent: Element | undefined): number | undefined {
  if (!indent) return undefined;
  if (positiveAttribute(indent, "w:hanging") || positiveAttribute(indent, "w:hangingChars")) return undefined;
  const twips = positiveAttribute(indent, "w:firstLine");
  if (twips) return twips;
  const hundredthsOfCharacter = positiveAttribute(indent, "w:firstLineChars");
  return hundredthsOfCharacter ? Math.max(1, Math.round(hundredthsOfCharacter * 2.4)) : undefined;
}

async function normalizeDocxFirstLineIndents(buffer: Buffer): Promise<Buffer> {
  const archive = await JSZip.loadAsync(buffer);
  const documentEntry = archive.file("word/document.xml");
  if (!documentEntry) return buffer;

  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const documentXml = parser.parseFromString(await documentEntry.async("text"), "application/xml");
  const stylesEntry = archive.file("word/styles.xml");
  const stylesXml = stylesEntry
    ? parser.parseFromString(await stylesEntry.async("text"), "application/xml")
    : undefined;
  const styleIndents = new Map<string, number>();
  const styleParents = new Map<string, string>();

  if (stylesXml) {
    for (const style of Array.from(stylesXml.getElementsByTagName("w:style"))) {
      if (style.getAttribute("w:type") !== "paragraph") continue;
      const styleId = style.getAttribute("w:styleId");
      if (!styleId) continue;
      const parentId = directChild(style, "w:basedOn")?.getAttribute("w:val");
      if (parentId) styleParents.set(styleId, parentId);
      const indent = directChild(directChild(style, "w:pPr"), "w:ind");
      const twips = firstLineTwips(indent);
      if (twips) styleIndents.set(styleId, twips);
    }
  }

  const styleIndent = (styleId: string | undefined): number | undefined => {
    const visited = new Set<string>();
    let current = styleId;
    while (current && !visited.has(current)) {
      visited.add(current);
      const indent = styleIndents.get(current);
      if (indent) return indent;
      current = styleParents.get(current);
    }
    return undefined;
  };

  let changed = false;
  for (const paragraph of Array.from(documentXml.getElementsByTagName("w:p"))) {
    let paragraphProperties = directChild(paragraph, "w:pPr");
    const directIndent = paragraphProperties ? directChild(paragraphProperties, "w:ind") : undefined;
    const hasExplicitIndent = Boolean(directIndent && ["w:firstLine", "w:firstLineChars", "w:hanging", "w:hangingChars"]
      .some((name) => directIndent.hasAttribute(name)));
    const styleId = paragraphProperties ? directChild(paragraphProperties, "w:pStyle")?.getAttribute("w:val") : undefined;
    const twips = hasExplicitIndent ? firstLineTwips(directIndent) : styleIndent(styleId ?? undefined);
    if (!twips || directIndent?.getAttribute("w:firstLine") === String(twips)) continue;

    if (!paragraphProperties) {
      paragraphProperties = documentXml.createElement("w:pPr");
      paragraph.insertBefore(paragraphProperties, paragraph.firstChild);
    }
    const indent = directIndent ?? documentXml.createElement("w:ind");
    if (!directIndent) paragraphProperties.appendChild(indent);
    indent.setAttribute("w:firstLine", String(twips));
    changed = true;
  }

  if (!changed) return buffer;
  archive.file("word/document.xml", serializer.serializeToString(documentXml));
  return archive.generateAsync({ type: "nodebuffer" });
}

const defaultMammothAdapter: MammothAdapter = async (buffer, convertImage) => {
  const controlledParagraphStyles = [
    "p[style-name='Docx First Line Indent'] => p.docx-first-line-indent:fresh",
    ...ALIGNMENTS.flatMap((alignment) => [
      `p[style-name='Docx Align ${alignment}'] => p.docx-align-${alignment.toLowerCase()}:fresh`,
      `p[style-name='Docx Align ${alignment} First Line Indent'] => p.docx-align-${alignment.toLowerCase()}.docx-first-line-indent:fresh`,
    ]),
    ...PARAGRAPH_SEMANTICS.flatMap((semantic) => [
      `p[style-name='Docx ${semantic.key} First Line Indent'] => ${semantic.tag}.docx-first-line-indent:fresh`,
      ...ALIGNMENTS.flatMap((alignment) => [
        `p[style-name='Docx ${semantic.key} Align ${alignment}'] => ${semantic.tag}.docx-align-${alignment.toLowerCase()}:fresh`,
        `p[style-name='Docx ${semantic.key} Align ${alignment} First Line Indent'] => ${semantic.tag}.docx-align-${alignment.toLowerCase()}.docx-first-line-indent:fresh`,
      ]),
    ]),
  ];
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      externalFileAccess: false,
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='标题'] => h1:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='标题 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='标题 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='标题 3'] => h3:fresh",
        "r[style-name='Docx Font 13'] => span.docx-font-13",
        "r[style-name='Docx Font 18'] => span.docx-font-18",
        "r[style-name='Docx Font 22'] => span.docx-font-22",
        "r[style-name='Docx Font 28'] => span.docx-font-28",
        ...controlledParagraphStyles,
      ],
      transformDocument: transformWordDocument,
      convertImage: mammoth.images.imgElement(async (image) => ({
        src: await convertImage({
          contentType: image.contentType,
          read: async () => new Uint8Array(await image.readAsBuffer()),
        }),
      })),
    },
  );
  return {
    html: result.value,
    messages: result.messages.map((message) => ({ type: message.type, message: message.message })),
  };
};

export async function importDocx(
  client: ApiClient,
  file: string,
  explicitTitle?: string,
  adapter: MammothAdapter = defaultMammothAdapter,
): Promise<ImportedDocument> {
  const info = await stat(file);
  if (info.size > MAX_DOCX_BYTES) throw new Error("DOCX 文件不能超过 20 MB");
  const buffer = await readFile(file);
  if (adapter === defaultMammothAdapter) await assertSafeDocxArchive(buffer);
  const conversionBuffer = adapter === defaultMammothAdapter ? await normalizeDocxFirstLineIndents(buffer) : buffer;
  let imageCount = 0;
  const result = await adapter(conversionBuffer, async (image) => {
    if (imageCount >= MAX_EMBEDDED_IMAGES) throw new Error(`DOCX 内嵌图片不能超过 ${MAX_EMBEDDED_IMAGES} 张`);
    imageCount += 1;
    if (!SUPPORTED_IMAGE_TYPES.has(image.contentType.toLowerCase())) {
      throw new Error(`第 ${imageCount} 张图片格式 ${image.contentType} 无法在浏览器显示，请在 Word 中转换为 PNG 或 JPEG`);
    }
    const extension = imageExtension(image.contentType);
    try {
      return await uploadDocumentImage(client, {
        fileName: `word-image-${imageCount}.${extension}`,
        fileType: image.contentType,
        data: await image.read(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`第 ${imageCount} 张图片上传失败：${message}`);
    }
  });
  const normalizedHtml = normalizeControlledStyles(result.html.trim());
  const extracted = extractDocxTitle(normalizedHtml, fallbackTitle(file), !explicitTitle?.trim());
  if (!extracted.content.trim()) throw new Error("文档没有有效正文");
  return {
    title: explicitTitle?.trim().slice(0, 255) || extracted.title,
    content: extracted.content,
    format: "DOCX",
    imageCount,
    warnings: [
      ...(extracted.warning ? [extracted.warning] : []),
      ...result.messages.filter((message) => message.type === "warning").map((message) => message.message),
    ],
  };
}

export async function importDocument(client: ApiClient, file: string, explicitTitle?: string): Promise<ImportedDocument> {
  const extension = extname(file).toLowerCase();
  if (extension === ".docx") return importDocx(client, file, explicitTitle);
  const content = await readFile(file, "utf8");
  if (!content.trim()) throw new Error("文档没有有效正文");
  if (extension === ".html" || extension === ".htm") {
    return {
      title: explicitTitle?.trim().slice(0, 255) || fallbackTitle(file),
      content,
      format: "HTML",
      imageCount: 0,
      warnings: [],
    };
  }
  if (extension === ".txt") {
    return {
      title: explicitTitle?.trim().slice(0, 255) || fallbackTitle(file),
      content: textToHtml(content),
      format: "TEXT",
      imageCount: 0,
      warnings: [],
    };
  }
  throw new Error("仅支持 DOCX、HTML 和 TXT 文档");
}
