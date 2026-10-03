import React, { useState } from 'react';
import {
  Type,
  Binary,
  ImageIcon,
  Table as TableIcon,
  Code as CodeIcon,
  List as ListIcon,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Eye,
  Settings,
} from 'lucide-react';
import { CanonicalContentBlock, CanonicalContentBlockType } from '../../types/canonicalQuestion';
import { LatexRenderer } from '../LatexRenderer';

interface ContentBlockEditorProps {
  blocks: CanonicalContentBlock[];
  onChange: (blocks: CanonicalContentBlock[]) => void;
  label?: string;
}

export const ContentBlockEditor: React.FC<ContentBlockEditorProps> = ({
  blocks,
  onChange,
  label = 'Content Blocks (Text, Math, Diagrams, Tables, Code)',
}) => {
  const [activePreviewIndex, setActivePreviewIndex] = useState<number | null>(null);

  const handleUpdateBlock = (index: number, updated: Partial<CanonicalContentBlock>) => {
    const next = [...blocks];
    next[index] = { ...next[index], ...updated };
    onChange(next);
  };

  const handleRemoveBlock = (index: number) => {
    const next = blocks.filter((_, i) => i !== index);
    onChange(next);
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    const next = [...blocks];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    onChange(next);
  };

  const handleAddBlock = (type: CanonicalContentBlockType) => {
    let newBlock: CanonicalContentBlock;

    switch (type) {
      case 'math':
      case 'equation':
        newBlock = {
          type,
          content: 'E = mc^2',
          latex: 'E = mc^2',
        };
        break;
      case 'image':
      case 'diagram':
      case 'graph':
        newBlock = {
          type,
          assetUrl: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format',
          caption: 'Figure: Schematic diagram',
        };
        break;
      case 'table':
        newBlock = {
          type: 'table',
          headers: ['Parameter', 'Symbol', 'Unit'],
          rows: [
            ['Frequency', 'f', 'Hz'],
            ['Wavelength', '\\lambda', 'm'],
          ],
        };
        break;
      case 'code':
      case 'pseudocode':
        newBlock = {
          type,
          language: 'python',
          content: 'def solve(n):\n    return n * (n + 1) // 2',
        };
        break;
      case 'list':
        newBlock = {
          type: 'list',
          headers: ['Property 1', 'Property 2', 'Property 3'],
        };
        break;
      default:
        newBlock = {
          type: 'text',
          content: '',
        };
        break;
    }

    onChange([...blocks, newBlock]);
  };

  // Table manipulation helpers
  const handleAddTableRow = (blockIndex: number) => {
    const block = blocks[blockIndex];
    const colCount = block.headers?.length || 2;
    const newRow = Array(colCount).fill('');
    const rows = [...(block.rows || []), newRow];
    handleUpdateBlock(blockIndex, { rows });
  };

  const handleAddTableCol = (blockIndex: number) => {
    const block = blocks[blockIndex];
    const headers = [...(block.headers || ['Col 1']), `Col ${(block.headers?.length || 1) + 1}`];
    const rows = (block.rows || []).map((r) => [...r, '']);
    handleUpdateBlock(blockIndex, { headers, rows });
  };

  const handleUpdateTableCell = (
    blockIndex: number,
    rowIndex: number,
    colIndex: number,
    value: string
  ) => {
    const block = blocks[blockIndex];
    const rows = (block.rows || []).map((r, rIdx) => {
      if (rIdx !== rowIndex) return r;
      const copy = [...r];
      copy[colIndex] = value;
      return copy;
    });
    handleUpdateBlock(blockIndex, { rows });
  };

  const handleUpdateTableHeader = (blockIndex: number, colIndex: number, value: string) => {
    const block = blocks[blockIndex];
    const headers = [...(block.headers || [])];
    headers[colIndex] = value;
    handleUpdateBlock(blockIndex, { headers });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-surface-muted dark:text-darkSurface-muted uppercase tracking-wider">
          {label}
        </label>
        <span className="text-[11px] text-surface-muted">
          {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
        </span>
      </div>

      {/* Blocks List */}
      <div className="space-y-3">
        {blocks.map((block, bIdx) => {
          const isPreviewing = activePreviewIndex === bIdx;

          return (
            <div
              key={bIdx}
              className="p-3.5 rounded-2xl border border-surface-border dark:border-darkSurface-border bg-surface-elev2/60 dark:bg-darkSurface-elev2/60 space-y-2.5 transition-all"
            >
              {/* Block Header Toolbar */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-surface-border/60 dark:border-darkSurface-border/60">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                    {block.type}
                  </span>
                  <span className="text-xs text-surface-muted">Block #{bIdx + 1}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActivePreviewIndex(isPreviewing ? null : bIdx)}
                    className={`p-1 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                      isPreviewing
                        ? 'bg-brand-primary/20 text-brand-primary'
                        : 'text-surface-muted hover:text-surface-text'
                    }`}
                    title="Toggle live render preview"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="text-[10px]">Preview</span>
                  </button>

                  {bIdx > 0 && (
                    <button
                      type="button"
                      onClick={() => handleMoveBlock(bIdx, 'up')}
                      className="p-1 rounded-lg text-surface-muted hover:text-surface-text"
                      title="Move up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {bIdx < blocks.length - 1 && (
                    <button
                      type="button"
                      onClick={() => handleMoveBlock(bIdx, 'down')}
                      className="p-1 rounded-lg text-surface-muted hover:text-surface-text"
                      title="Move down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveBlock(bIdx)}
                    className="p-1 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-500/10"
                    title="Delete block"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Block Body Editor */}
              {isPreviewing ? (
                <div className="p-3 rounded-xl bg-white dark:bg-darkSurface-elev1 border border-surface-border dark:border-darkSurface-border">
                  {block.type === 'text' && (
                    <p className="text-xs text-surface-text dark:text-darkSurface-text">
                      <LatexRenderer content={block.content || '(Empty text)'} />
                    </p>
                  )}
                  {(block.type === 'math' || block.type === 'equation') && (
                    <div className="py-2 text-center">
                      <LatexRenderer content={`$$${block.latex || block.content || ''}$$`} />
                    </div>
                  )}
                  {(block.type === 'image' || block.type === 'diagram' || block.type === 'graph') && (
                    <div className="flex flex-col items-center">
                      <img
                        src={block.assetUrl}
                        alt={block.caption || 'Asset'}
                        className="max-h-48 rounded-lg object-contain border border-surface-border"
                      />
                      {block.caption && (
                        <p className="text-[11px] text-surface-muted mt-1 italic">{block.caption}</p>
                      )}
                    </div>
                  )}
                  {block.type === 'table' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse border border-surface-border dark:border-darkSurface-border">
                        <thead>
                          <tr className="bg-surface-elev2 dark:bg-darkSurface-elev2">
                            {block.headers?.map((h, i) => (
                              <th key={i} className="border border-surface-border p-2 text-left font-bold">
                                <LatexRenderer content={h} />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {block.rows?.map((row, rIdx) => (
                            <tr key={rIdx}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="border border-surface-border p-2">
                                  <LatexRenderer content={cell} />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {(block.type === 'code' || block.type === 'pseudocode') && (
                    <pre className="p-3 rounded-lg bg-black text-emerald-400 font-mono text-xs overflow-x-auto">
                      <code>{block.content}</code>
                    </pre>
                  )}
                  {block.type === 'list' && (
                    <ul className="list-disc pl-5 text-xs space-y-1">
                      {block.headers?.map((item, idx) => (
                        <li key={idx}>
                          <LatexRenderer content={item} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div>
                  {/* TEXT BLOCK */}
                  {block.type === 'text' && (
                    <textarea
                      rows={3}
                      value={block.content || ''}
                      onChange={(e) => handleUpdateBlock(bIdx, { content: e.target.value })}
                      placeholder="Enter question text or description (LaTeX math $...$ supported)..."
                      className="w-full p-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary resize-none font-mono"
                    />
                  )}

                  {/* MATH / EQUATION BLOCK */}
                  {(block.type === 'math' || block.type === 'equation') && (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={block.latex || block.content || ''}
                        onChange={(e) =>
                          handleUpdateBlock(bIdx, { latex: e.target.value, content: e.target.value })
                        }
                        placeholder="e.g. \int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}"
                        className="w-full p-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs font-mono text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                      />
                      <div className="p-2 rounded-lg bg-black/5 dark:bg-white/5 text-center text-xs">
                        <LatexRenderer content={`$$${block.latex || block.content || ''}$$`} />
                      </div>
                    </div>
                  )}

                  {/* IMAGE / DIAGRAM / GRAPH BLOCK */}
                  {(block.type === 'image' || block.type === 'diagram' || block.type === 'graph') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-surface-muted uppercase">Image URL:</label>
                        <input
                          type="text"
                          value={block.assetUrl || ''}
                          onChange={(e) => handleUpdateBlock(bIdx, { assetUrl: e.target.value })}
                          placeholder="https://... or data:image/..."
                          className="w-full p-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-surface-muted uppercase">Caption:</label>
                        <input
                          type="text"
                          value={block.caption || ''}
                          onChange={(e) => handleUpdateBlock(bIdx, { caption: e.target.value })}
                          placeholder="e.g. Figure 1: Circuit diagram"
                          className="w-full p-2 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                        />
                      </div>
                    </div>
                  )}

                  {/* TABLE BLOCK */}
                  {block.type === 'table' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddTableRow(bIdx)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-elev3 dark:bg-darkSurface-elev3 text-[11px] font-semibold text-surface-text dark:text-darkSurface-text hover:bg-brand-primary/20"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Row</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddTableCol(bIdx)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-elev3 dark:bg-darkSurface-elev3 text-[11px] font-semibold text-surface-text dark:text-darkSurface-text hover:bg-brand-primary/20"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Column</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto border border-surface-border rounded-xl">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-surface-elev2 dark:bg-darkSurface-elev2">
                              {block.headers?.map((h, cIdx) => (
                                <th key={cIdx} className="p-1 border-r border-b border-surface-border">
                                  <input
                                    type="text"
                                    value={h}
                                    onChange={(e) =>
                                      handleUpdateTableHeader(bIdx, cIdx, e.target.value)
                                    }
                                    className="w-full p-1 bg-transparent font-bold focus:outline-none focus:bg-white dark:focus:bg-darkSurface-elev1"
                                  />
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.rows?.map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-1 border-r border-b border-surface-border">
                                    <input
                                      type="text"
                                      value={cell}
                                      onChange={(e) =>
                                        handleUpdateTableCell(bIdx, rIdx, cIdx, e.target.value)
                                      }
                                      className="w-full p-1 bg-transparent focus:outline-none focus:bg-white dark:focus:bg-darkSurface-elev1"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* CODE / PSEUDOCODE BLOCK */}
                  {(block.type === 'code' || block.type === 'pseudocode') && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-surface-muted uppercase">
                          Language:
                        </label>
                        <select
                          value={block.language || 'python'}
                          onChange={(e) => handleUpdateBlock(bIdx, { language: e.target.value })}
                          className="px-2 py-1 rounded-lg text-xs border border-surface-border bg-white dark:bg-darkSurface-elev1 text-surface-text dark:text-darkSurface-text"
                        >
                          <option value="python">Python</option>
                          <option value="c">C</option>
                          <option value="cpp">C++</option>
                          <option value="java">Java</option>
                          <option value="sql">SQL</option>
                          <option value="pseudocode">Pseudocode</option>
                        </select>
                      </div>
                      <textarea
                        rows={4}
                        value={block.content || ''}
                        onChange={(e) => handleUpdateBlock(bIdx, { content: e.target.value })}
                        placeholder="Write code snippet here..."
                        className="w-full p-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-black text-emerald-400 font-mono text-xs focus:outline-none focus:border-brand-primary resize-none"
                      />
                    </div>
                  )}

                  {/* LIST BLOCK */}
                  {block.type === 'list' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-surface-muted uppercase">
                        List Items (Comma separated or one per line):
                      </label>
                      <textarea
                        rows={3}
                        value={block.headers?.join('\n') || ''}
                        onChange={(e) =>
                          handleUpdateBlock(bIdx, {
                            headers: e.target.value.split('\n').filter((l) => l.trim().length > 0),
                          })
                        }
                        placeholder="Item 1&#10;Item 2&#10;Item 3"
                        className="w-full p-2.5 rounded-xl border border-surface-border dark:border-darkSurface-border bg-white dark:bg-darkSurface-elev1 text-xs text-surface-text dark:text-darkSurface-text focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Block Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => handleAddBlock('text')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border text-xs font-semibold text-surface-text dark:text-darkSurface-text hover:bg-brand-primary/10 hover:border-brand-primary/40 transition-colors"
        >
          <Type className="w-3.5 h-3.5 text-blue-400" />
          <span>+ Text</span>
        </button>
        <button
          type="button"
          onClick={() => handleAddBlock('equation')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border text-xs font-semibold text-surface-text dark:text-darkSurface-text hover:bg-brand-primary/10 hover:border-brand-primary/40 transition-colors"
        >
          <Binary className="w-3.5 h-3.5 text-purple-400" />
          <span>+ Math / Equation</span>
        </button>
        <button
          type="button"
          onClick={() => handleAddBlock('diagram')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border text-xs font-semibold text-surface-text dark:text-darkSurface-text hover:bg-brand-primary/10 hover:border-brand-primary/40 transition-colors"
        >
          <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
          <span>+ Image / Diagram</span>
        </button>
        <button
          type="button"
          onClick={() => handleAddBlock('table')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border text-xs font-semibold text-surface-text dark:text-darkSurface-text hover:bg-brand-primary/10 hover:border-brand-primary/40 transition-colors"
        >
          <TableIcon className="w-3.5 h-3.5 text-teal-400" />
          <span>+ Table</span>
        </button>
        <button
          type="button"
          onClick={() => handleAddBlock('code')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border text-xs font-semibold text-surface-text dark:text-darkSurface-text hover:bg-brand-primary/10 hover:border-brand-primary/40 transition-colors"
        >
          <CodeIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span>+ Code</span>
        </button>
        <button
          type="button"
          onClick={() => handleAddBlock('list')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elev2 dark:bg-darkSurface-elev2 border border-surface-border text-xs font-semibold text-surface-text dark:text-darkSurface-text hover:bg-brand-primary/10 hover:border-brand-primary/40 transition-colors"
        >
          <ListIcon className="w-3.5 h-3.5 text-pink-400" />
          <span>+ List</span>
        </button>
      </div>
    </div>
  );
};
