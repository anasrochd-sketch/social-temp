"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft, Code2, FilePlus2, FolderOpen, Play, RotateCcw, Save, Send, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { JupyterNotebook } from "@/components/coding/JupyterNotebook";

type LanguageId = "python" | "javascript" | "typescript" | "html" | "css" | "c" | "cpp" | "java" | "csharp" | "php" | "go" | "rust" | "sql";
type Language = { id: LanguageId; extension: string; files: Record<string, string>; description: string; runtime: "browser" | "external" | "preview" };
type DirectoryHandleLike = {
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options: { create: boolean }): Promise<{ createWritable(): Promise<{ write(value: string): Promise<void>; close(): Promise<void> }> }>;
};
type AssignmentContext = { id: string; title: string; due_at: string; created_at: string; points: number; kind: string };
type AssignmentSubmission = { id: string; status: "in_progress" | "submitted" | "graded" };
type SqlDatabase = { exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>; close(): void };
type SqlLibrary = { Database: new () => SqlDatabase };
type SqlLoader = (options: { locateFile(file: string): string }) => Promise<SqlLibrary>;
type WandboxCompiler = { name: string; language: string; version: string };
type WandboxResult = { compiler_message?: string; compiler_output?: string; program_message?: string; program_output?: string; status?: string | number; signal?: string | null };

declare global { interface Window { initSqlJs?: SqlLoader } }

