import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { runCli } from "./index";
import { createProgram, type CoreCommandDependencies } from "./commands/core";
import { printSuccess } from "./output";
import type { ApiClient } from "./api-client";
import { CLI_VERSION } from "./version";
import { updateCli } from "./update";

let stdout = "";
let stderr = "";
let stdoutSpy: ReturnType<typeof spyOn>;
let stderrSpy: ReturnType<typeof spyOn>;
let originalFetch: typeof fetch;
let tempRoot: string | undefined;

function commandDependencies(): CoreCommandDependencies {
  const identity = { clientId: "cli_test_device", name: "测试设备", platform: "win32" };
  const client = { get: async () => ({ id: "user-1" }) } as unknown as ApiClient;
  return {
    configPath: "C:\\test\\config.json",
    devicePath: "C:\\test\\device.json",
    readConfig: async () => null,
    promptValue: async () => "",
    promptSecret: async () => "",
    enrollDevice: async () => ({
      identity,
      registered: { device: { ...identity, id: "device-1" }, deviceToken: "device-token" },
    }),
    ensureDeviceIdentity: async () => identity,
    syncSkill: async (global) => ({ synced: true, global, targets: ["C:\\test\\skills"] }),
    updateCli: async ({ confirmed }) => ({
      packageName: "@meidada-cn/cli",
      currentVersion: confirmed ? "0.4.0" : CLI_VERSION,
      latestVersion: "0.4.0",
      updateAvailable: true,
      installRoot: "C:\\test",
      updated: confirmed,
      confirmationRequired: !confirmed,
    }),
    createContext: (json) => ({
      output: { json },
      success: (action, data) => printSuccess(action, data, { json }),
      getClient: async () => client,
    }),
  };
}

beforeEach(() => {
  stdout = "";
  stderr = "";
  stdoutSpy = spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write);
  stderrSpy = spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write);
  originalFetch = globalThis.fetch;
  process.env.MDD_API_URL = "https://api.example.com";
  process.env.MDD_API_KEY = "device-token";
  process.env.MDD_AUTO_UPDATE = "0";
  process.exitCode = undefined;
});

afterEach(async () => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  globalThis.fetch = originalFetch;
  delete process.env.MDD_API_URL;
  delete process.env.MDD_API_KEY;
  delete process.env.MDD_AUTO_UPDATE;
  process.exitCode = undefined;
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = undefined;
  mock.restore();
});

