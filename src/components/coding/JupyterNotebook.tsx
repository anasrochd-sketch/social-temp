"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Play, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useI18n } from "@/i18n/client";

type NotebookCell = { id: string; source: string; output: string; running: boolean };
type Compiler = { name: string; language: string; version: string };

const STORAGE_KEY = "cova-jupyter-notebook-v1";
const API = "https://wandbox.org/api";

function downloadNotebook(cells: NotebookCell[]) {
  const notebook = {
    cells: cells.map((cell) => ({
      cell_type: "code",
      execution_count: null,
      metadata: {},
      outputs: [],
      source: cell.source.split("\n").map((line, index, lines) => index < lines.length - 1 ? `${line}\n` : line),
    })),
    metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" }, language_info: { name: "python" } },
    nbformat: 4,
    nbformat_minor: 5,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(notebook, null, 2)], { type: "application/x-ipynb+json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "cova-notebook.ipynb";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function JupyterNotebook({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [cells, setCells] = useState<NotebookCell[]>([{ id: crypto.randomUUID(), source: 'print("Hello from Jupyter")', output: "", running: false }]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Array<Partial<NotebookCell>>;
        if (Array.isArray(parsed) && parsed.length) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time hydration from localStorage, deferred to avoid an SSR hydration mismatch
          setCells(parsed.map((cell) => ({ id: cell.id || crypto.randomUUID(), source: cell.source || "", output: "", running: false })));
        }
      }
    } catch (error) {
      console.warn("Could not restore the local notebook:", error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cells.map(({ id, source }) => ({ id, source }))));
  }, [cells]);

  function addCell() {
    setCells((current) => [...current, { id: crypto.randomUUID(), source: "", output: "", running: false }]);
  }

  function updateSource(id: string, source: string) {
    setCells((current) => current.map((cell) => cell.id === id ? { ...cell, source } : cell));
  }

  function removeCell(id: string) {
    setCells((current) => current.length > 1 ? current.filter((cell) => cell.id !== id) : current.map((cell) => ({ ...cell, source: "", output: "" })));
  }

  async function runCell(index: number) {
    const executable = cells.slice(0, index + 1);
    setCells((current) => current.map((cell, cellIndex) => cellIndex === index ? { ...cell, running: true, output: "" } : cell));
    try {
      const catalogResponse = await fetch(`${API}/list.json`);
      if (!catalogResponse.ok) throw new Error(t("coding.jupyterCompilerUnavailable"));
      const catalog = await catalogResponse.json() as Compiler[];
      const compiler = catalog.find((item) => item.name === "cpython-3.13.8")
        ?? catalog.find((item) => item.language.toLowerCase() === "python" && !item.name.toLowerCase().includes("head"));
      if (!compiler) throw new Error(t("coding.jupyterCompilerUnavailable"));

      const wrapped = [
        "import contextlib, io",
        "__cova_ns = {}",
        `__cova_cells = ${JSON.stringify(executable.map((cell) => cell.source))}`,
        "for __cova_index, __cova_source in enumerate(__cova_cells):",
        "    __cova_target = __cova_index == len(__cova_cells) - 1",
        "    __cova_buffer = io.StringIO()",
        "    with contextlib.redirect_stdout(__cova_buffer if __cova_target else io.StringIO()), contextlib.redirect_stderr(__cova_buffer if __cova_target else io.StringIO()):",
        "        exec(compile(__cova_source, f'<cell {__cova_index + 1}>', 'exec'), __cova_ns)",
        "    if __cova_target:",
        "        print(__cova_buffer.getvalue(), end='')",
      ].join("\n");
      const response = await fetch(`${API}/compile.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ compiler: compiler.name, code: wrapped, stdin: "", options: "", save: false }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(t("coding.jupyterCompilerUnavailable"));
      const result = await response.json() as { compiler_message?: string; compiler_output?: string; program_message?: string; program_output?: string; status?: string | number };
      const output = [result.compiler_message || result.compiler_output, result.program_message || result.program_output]
        .filter((line): line is string => Boolean(line?.trim())).join("\n\n");
      if (result.status !== undefined && String(result.status) !== "0") throw new Error(output || `Exit status: ${result.status}`);
      setCells((current) => current.map((cell, cellIndex) => cellIndex === index ? { ...cell, running: false, output: output || t("coding.jupyterNoOutput") } : cell));
    } catch (error) {
      const message = error instanceof Error && error.name === "TimeoutError" ? t("coding.jupyterTimeout") : error instanceof Error ? error.message : t("coding.jupyterCompilerUnavailable");
      setCells((current) => current.map((cell, cellIndex) => cellIndex === index ? { ...cell, running: false, output: message } : cell));
    }
  }

  return (
    <Card><CardBody className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("coding.backToLanguages")}</Button>
          <h2 className="text-lg font-semibold">Jupyter Notebook</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={addCell}><Plus className="h-4 w-4" aria-hidden="true" />{t("coding.jupyterAddCell")}</Button>
          <Button size="sm" variant="secondary" onClick={() => downloadNotebook(cells)}><Save className="h-4 w-4" aria-hidden="true" />{t("coding.jupyterDownload")}</Button>
        </div>
      </div>
      <p className="rounded-lg bg-cova-pale px-3 py-2 text-xs text-cova-ink">{t("coding.jupyterNotice")}</p>
      <div className="space-y-4">
        {cells.map((cell, index) => (
          <section key={cell.id} className="overflow-hidden rounded-xl border border-cova-line bg-white">
            <div className="flex items-center justify-between border-b border-cova-line bg-cova-pale px-3 py-2">
              <span className="font-mono text-xs">In [{index + 1}]</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void runCell(index)} disabled={cells.some((item) => item.running)}><Play className="h-3.5 w-3.5" aria-hidden="true" />{cell.running ? t("coding.running") : t("coding.jupyterRunCell")}</Button>
                <Button size="sm" variant="ghost" onClick={() => removeCell(cell.id)} aria-label={t("coding.jupyterDeleteCell")}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
            </div>
            <textarea aria-label={`${t("coding.jupyterCell")} ${index + 1}`} spellCheck={false} value={cell.source} onChange={(event) => updateSource(cell.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Tab") { event.preventDefault(); const target = event.currentTarget; const start = target.selectionStart; const end = target.selectionEnd; updateSource(cell.id, `${cell.source.slice(0, start)}    ${cell.source.slice(end)}`); requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 4; }); } }} rows={Math.max(3, cell.source.split("\n").length)} className="w-full resize-y bg-white px-4 py-3 font-mono text-sm leading-6 outline-none" />
            {cell.output && <pre aria-live="polite" className="border-t border-cova-line bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100">{cell.output}</pre>}
          </section>
        ))}
      </div>
      <Button variant="secondary" onClick={addCell}><Plus className="h-4 w-4" aria-hidden="true" />{t("coding.jupyterAddCell")}</Button>
    </CardBody></Card>
  );
}