const ASSIGNMENT_BUCKET = "assignment-submissions";
const MAX_SUBMISSION_SIZE = 20 * 1024 * 1024;
const SQLJS_BASE = "https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/";
const WANDBOX_API = "https://wandbox.org/api";
let sqlPromise: Promise<SqlLibrary> | null = null;
let wandboxCompilersPromise: Promise<WandboxCompiler[]> | null = null;
const LANGUAGES: Language[] = [
  { id: "python", extension: "py", runtime: "external", description: "Scripts and automation", files: { "main.py": 'print("Hello, COVA!")\n' } },
  { id: "javascript", extension: "js", runtime: "browser", description: "Interactive web and server code", files: { "main.js": 'const greeting = "Hello, COVA!";\nconsole.log(greeting);\n' } },
  { id: "typescript", extension: "ts", runtime: "browser", description: "Typed JavaScript applications", files: { "main.ts": 'const greeting: string = "Hello, COVA!";\nconsole.log(greeting);\n' } },
  { id: "html", extension: "html", runtime: "preview", description: "Web page structure", files: { "index.html": '<main class="card">\n  <h1>Hello, COVA!</h1>\n  <p>Edit this page and run the preview.</p>\n</main>\n', "styles.css": 'body { font-family: system-ui, sans-serif; padding: 2rem; background: #f2f5f8; }\n.card { max-width: 38rem; margin: auto; padding: 2rem; border-radius: 1rem; background: white; }\n' } },
  { id: "css", extension: "css", runtime: "preview", description: "Web page styling", files: { "styles.css": 'body { font-family: system-ui, sans-serif; padding: 2rem; background: #eef3ff; }\n.card { max-width: 38rem; margin: auto; padding: 2rem; border-radius: 1rem; background: white; }\n', "index.html": '<main class="card"><h1>Hello, COVA!</h1><p>Edit styles.css and run the preview.</p></main>\n' } },
  { id: "c", extension: "c", runtime: "external", description: "Compiled systems programming", files: { "main.c": '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, COVA!\\n");\n    return 0;\n}\n' } },
  { id: "cpp", extension: "cpp", runtime: "external", description: "C++ applications and systems", files: { "main.cpp": '#include <iostream>\n\nint main() {\n    std::cout << "Hello, COVA!\\n";\n    return 0;\n}\n' } },
  { id: "java", extension: "java", runtime: "external", description: "Java applications", files: { "prog.java": 'public class prog {\n    public static void main(String[] args) {\n        System.out.println("Hello, COVA!");\n    }\n}\n' } },
  { id: "csharp", extension: "cs", runtime: "external", description: ".NET applications", files: { "Program.cs": 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello, COVA!");\n    }\n}\n' } },
  { id: "php", extension: "php", runtime: "external", description: "Web backends and scripts", files: { "index.php": '<?php\necho "Hello, COVA!" . PHP_EOL;\n' } },
  { id: "go", extension: "go", runtime: "external", description: "Go services and tools", files: { "main.go": 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, COVA!")\n}\n' } },
  { id: "rust", extension: "rs", runtime: "external", description: "Rust systems programming", files: { "main.rs": 'fn main() {\n    println!("Hello, COVA!");\n}\n' } },
  { id: "sql", extension: "sql", runtime: "browser", description: "Relational database queries", files: { "query.sql": 'SELECT\n  \'Hello, COVA!\' AS greeting,\n  CURRENT_DATE AS today;\n' } },
];

function displayValue(value: unknown) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function safeProjectName(value: string) {
  return value.trim().replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/[. ]+$/g, "") || "cova-project";
}

function downloadedFile(name: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function getSqlLibrary() {
  if (!window.initSqlJs) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.getElementById("cova-sqljs-script") as HTMLScriptElement | null;
      const script = existing ?? document.createElement("script");
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the SQLite browser runtime. Check your internet connection and try again."));
      if (!existing) {
        script.id = "cova-sqljs-script";
        script.src = `${SQLJS_BASE}sql-wasm.js`;
        script.async = true;
        document.head.appendChild(script);
      }
    });
  }
  if (!window.initSqlJs) throw new Error("SQLite did not initialize.");
  sqlPromise ??= window.initSqlJs({ locateFile: (file) => `${SQLJS_BASE}${file}` });
  return sqlPromise;
}

async function getWandboxCompilers() {
  wandboxCompilersPromise ??= fetch(`${WANDBOX_API}/list.json`).then(async (response) => {
    if (!response.ok) throw new Error(`Compiler catalog returned HTTP ${response.status}.`);
    return await response.json() as WandboxCompiler[];
  });
  return wandboxCompilersPromise;
}

export function CodingLab({ assignmentId, assignmentTitle }: { assignmentId?: string; assignmentTitle?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [languageId, setLanguageId] = useState<LanguageId | null>(null);
  const [jupyterOpen, setJupyterOpen] = useState(false);
  const [files, setFiles] = useState<Record<LanguageId, Record<string, string>>>(() =>
    Object.fromEntries(LANGUAGES.map((language) => [language.id, language.files])) as Record<LanguageId, Record<string, string>>,
  );
  const [activeFile, setActiveFile] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [standardInput, setStandardInput] = useState("");
  const [projectName, setProjectName] = useState(assignmentTitle ? safeProjectName(assignmentTitle) : "cova-project");
  const [displayName, setDisplayName] = useState("");
  const [localDirectory, setLocalDirectory] = useState<DirectoryHandleLike | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [assignment, setAssignment] = useState<AssignmentContext | null>(null);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [assignmentError, setAssignmentError] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(Boolean(assignmentId));
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const language = LANGUAGES.find((item) => item.id === languageId) ?? null;
  const languageFiles = languageId ? files[languageId] ?? {} : {};
  const code = activeFile && languageFiles[activeFile] !== undefined ? languageFiles[activeFile] : "";
  const assignmentCutoff = useMemo(() => {
    if (!assignment) return null;
    const due = new Date(assignment.due_at).getTime();
    const created = new Date(assignment.created_at).getTime();
    return due + Math.max(0, due - created);
  }, [assignment]);
  const submissionWindowOpen = assignmentCutoff !== null && assignmentCutoff > now;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cova-coding-projects-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Record<LanguageId, Record<string, string>>>;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time hydration from localStorage, deferred to avoid an SSR hydration mismatch
        setFiles((current) => ({ ...current, ...parsed }));
      }
    } catch (error) {
      console.warn("Could not restore local coding projects:", error);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem("cova-coding-projects-v1", JSON.stringify(files));
  }, [files, hydrated]);

  useEffect(() => {
    let active = true;
    async function loadContext() {
      try {
        const supabase = getSupabase();
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
          if (active) setDisplayName(profile?.display_name?.trim() || user.user_metadata?.name || user.email?.split("@")[0] || "Student");
        }
        if (!assignmentId) return;
        if (!user) throw new Error("Not signed in");
        const { data: assignmentRow, error: assignmentLoadError } = await supabase.from("assignments")
          .select("id,title,due_at,created_at,points,kind").eq("id", assignmentId).maybeSingle();
        if (assignmentLoadError || !assignmentRow) throw assignmentLoadError ?? new Error("Assignment not found");
        if (active) {
          setAssignment(assignmentRow as AssignmentContext);
          setProjectName(safeProjectName(assignmentTitle || assignmentRow.title));
        }
        const { data: submissionRow, error: submissionError } = await supabase.from("assignment_submissions")
          .select("id,status").eq("assignment_id", assignmentId).eq("student_id", user.id).maybeSingle();
        if (submissionError) throw submissionError;
        if (active) setSubmission(submissionRow as AssignmentSubmission | null);
      } catch (error) {
        console.error("Unable to load coding assignment context:", error);
        if (active) setAssignmentError(true);
      } finally {
        if (active && assignmentId) setAssignmentLoading(false);
      }
    }
    void loadContext();
    return () => { active = false; };
  }, [assignmentId, assignmentTitle]);

  function chooseLanguage(id: LanguageId) {
    setLanguageId(id);
    setActiveFile(Object.keys(files[id] ?? LANGUAGES.find((item) => item.id === id)!.files)[0] ?? "main.txt");
    setOutput("");
    setPreviewHtml("");
  }

  function updateCode(value: string) {
    if (!languageId || !activeFile) return;
    setFiles((current) => ({ ...current, [languageId]: { ...current[languageId], [activeFile]: value } }));
  }

  function addFile() {
    if (!languageId || !newFileName.trim()) {
      toast.push(t("coding.fileNameRequired"));
      return;
    }
    let name = newFileName.trim().replace(/[\\/]+/g, "-");
    if (!name.includes(".")) name = `${name}.${language?.extension ?? "txt"}`;
    if (languageFiles[name] !== undefined) {
      setActiveFile(name);
      setNewFileName("");
      return;
    }
    setFiles((current) => ({ ...current, [languageId]: { ...current[languageId], [name]: "" } }));
    setActiveFile(name);
    setNewFileName("");
  }

  async function importLocalFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!languageId) return;
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) return;
    const imported: Record<string, string> = {};
    for (const file of selected) imported[file.name] = await file.text();
    setFiles((current) => ({ ...current, [languageId]: { ...current[languageId], ...imported } }));
    setActiveFile(selected[0]!.name);
    event.target.value = "";
  }

  async function saveProjectLocally() {
    if (!languageId) return;
    const browserWindow = window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandleLike> };
    try {
      let root = localDirectory;
      if (!root && browserWindow.showDirectoryPicker) {
        root = await browserWindow.showDirectoryPicker();
        setLocalDirectory(root);
      }
      if (root) {
        const projectFolder = await root.getDirectoryHandle(safeProjectName(projectName), { create: true });
        for (const [name, contents] of Object.entries(languageFiles)) {
          const fileHandle = await projectFolder.getFileHandle(name, { create: true });
          const writer = await fileHandle.createWritable();
          await writer.write(contents);
          await writer.close();
        }
        toast.push(t("coding.saved"));
      } else {
        downloadedFile(activeFile || `main.${language?.extension ?? "txt"}`, code);
        toast.push(t("coding.downloaded"));
      }
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
      console.error("Unable to save local coding project:", error);
      downloadedFile(activeFile || `main.${language?.extension ?? "txt"}`, code);
      toast.push(t("coding.downloaded"));
    }
  }

  async function runCode() {
    if (!languageId || !language) return;
    setOutput("");
    setPreviewHtml("");
    if (languageId === "html" || languageId === "css") {
      const html = languageFiles["index.html"] ?? (languageId === "html" ? code : "<main class=\"card\"><h1>Hello</h1></main>");
      const css = languageFiles["styles.css"] ?? (languageId === "css" ? code : "");
      setPreviewHtml(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:"><style>${css.replace(/<\/style/gi, "<\\/style")}</style></head><body>${html.replace(/<script[\s\S]*?<\/script>/gi, "")}</body></html>`);
      return;
    }
    if (languageId === "sql") {
      setRunning(true);
      try {
        const SQL = await getSqlLibrary();
        const database = new SQL.Database();
        try {
          const results = database.exec(code);
          setOutput(results.length
            ? results.map((result) => [result.columns.join(" | "), ...result.values.map((row) => row.map(displayValue).join(" | "))].join("\n")).join("\n\n")
            : "SQL executed successfully. No rows returned.");
        } finally {
          database.close();
        }
      } catch (error) {
        console.error("SQL execution failed:", error);
        setOutput(error instanceof Error ? error.message : "SQL could not run.");
      } finally {
        setRunning(false);
      }
      return;
    }

    if (language.runtime === "external") {
      setRunning(true);
      const targetNames: Partial<Record<LanguageId, string[]>> = {
        python: ["python"], c: ["c"], cpp: ["c++"], java: ["java"], csharp: ["c#", "csharp"],
        php: ["php"], go: ["go"], rust: ["rust"],
      };
      const acceptedNames = targetNames[languageId] ?? [];
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      try {
        const compilers = await getWandboxCompilers();
        const compiler = languageId === "python"
          ? compilers.find((item) => item.name === "cpython-3.13.8")
            ?? compilers.find((item) => acceptedNames.includes(item.language.trim().toLowerCase()) && !item.name.toLowerCase().includes("head"))
          : compilers.find((item) => acceptedNames.includes(item.language.trim().toLowerCase()));
        if (!compiler) throw new Error(`No ${languageLabel(languageId)} compiler is currently available in the external runner.`);
        const response = await fetch(`${WANDBOX_API}/compile.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            compiler: compiler.name,
            code,
            codes: Object.entries(languageFiles).filter(([name]) => name !== activeFile).map(([file, source]) => ({ file, code: source })),
            stdin: standardInput,
            options: "",
            save: false,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Compiler service returned HTTP ${response.status}.`);
        const result = await response.json() as WandboxResult;
        const lines = [result.compiler_message || result.compiler_output, result.program_message || result.program_output]
          .filter((line): line is string => Boolean(line?.trim()));
        if (result.status !== undefined) lines.push(`Exit status: ${result.status}${result.signal ? ` · ${result.signal}` : ""}`);
        setOutput(lines.join("\n\n") || "Program finished without output.");
      } catch (error) {
        console.error("External code execution failed:", error);
        setOutput(error instanceof Error
          ? error.name === "AbortError" ? "The compiler service timed out. Try a smaller program." : error.message
          : "The external compiler could not run this program.");
      } finally {
        clearTimeout(timeout);
        setRunning(false);
      }
      return;
    }

    setRunning(true);
    let worker: Worker | null = null;
    let workerUrl: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      let executable = code;
      if (languageId === "typescript") {
        const ts = await import("typescript");
        executable = ts.transpile(code, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
      }
      const runner = `
        const safeConsole = {
          log: (...args) => postMessage({ kind: 'output', text: args.map((v) => typeof v === 'string' ? v : JSON.stringify(v)).join(' ') }),
          info: (...args) => postMessage({ kind: 'output', text: args.map((v) => typeof v === 'string' ? v : JSON.stringify(v)).join(' ') }),
          warn: (...args) => postMessage({ kind: 'error', text: args.map((v) => typeof v === 'string' ? v : JSON.stringify(v)).join(' ') }),
          error: (...args) => postMessage({ kind: 'error', text: args.map((v) => typeof v === 'string' ? v : JSON.stringify(v)).join(' ') }),
        };
        self.fetch = () => Promise.reject(new Error('Network access is disabled in this editor.'));
        self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.importScripts = undefined;
        onmessage = async () => { try { const run = new Function('console', ${JSON.stringify(executable)}); await run(safeConsole); postMessage({ kind: 'done' }); } catch (error) { postMessage({ kind: 'error', text: error && error.stack ? error.stack : String(error) }); } };
      `;
      workerUrl = URL.createObjectURL(new Blob([runner], { type: "text/javascript" }));
      worker = new Worker(workerUrl);
      const outputLines: string[] = [];
      const currentWorker = worker;
      timer = setTimeout(() => {
        currentWorker.terminate();
        if (workerUrl) URL.revokeObjectURL(workerUrl);
        setOutput((old) => `${old}${old ? "\n" : ""}Stopped after the 2-second execution limit.`);
        setRunning(false);
      }, 2000);
      worker.onmessage = (event: MessageEvent<{ kind: string; text?: string }>) => {
        if (event.data.kind === "done") {
          if (timer) clearTimeout(timer);
          if (workerUrl) URL.revokeObjectURL(workerUrl);
          setOutput(outputLines.join("\n") || "Program finished without output.");
          worker?.terminate();
          setRunning(false);
        } else {
          outputLines.push(event.data.text ?? "");
          if (event.data.kind === "error") {
            if (timer) clearTimeout(timer);
            if (workerUrl) URL.revokeObjectURL(workerUrl);
            setOutput(outputLines.join("\n"));
            worker?.terminate();
            setRunning(false);
          }
        }
      };
      worker.onerror = (event) => {
        if (timer) clearTimeout(timer);
        if (workerUrl) URL.revokeObjectURL(workerUrl);
        setOutput(event.message || "Could not run this program.");
        worker?.terminate();
        setRunning(false);
      };
      worker.postMessage(null);
    } catch (error) {
      if (timer) clearTimeout(timer);
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      console.error("Code runner failed:", error);
      setOutput(error instanceof Error ? error.message : "Could not run this program.");
      worker?.terminate();
      setRunning(false);
    }
  }

  async function startAssignment() {
    if (!assignmentId || assignmentBusy) return;
    setAssignmentBusy(true);
    try {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { data, error } = await supabase.from("assignment_submissions").insert({
        assignment_id: assignmentId,
        student_id: auth.user.id,
        status: "in_progress",
      }).select("id,status").single();
      if (error) throw error;
      setSubmission(data as AssignmentSubmission);
    } catch (error) {
      console.error("Unable to start coding assignment:", error);
      setAssignmentError(true);
    } finally {
      setAssignmentBusy(false);
    }
  }

  async function submitProject() {
    if (!assignmentId || !assignment || !submission || submission.status !== "in_progress" || assignmentBusy) return;
    if (!submissionWindowOpen) {
      setOutput(t("assignments.detail.deadlineClosed"));
      return;
    }
    setAssignmentBusy(true);
    let storagePath: string | null = null;
    try {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const bundle = Object.entries(languageFiles).map(([name, contents]) => `===== ${name} =====\n${contents}`).join("\n\n");
      const projectFile = new File([bundle], `${safeProjectName(projectName)}-${languageId}.txt`, { type: "text/plain" });
      if (projectFile.size > MAX_SUBMISSION_SIZE) throw new Error("Project files must total 20 MB or less.");
      storagePath = `${auth.user.id}/${assignmentId}/${crypto.randomUUID()}-${projectFile.name}`;
      const { error: uploadError } = await supabase.storage.from(ASSIGNMENT_BUCKET).upload(storagePath, projectFile, { contentType: "text/plain", upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("assignment_submissions").update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        submission_text: `Coding Lab project: ${projectName}\nLanguage: ${language?.id ?? ""}\nFiles: ${Object.keys(languageFiles).join(", ")}`,
        storage_path: storagePath,
      }).eq("id", submission.id);
      if (error) throw error;
      setSubmission({ ...submission, status: "submitted" });
      toast.push(t("coding.submitted"));
    } catch (error) {
      console.error("Unable to submit coding project:", error);
      if (storagePath) await getSupabase().storage.from(ASSIGNMENT_BUCKET).remove([storagePath]);
      setOutput(error instanceof Error ? error.message : t("assignments.detail.submitError"));
    } finally {
      setAssignmentBusy(false);
    }
  }

  const languageLabel = (id: LanguageId) => t(`coding.language.${id}` as never);

  return (
    <div className="space-y-6">
      {assignmentId && (
        <Card><CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">{t("coding.assignmentTitle", { title: assignmentTitle || assignment?.title || "" })}</p>
            {displayName && <p className="mt-1 text-sm text-cova-mute">{t("coding.owner", { name: displayName })}</p>}
          </div>
          {assignmentLoading ? <Badge tone="outline">{t("assignments.loading")}</Badge> : assignmentError ? <p role="alert" className="text-sm text-red-700">{t("coding.assignmentUnavailable")}</p> : submission?.status === "submitted" || submission?.status === "graded" ? <Badge tone="soft">{t("assignments.status.submitted")}</Badge> : submissionWindowOpen ? <Badge tone="outline">{submission?.status === "in_progress" ? t("assignments.status.in-progress") : t("coding.startAssignment")}</Badge> : <Badge tone="outline">{t("assignments.deadlinePassed")}</Badge>}
        </CardBody></Card>
      )}

      {!language && !jupyterOpen && <PageHeader title={t("nav.coding")} description={t("coding.pageDescription")} />}

      {!language && !jupyterOpen && <section aria-labelledby="coding-languages" className="space-y-3">
        <div className="flex items-center gap-2"><Code2 className="h-5 w-5" aria-hidden="true" /><h2 id="coding-languages" className="text-lg font-semibold">{language ? t("coding.workspace") : t("coding.languages")}</h2></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {LANGUAGES.map((item, index) => (
            <button key={item.id} type="button" onClick={() => chooseLanguage(item.id)} aria-pressed={languageId === item.id} className={`min-h-28 rounded-xl border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-cova-soft hover:shadow-sm ${languageId === item.id ? "border-cova-soft ring-2 ring-cova-soft" : "border-cova-line"}`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cova-pale font-mono text-sm font-bold text-cova-ink">{item.id === "typescript" ? "TS" : item.id === "javascript" ? "JS" : item.id === "csharp" ? "C#" : item.id === "cpp" ? "C++" : item.id.toUpperCase().slice(0, 2)}</span>
              <span className="mt-3 block font-semibold">{languageLabel(item.id)}</span>
              <span className="mt-1 block font-mono text-xs text-cova-mute">.{item.extension}</span>
              <span className="mt-2 block text-[11px] text-cova-mute">{item.runtime === "external" ? t("coding.externalRuntime") : t("coding.runtimeAvailable")}</span>
              <span className="sr-only">{index + 1}</span>
            </button>
          ))}
          <button type="button" onClick={() => setJupyterOpen(true)} className="min-h-28 rounded-xl border border-cova-line bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-cova-soft hover:shadow-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cova-pale font-mono text-sm font-bold text-cova-ink">Jp</span>
            <span className="mt-3 block font-semibold">Jupyter Notebook</span>
            <span className="mt-1 block font-mono text-xs text-cova-mute">.ipynb</span>
            <span className="mt-2 block text-[11px] text-cova-mute">{t("coding.jupyterTileDescription")}</span>
          </button>
        </div>
      </section>}

      {jupyterOpen && <JupyterNotebook onBack={() => setJupyterOpen(false)} />}

      {language && languageId && (
        <Card><CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => { setLanguageId(null); setOutput(""); setPreviewHtml(""); }}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("coding.backToLanguages")}</Button>
              <h3 className="text-lg font-semibold">{languageLabel(languageId)}</h3>
              {language.runtime === "external" ? <Badge tone="outline">{t("coding.externalRuntime")}</Badge> : <Badge tone="soft">{t("coding.runtimeAvailable")}</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              <input type="file" multiple onChange={(event) => void importLocalFiles(event)} aria-label={t("coding.openFiles")} className="hidden" id="coding-open-files" />
              <Button size="sm" variant="secondary" onClick={() => document.getElementById("coding-open-files")?.click()}><FolderOpen className="h-4 w-4" aria-hidden="true" />{t("coding.openFiles")}</Button>
              <Button size="sm" variant="secondary" onClick={() => void saveProjectLocally()}><Save className="h-4 w-4" aria-hidden="true" />{t("coding.saveLocal")}</Button>
              <Button size="sm" onClick={() => void runCode()} disabled={running}><Play className="h-4 w-4" aria-hidden="true" />{running ? t("coding.running") : t("coding.run")}</Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="space-y-3 rounded-xl border border-cova-line bg-cova-bg p-3">
              <label className="block text-xs font-medium text-cova-mute" htmlFor="coding-project-name">{t("coding.project")}</label>
              <input id="coding-project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} className="h-9 w-full rounded-lg border border-cova-line bg-white px-2 text-sm" />
              <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-cova-mute">{t("coding.files")}</h4>
              <ul className="space-y-1">{Object.keys(languageFiles).map((name) => <li key={name}><button type="button" onClick={() => setActiveFile(name)} className={`w-full truncate rounded-md px-2 py-1.5 text-left font-mono text-xs ${name === activeFile ? "bg-cova-pale font-semibold" : "hover:bg-white"}`}>{name}</button></li>)}</ul>
              <div className="flex gap-1"><input value={newFileName} onChange={(event) => setNewFileName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addFile(); } }} placeholder={t("coding.newFilePlaceholder")} className="h-8 min-w-0 flex-1 rounded-md border border-cova-line bg-white px-2 text-xs" /><Button size="sm" variant="ghost" onClick={addFile} aria-label={t("coding.newFile")}><FilePlus2 className="h-4 w-4" aria-hidden="true" /></Button></div>
              {assignmentId && displayName && <p className="border-t border-cova-line pt-3 text-xs text-cova-mute">{t("coding.owner", { name: displayName })}</p>}
            </aside>

            <div className="min-w-0 overflow-hidden rounded-xl border border-cova-line bg-white">
              <div className="flex items-center justify-between border-b border-cova-line bg-cova-pale px-3 py-2"><span className="font-mono text-xs">{activeFile || `main.${language.extension}`}</span><Button size="sm" variant="ghost" onClick={() => { const initial = language.files[activeFile]; if (initial !== undefined) updateCode(initial); else updateCode(""); setOutput(""); }}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{t("coding.reset")}</Button></div>
              <div className="flex max-h-[34rem] min-h-80 overflow-auto">
                <div aria-hidden="true" className="select-none border-r border-cova-line bg-cova-bg px-3 py-3 text-right font-mono text-xs leading-6 text-cova-mute">{(code || " ").split("\n").map((_, index) => <div key={index}>{index + 1}</div>)}</div>
                <textarea aria-label={`${languageLabel(languageId)} code editor`} spellCheck={false} value={code} onChange={(event) => updateCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Tab") { event.preventDefault(); const element = event.currentTarget; const start = element.selectionStart; const end = element.selectionEnd; updateCode(`${code.slice(0, start)}  ${code.slice(end)}`); requestAnimationFrame(() => { element.selectionStart = element.selectionEnd = start + 2; }); } }} className="min-w-0 flex-1 resize-none bg-white px-3 py-3 font-mono text-sm leading-6 text-cova-ink outline-none" />
              </div>
            </div>
          </div>

          {language.runtime === "external" && <p className="rounded-lg bg-cova-pale px-3 py-2 text-xs text-cova-ink">{t("coding.externalNotice")}</p>}
          {languageId !== "html" && languageId !== "css" && <div><label htmlFor="coding-stdin" className="mb-1.5 block text-sm font-medium">{t("coding.stdin")}</label><textarea id="coding-stdin" value={standardInput} onChange={(event) => setStandardInput(event.target.value)} rows={2} className="w-full rounded-lg border border-cova-line bg-white px-3 py-2 font-mono text-sm" /></div>}

          {previewHtml && <section><h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Terminal className="h-4 w-4" aria-hidden="true" />{t("coding.preview")}</h4><iframe title={t("coding.preview")} sandbox="" srcDoc={previewHtml} className="h-80 w-full rounded-xl border border-cova-line bg-white" /></section>}
          {(output || running) && <section><h4 className="mb-2 text-sm font-semibold">{t("coding.output")}</h4><pre aria-live="polite" className="min-h-24 whitespace-pre-wrap rounded-xl border border-cova-line bg-slate-950 p-4 font-mono text-sm text-slate-100">{output || t("coding.running")}</pre></section>}
          {assignmentId && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cova-line pt-4"><p className="text-sm text-cova-mute">{assignmentError ? t("coding.assignmentUnavailable") : t("coding.assignmentTitle", { title: assignment?.title || assignmentTitle || "" })}</p>{submission?.status === "in_progress" ? <Button onClick={() => void submitProject()} disabled={assignmentBusy || !submissionWindowOpen}><Send className="h-4 w-4" aria-hidden="true" />{t("coding.submitProject")}</Button> : submission?.status === "submitted" || submission?.status === "graded" ? <Badge tone="soft">{t("assignments.status.submitted")}</Badge> : <Button onClick={() => void startAssignment()} disabled={assignmentBusy || assignmentLoading || !submissionWindowOpen}>{t("coding.startAssignment")}</Button>}</div>}
        </CardBody></Card>
      )}
    </div>
  );
}