describe("CLI command contract", () => {
  test("prints Commander help", async () => {
    expect(await runCli(["--help"])).toBe(0);
    expect(stdout).toContain("Usage: mdd [options] [command]");
    expect(stdout).toContain("config");
    expect(stdout).toContain("publish");
    expect(stdout).toContain("order");
    expect(stdout).toContain("wallet");
    expect(stdout).toContain("asset");
    expect(stderr).toBe("");
  });

  test("supports JSON before and after the version command", async () => {
    expect(await runCli(["--json", "version"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, action: "version", version: CLI_VERSION, data: CLI_VERSION });

    stdout = "";
    expect(await runCli(["version", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, action: "version", version: CLI_VERSION });
  });

  test("returns Commander parse errors through the JSON envelope", async () => {
    expect(await runCli(["doctor", "--bad-option", "--json"])).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({ ok: false, version: CLI_VERSION });
    expect(stdout).toContain("unknown option");
    expect(stderr).toBe("");
  });

  test("rejects unknown top-level commands before loading configuration", async () => {
    expect(await runCli(["unknown-command", "--json"])).toBe(1);
    expect(stdout).toContain("未知命令：unknown-command");
  });

  test("rejects excess arguments for migrated commands", async () => {
    expect(await runCli(["auth", "status", "unexpected", "--json"])).toBe(1);
    expect(stdout).toContain("too many arguments");
  });

  test("keeps migrated auth status action and envelope stable", async () => {
    expect(await runCli(["auth", "status", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      action: "auth.status",
      data: { configured: true, apiUrl: "https://api.example.com", tokenSource: "environment" },
    });
  });

  test("keeps every migrated core handler action stable", async () => {
    const commands: Array<{ args: string[]; action: string }> = [
      { args: ["config", "get"], action: "config.get" },
      { args: ["config", "init", "--api-url", "https://api.example.com", "--api-key", "master-key"], action: "config.init" },
      { args: ["device", "prepare"], action: "device.prepare" },
      { args: ["auth", "status"], action: "auth.status" },
      { args: ["auth", "whoami"], action: "auth.whoami" },
      { args: ["doctor"], action: "doctor" },
      { args: ["skill", "sync", "--global"], action: "skill.sync" },
      { args: ["update"], action: "update.check" },
    ];

    for (const item of commands) {
      stdout = "";
      await createProgram(commandDependencies()).parseAsync(["node", "mdd", ...item.args, "--json"]);
      expect(JSON.parse(stdout)).toMatchObject({ ok: true, action: item.action, version: CLI_VERSION });
    }
  });

  test("runs migrated low-risk commands through the API client", async () => {
    const requests: string[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      requests.push(String(input));
      const url = String(input);
      const data = url.includes("/customers/customer-1")
        ? { id: "customer-1", contactPhone: "13812345678" }
        : url.includes("/media/news")
          ? { list: [], page: 1 }
          : url.includes("/favorites/folders")
            ? { list: [] }
            : { list: [] };
      return Response.json({ code: 0, message: "ok", data });
    }) as unknown as typeof fetch;

    expect(await runCli(["draft", "list", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, action: "draft.list", data: { list: [] } });
    stdout = "";
    expect(await runCli(["wallet", "balance", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, action: "wallet.balance" });
    stdout = "";
    expect(await runCli(["customer", "get", "customer-1", "--json"])).toBe(0);
    expect(JSON.parse(stdout).data.contactPhone).toBe("138****5678");
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-cli-customer-"));
    const customerFile = join(tempRoot, "customer.json");
    await writeFile(customerFile, JSON.stringify({ name: "客户一", contactPhone: "13812345678" }));
    stdout = "";
    expect(await runCli(["customer", "create", "--file", customerFile, "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, action: "customer.create" });
    stdout = "";
    expect(await runCli(["favorite", "folder", "list", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, action: "favorite.folder.list" });
    stdout = "";
    expect(await runCli(["media", "search", "--channel", "news", "--keyword", "科技", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, action: "media.search" });
    expect(requests.some((url) => url.includes("keyword=%E7%A7%91%E6%8A%80"))).toBe(true);
  });

  test("updates after one explicit confirmation and does not ask again", async () => {
    const calls: Array<{ confirmed: boolean }> = [];
    const dependencies = commandDependencies();
    dependencies.updateCli = async (options) => {
      calls.push(options);
      return { updated: options.confirmed, confirmationRequired: !options.confirmed } as Awaited<ReturnType<typeof updateCli>>;
    };

    await createProgram(dependencies).parseAsync(["node", "mdd", "update", "--json"]);
    expect(JSON.parse(stdout)).toMatchObject({ action: "update.check", data: { updated: false, confirmationRequired: true } });
    stdout = "";
    await createProgram(dependencies).parseAsync(["node", "mdd", "update", "--yes", "--json"]);
    expect(JSON.parse(stdout)).toMatchObject({ action: "update", data: { updated: true, confirmationRequired: false } });
    expect(calls).toEqual([
      { confirmed: false },
      { confirmed: true },
    ]);
  });

  test("imports a text document into a draft and returns its preview link", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-cli-draft-import-"));
    const document = join(tempRoot, "article.txt");
    await writeFile(document, "第一段\n\n第二段");
    const requests: Array<{ url: string; method?: string; body?: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method, body: init?.body ? String(init.body) : undefined });
      if (url.endsWith("/api/drafts")) {
        return Response.json({
          code: 0,
          message: "ok",
          data: { id: "draft-import-1", title: "article", content: "<p>第一段</p>\n<p>第二段</p>", createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" },
        });
      }
      return Response.json({
        code: 0,
        message: "ok",
        data: { url: "https://preview.example.com/shared/article", expiresAt: "2026-08-12T00:00:00.000Z" },
      });
    }) as unknown as typeof fetch;

    expect(await runCli(["draft", "import", document, "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      action: "draft.import",
      data: {
        draft: { id: "draft-import-1", title: "article" },
        preview: { url: "https://preview.example.com/shared/article" },
        import: { format: "TEXT", imageCount: 0 },
      },
    });
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.example.com/api/drafts",
      "https://api.example.com/api/drafts/draft-import-1/preview-share",
    ]);
    expect(requests[0]?.body).toContain("<p>第一段</p>");
  });

  test("imports a real DOCX document into a draft", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-cli-docx-import-"));
    const document = join(tempRoot, "article.docx");
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
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX 标题</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="36"/></w:rPr><w:t>DOCX 正文</w:t></w:r></w:p></w:body></w:document>',
    );
    await writeFile(document, await zip.generateAsync({ type: "uint8array" }));
    let savedBody = "";
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/drafts")) {
        savedBody = String(init?.body);
        return Response.json({
          code: 0,
          message: "ok",
          data: { id: "draft-docx-1", title: "DOCX 标题", content: '<p style="text-align: center"><span style="font-size: 18px">DOCX 正文</span></p>', createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" },
        });
      }
      return Response.json({ code: 0, message: "ok", data: { url: "https://preview.example.com/shared/docx", expiresAt: "2026-08-12T00:00:00.000Z" } });
    }) as unknown as typeof fetch;

    expect(await runCli(["draft", "import", document, "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      action: "draft.import",
      data: { draft: { id: "draft-docx-1" }, import: { format: "DOCX", imageCount: 0 } },
    });
    expect(savedBody).toContain("DOCX 标题");
    expect(savedBody).toContain('text-align: center');
    expect(savedBody).toContain('font-size: 18px');
  });

  test("rejects short-video command options before calling the API", async () => {
    const fetchMock = mock(() => Promise.reject(new Error("fetch must not be called")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    expect(await runCli(["media", "search", "--channel", "short-video", "--json"])).toBe(1);
    expect(JSON.parse(stdout).error.message).toContain("news、we-media 或 overseas");
    expect(fetchMock).not.toHaveBeenCalled();

    stdout = "";
    expect(await runCli(["publish", "prepare", "--draft", "draft-1", "--media", "1", "--channel", "short-video", "--json"])).toBe(1);
    expect(JSON.parse(stdout).error.message).toContain("news、we-media 或 overseas");
    expect(fetchMock).not.toHaveBeenCalled();

    stdout = "";
    expect(await runCli(["favorite", "list", "--channel", "short-video", "--json"])).toBe(1);
    expect(JSON.parse(stdout).error.message).toContain("news、we-media 或 overseas");
    expect(fetchMock).not.toHaveBeenCalled();

    stdout = "";
    expect(await runCli(["favorite", "add", "1", "--channel", "short-video", "--json"])).toBe(1);
    expect(JSON.parse(stdout).error.message).toContain("news、we-media 或 overseas");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects short-video publish payloads before calling the API", async () => {
    const fetchMock = mock(() => Promise.reject(new Error("fetch must not be called")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-cli-publish-"));
    const payloadFile = join(tempRoot, "short-video.json");
    await writeFile(payloadFile, JSON.stringify({
      channel: "SHORT_VIDEO",
      mediaIds: [1],
      title: "测试标题",
      content: "<p>测试正文</p>",
    }));

    for (const action of ["validate", "dry-run", "request"]) {
      stdout = "";
      expect(await runCli(["publish", action, payloadFile, "--json"])).toBe(1);
      expect(JSON.parse(stdout).error.message).toContain("CLI 投放仅支持新闻媒体、自媒体和海外媒体");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  test("prepares publish payloads from a local file without saving a draft", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-cli-publish-file-"));
    const article = join(tempRoot, "article.txt");
    const campaignFile = join(tempRoot, "campaign.json");
    await writeFile(article, "本地文章标题\n\n本地文章正文");
    const requests: Array<{ url: string; method?: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method });
      if (url.endsWith("/api/wallet")) return Response.json({ code: 0, message: "ok", data: { balance: "200.00", frozenAmount: "0.00" } });
      if (url.endsWith("/api/media/news/101")) return Response.json({ code: 0, message: "ok", data: { name: "测试媒体", sellingPrice: "88.00" } });
      throw new Error(`unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    expect(await runCli([
      "publish", "prepare",
      "--file", article,
      "--title", "本地文章标题",
      "--channel", "news",
      "--media", "101",
      "--output", campaignFile,
      "--json",
    ])).toBe(0);

    const output = JSON.parse(stdout);
    expect(output).toMatchObject({
      action: "publish.prepare",
      data: {
        sourceDraft: null,
        draftCreated: false,
        payload: {
          title: "本地文章标题",
          content: "<p>本地文章标题</p>\n<p>本地文章正文</p>",
        },
      },
    });
    const campaign = JSON.parse(await readFile(campaignFile, "utf8"));
    expect(campaign.sourceDraft).toBeUndefined();
    expect(campaign.payload.title).toBe("本地文章标题");
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.example.com/api/wallet",
      "https://api.example.com/api/media/news/101",
    ]);
  });

  test("does not call the API when a destructive command lacks --yes", async () => {
    const fetchMock = mock(() => Promise.reject(new Error("fetch must not be called")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    expect(await runCli(["draft", "delete", "draft-1", "--json"])).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stdout).toContain("必须明确传入 --yes");
  });

  test("always rejects direct publish creation", async () => {
    expect(await runCli(["publish", "create", "--yes", "--json"])).toBe(1);
    expect(stdout).toContain("CLI 已禁止直接投放");
  });

  test("preserves approval lookup and order cancel preview/confirm boundaries", async () => {
    let cancelCalls = 0;
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/publish-approvals/approval-1")) {
        return Response.json({ code: 0, message: "ok", data: { id: "approval-1", status: "PENDING" } });
      }
      if (url.includes("/orders/order-1/cancel")) {
        cancelCalls += 1;
        expect(init?.method).toBe("POST");
        return Response.json({ code: 0, message: "ok", data: { orderNo: "order-1", status: 2 } });
      }
      return Response.json({
        code: 0,
        message: "ok",
        data: { orderNo: "order-1", status: 0, sellingPrice: "100.00", mediaName: "测试媒体" },
      });
    }) as unknown as typeof fetch;

    expect(await runCli(["publish", "approval", "get", "approval-1", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ action: "publish.approval.get", data: { status: "PENDING" } });
    stdout = "";
    expect(await runCli(["order", "cancel", "order-1", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ action: "order.cancel.preview", data: { cancelled: false, refundableAmount: "100.00" } });
    expect(cancelCalls).toBe(0);
    stdout = "";
    expect(await runCli(["order", "cancel", "order-1", "--yes", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ action: "order.cancel", data: { orderNo: "order-1" } });
    expect(cancelCalls).toBe(1);
  });

  test("previews the final publish summary before CLI confirmation", async () => {
    let confirmCalls = 0;
    const confirmBodies: unknown[] = [];
    const approval = {
      id: "approval-confirm-1",
      status: "PENDING",
      payload: { channel: "NEWS", mediaIds: [101], title: "待投放文章", content: "<p>正文</p>" },
      sourceDraft: { id: "draft-confirm-1", updatedAt: "2026-08-11T08:55:00.000Z" },
      quote: {
        items: [{ mediaId: 101, mediaName: "测试媒体", sellingPrice: "88.00" }],
        total: "88.00",
        walletBalance: "200.00",
        balanceAfter: "112.00",
        balanceSufficient: true,
      },
      confirmationUrl: "https://console.example.com/publish-approvals/approval-confirm-1",
      previewUrl: "https://preview.example.com/api/upstream/approval-confirm-1",
      results: null,
      draftDisposition: null,
      expiresAt: "2026-08-11T10:00:00.000Z",
      confirmedAt: null,
      createdAt: "2026-08-11T09:00:00.000Z",
      updatedAt: "2026-08-11T09:00:00.000Z",
    };
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/drafts/draft-confirm-1/preview-share")) {
        expect(init?.method).toBe("POST");
        return Response.json({
          code: 0,
          message: "ok",
          data: {
            url: "https://preview.example.com/api/shared-preview/draft-confirm-1",
            expiresAt: "2026-08-26T09:00:00.000Z",
          },
        });
      }
      if (url.endsWith("/confirm")) {
        confirmCalls += 1;
        confirmBodies.push(JSON.parse(String(init?.body)));
        expect(init?.method).toBe("POST");
        return Response.json({
          code: 0,
          message: "ok",
          data: {
            ...approval,
            status: "CONFIRMED",
            results: [{
              mediaId: 101,
              ok: true,
              orderNo: "ORDER-101",
              previewUrl: "https://preview.example.com/api/preview/ORDER-101",
            }],
            draftDisposition: confirmBodies.at(-1) && (confirmBodies.at(-1) as { keepDraft: boolean }).keepDraft
              ? "KEPT"
              : "DELETED",
            confirmedAt: "2026-08-11T09:05:00.000Z",
          },
        });
      }
      return Response.json({ code: 0, message: "ok", data: approval });
    }) as unknown as typeof fetch;

    expect(await runCli(["publish", "confirm", approval.id, "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      action: "publish.confirm.preview",
      data: {
        title: "待投放文章",
        mediaCount: 1,
        total: "88.00",
        previewUrl: "https://preview.example.com/api/upstream/approval-confirm-1",
        confirmation: {
          articleTitle: "待投放文章",
          total: "88.00",
          previewUrl: "https://preview.example.com/api/upstream/approval-confirm-1",
        },
        keepDraftDefault: false,
        draftDispositionOnFullSuccess: "DELETED",
        confirmed: false,
      },
    });
    expect(confirmCalls).toBe(0);

    stdout = "";
    expect(await runCli(["publish", "confirm", approval.id, "--keep-draft", "--json"])).toBe(1);
    expect(confirmCalls).toBe(0);

    stdout = "";
    expect(await runCli(["publish", "confirm", approval.id, "--yes", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      action: "publish.confirm",
      data: {
        status: "CONFIRMED",
        results: [{ orderNo: "ORDER-101", previewUrl: "https://preview.example.com/api/preview/ORDER-101" }],
      },
    });
    expect(confirmCalls).toBe(1);
    expect(confirmBodies).toEqual([{ keepDraft: false }]);

    stdout = "";
    expect(await runCli(["publish", "confirm", approval.id, "--yes", "--keep-draft", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      action: "publish.confirm",
      data: { draftDisposition: "KEPT" },
    });
    expect(confirmBodies).toEqual([{ keepDraft: false }, { keepDraft: true }]);
  });

  test("supports publish quote as a readable alias for request", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-cli-publish-quote-"));
    const payloadFile = join(tempRoot, "campaign.json");
    await writeFile(payloadFile, JSON.stringify({
      schemaVersion: "1",
      idempotencyKey: "quote-test-key",
      payload: {
        channel: "NEWS",
        mediaIds: [101],
        title: "报价文章",
        content: "<p>正文</p>",
      },
    }));
    const requests: Array<{ url: string; method?: string; idempotencyKey?: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method, idempotencyKey: init?.headers ? (init.headers as Record<string, string>)["Idempotency-Key"] : undefined });
      if (url.endsWith("/api/wallet")) return Response.json({ code: 0, message: "ok", data: { balance: "200.00", frozenAmount: "0.00" } });
      if (url.endsWith("/api/media/news/101")) return Response.json({ code: 0, message: "ok", data: { name: "分层价媒体", sellingPrice: "88.00" } });
      if (url.endsWith("/api/publish-approvals")) return Response.json({ code: 0, message: "ok", data: { id: "approval-quote-1", status: "PENDING" } });
      throw new Error(`unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    expect(await runCli(["publish", "quote", payloadFile, "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      action: "publish.request",
      data: { id: "approval-quote-1", status: "PENDING" },
    });
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.example.com/api/wallet",
      "https://api.example.com/api/media/news/101",
      "https://api.example.com/api/publish-approvals",
    ]);
    expect(requests.at(-1)?.idempotencyKey).toBe("quote-test-key");
  });

  test("previews draft article changes and requires --yes before writing", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-cli-draft-update-"));
    const contentFile = join(tempRoot, "updated.html");
    await writeFile(contentFile, "<p>新正文</p>");
    const requests: Array<{ url: string; method?: string }> = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method });
      if (url.endsWith("/api/drafts/draft-1")) {
        if (init?.method === "PUT") return Response.json({ code: 0, message: "ok", data: { id: "draft-1", title: "新标题", content: "<p>新正文</p>", updatedAt: "2026-08-12T00:01:00.000Z" } });
        return Response.json({ code: 0, message: "ok", data: { id: "draft-1", title: "旧标题", content: "<p>旧正文</p>", updatedAt: "2026-08-12T00:00:00.000Z" } });
      }
      return Response.json({ code: 0, message: "ok", data: {} });
    }) as unknown as typeof fetch;

    expect(await runCli(["draft", "update", "draft-1", "--title", "新标题", "--content-file", contentFile, "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ action: "draft.update.preview", data: { confirmed: false, changed: { title: true, content: true } } });
    expect(requests).toHaveLength(1);
    stdout = "";
    expect(await runCli(["draft", "update", "draft-1", "--title", "新标题", "--content-file", contentFile, "--yes", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ action: "draft.update", data: { id: "draft-1" } });
    expect(requests.at(-1)?.method).toBe("PUT");
  });

  test("keeps scheduled publishing as an explicit opt-in flow", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-cli-schedule-"));
    const scheduleFile = join(tempRoot, "schedule.json");
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const schedule = {
      id: "schedule-1",
      status: "DRAFT",
      payload: {
        draftIds: ["draft-1", "draft-2"],
        channel: "NEWS",
        mediaIds: [101],
        repeat: "DAILY",
        startAt: "2026-08-13T09:00:00+08:00",
        timezone: "Asia/Shanghai",
        runAt: "09:00",
        budgetPerRun: 200,
        budgetTotal: 3000,
        keepDraft: false,
      },
      nextRunAt: "2026-08-13T01:00:00.000Z",
    };
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });
      if (url.endsWith("/publish-schedules/prepare")) return Response.json({ code: 0, message: "ok", data: { valid: true, estimatedPerRun: "88.00" } });
      if (url.endsWith("/publish-schedules") && method === "POST") return Response.json({ code: 0, message: "ok", data: schedule });
      if (url.endsWith("/publish-schedules/schedule-1/confirm")) return Response.json({ code: 0, message: "ok", data: { ...schedule, status: "ACTIVE" } });
      return Response.json({ code: 0, message: "ok", data: schedule });
    }) as unknown as typeof fetch;

    expect(await runCli([
      "schedule", "prepare",
      "--drafts", "draft-1,draft-2",
      "--channel", "news",
      "--media", "101",
      "--start-at", "2026-08-13T09:00:00+08:00",
      "--run-at", "09:00",
      "--budget-per-run", "200",
      "--budget-total", "3000",
      "--output", scheduleFile,
      "--json",
    ])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ action: "schedule.prepare", data: { payload: { draftIds: ["draft-1", "draft-2"] } } });

    stdout = "";
    expect(await runCli(["schedule", "request", scheduleFile, "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ action: "schedule.request", data: { id: "schedule-1", status: "DRAFT" } });

    stdout = "";
    expect(await runCli(["schedule", "confirm", "schedule-1", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      action: "schedule.confirm.preview",
      data: {
        confirmed: false,
        confirmation: {
          draftIds: ["draft-1", "draft-2"],
          articleCount: 2,
          mediaIds: [101],
          mediaCount: 1,
          budgetPerRun: 200,
          budgetTotal: 3000,
        },
      },
    });
    expect(requests.filter((item) => item.url.endsWith("/confirm"))).toHaveLength(0);

    stdout = "";
    expect(await runCli(["schedule", "confirm", "schedule-1", "--yes", "--json"])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ action: "schedule.confirm", data: { status: "ACTIVE" } });
    expect(requests.filter((item) => item.url.endsWith("/confirm"))).toHaveLength(1);
  });

  test("preserves exit code 2 for partial asset upload failures", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "mdd-cli-test-"));
    const image = join(tempRoot, "cover.png");
    const unsupported = join(tempRoot, "notes.txt");
    await writeFile(image, "image");
    await writeFile(unsupported, "text");

    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://upload.example.com/cover.png") return new Response(null, { status: 200 });
      return Response.json({
        code: 0,
        message: "ok",
        data: {
          uploadUrl: "https://upload.example.com/cover.png",
          accessUrl: "https://cdn.example.com/cover.png",
          objectName: "cover.png",
        },
      });
    }) as unknown as typeof fetch;

    expect(await runCli(["asset", "upload", image, unsupported, "--json"])).toBe(2);
    expect(JSON.parse(stdout)).toMatchObject({ action: "asset.upload", data: { total: 2, succeeded: 1, failed: 1 } });
    expect(process.exitCode).toBeUndefined();
  });
});
