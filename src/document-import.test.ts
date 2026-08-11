import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import type { ApiClient } from "./api-client";
import { importDocx, transformWordDocument, type MammothAdapter } from "./document-import";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("CLI DOCX import", () => {
  test("maps Word alignment, heading semantics and font sizes", () => {
    expect(transformWordDocument({
      type: "paragraph",
      styleName: "Heading 2",
      alignment: "center",
      children: [{ type: "run", fontSize: 18 }],
    })).toMatchObject({
      styleName: "Docx Heading2 Align Center",
      children: [{ styleName: "Docx Font 18" }],
    });
  });

  test("preserves paragraph alignment and only applies declared first-line indentation", () => {
    expect(transformWordDocument({
      type: "paragraph",
      alignment: "center",
      indent: { firstLine: "480" },
    })).toMatchObject({ styleName: "Docx Align Center First Line Indent" });
    expect(transformWordDocument({ type: "paragraph", alignment: "both" }))
      .toMatchObject({ styleName: "Docx Align Justify" });
    expect(transformWordDocument({ type: "paragraph", indent: { firstLine: null } }).styleName).toBeUndefined();
    expect(transformWordDocument({ type: "paragraph", indent: { firstLine: "480", hanging: "480" } }).styleName).toBeUndefined();
  });

  test("preserves controlled formatting and uploads embedded images", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdd-docx-format-"));
    try {
      const file = join(root, "article.docx");
      await writeFile(file, "test-docx");
      const post = mock(async (path: string, body: unknown) => {
        expect(path).toBe("/uploads/image-url");
        expect(body).toMatchObject({ fileName: "word-image-1.png", fileType: "image/png" });
        return {
          uploadUrl: "https://upload.example.com/word-image-1.png",
          accessUrl: "https://cdn.example.com/word-image-1.png",
          objectName: "word-image-1.png",
        };
      });
      const client = { post } as unknown as ApiClient;
      globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe("https://upload.example.com/word-image-1.png");
        expect(init?.method).toBe("PUT");
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch;
      const adapter: MammothAdapter = async (_buffer, convertImage) => {
        const imageUrl = await convertImage({ contentType: "image/png", read: async () => new Uint8Array([137, 80, 78, 71]) });
        return {
          html: `<h1 class="docx-align-center">文章标题</h1><p class="docx-align-right docx-first-line-indent"><span class="docx-font-18">正文</span></p><img src="${imageUrl}">`,
          messages: [],
        };
      };

      const result = await importDocx(client, file, undefined, adapter);
      expect(result).toMatchObject({ title: "文章标题", imageCount: 1, format: "DOCX" });
      expect(result.content).toContain('<p style="text-align: right; text-indent: 2em"><span style="font-size: 18px">正文</span></p>');
      expect(result.content).toContain('<img src="https://cdn.example.com/word-image-1.png">');
      expect(post).toHaveBeenCalledTimes(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails instead of silently dropping an unsupported Word image", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdd-docx-image-format-"));
    try {
      const file = join(root, "article.docx");
      await writeFile(file, "test-docx");
      const adapter: MammothAdapter = async (_buffer, convertImage) => {
        await convertImage({ contentType: "image/x-emf", read: async () => new Uint8Array([1]) });
        return { html: "<p>正文</p>", messages: [] };
      };
      await expect(importDocx({} as ApiClient, file, undefined, adapter)).rejects.toThrow("转换为 PNG 或 JPEG");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("preserves a real Word table as semantic HTML", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdd-docx-table-"));
    try {
      const file = join(root, "table.docx");
      const zip = new JSZip();
      zip.file(
        "[Content_Types].xml",
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      );
      zip.file(
        "_rels/.rels",
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      );
      zip.file(
        "word/document.xml",
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>表格测试</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="center"/><w:ind w:firstLineChars="200"/></w:pPr><w:r><w:t>字符缩进且居中</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="IndentedBody"/></w:pPr><w:r><w:t>样式继承缩进</w:t></w:r></w:p><w:p><w:r><w:t>普通段落</w:t></w:r></w:p><w:tbl><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>渠道</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>阅读量</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>第三方</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>785</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>',
      );
      zip.file(
        "word/styles.xml",
        '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="BaseIndented"><w:name w:val="Base Indented"/><w:pPr><w:ind w:firstLineChars="200"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="IndentedBody"><w:name w:val="Indented Body"/><w:basedOn w:val="BaseIndented"/></w:style></w:styles>',
      );
      await writeFile(file, await zip.generateAsync({ type: "uint8array" }));

      const result = await importDocx({} as ApiClient, file);
      expect(result.title).toBe("表格测试");
      expect(result.content).toContain('<p style="text-align: center; text-indent: 2em">字符缩进且居中</p>');
      expect(result.content).toContain('<p style="text-indent: 2em">样式继承缩进</p><p>普通段落</p>');
      expect(result.content).toContain("<table>");
      expect(result.content).toContain("<tr><td><p>渠道</p></td><td><p>阅读量</p></td></tr>");
      expect(result.content).toContain("<tr><td><p>第三方</p></td><td><p>785</p></td></tr>");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
