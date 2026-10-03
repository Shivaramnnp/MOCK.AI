/**
 * Web Document Semantic Chunker
 * Partitions structured sections and paragraph groups into bounded semantic windows.
 * Preserves heading hierarchies, tables, and lists atomically without arbitrary character slicing.
 */

import { WebContentBlock, WebDocumentIR, WebListBlock, WebSection, WebSemanticChunk, WebTableBlock } from './types';

const DEFAULT_CHUNK_MAX_WORDS = 1000;
const MIN_CHUNK_WORDS = 150;

/**
 * Chunks a WebDocumentIR into bounded semantic units suitable for focused LLM generation.
 */
export function chunkWebDocument(
  doc: WebDocumentIR,
  maxWordsPerChunk: number = DEFAULT_CHUNK_MAX_WORDS
): WebSemanticChunk[] {
  if (!doc.sections || doc.sections.length === 0) {
    return [];
  }

  const chunks: WebSemanticChunk[] = [];
  let currentChunkBlocks: WebContentBlock[] = [];
  let currentHeadingPath: string[] = [];
  let currentSectionTitle = doc.metadata.title;
  let currentWordCount = 0;
  let currentTables: WebTableBlock[] = [];
  let currentLists: WebListBlock[] = [];

  function flushChunk() {
    if (currentChunkBlocks.length === 0) return;

    const chunkText = currentChunkBlocks
      .map((b) => {
        if (b.type === 'heading') return `### ${b.text}`;
        if (b.type === 'paragraph') return b.text;
        if (b.type === 'list') return b.items.map((i) => `* ${i}`).join('\n');
        if (b.type === 'table') {
          return `${b.headers.join(' | ')}\n${b.rows.map((r) => r.join(' | ')).join('\n')}`;
        }
        if (b.type === 'code') return b.code;
        if (b.type === 'quote') return `> ${b.text}`;
        return '';
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const wordCount = chunkText.split(/\s+/).filter(Boolean).length;
    if (wordCount < 10 && chunks.length > 0) {
      // Append small residual to previous chunk
      const prev = chunks[chunks.length - 1];
      prev.blocks.push(...currentChunkBlocks);
      prev.text += `\n\n${chunkText}`;
      prev.wordCount += wordCount;
      prev.tokenCountApprox = Math.round(prev.wordCount * 1.3);
      prev.tables.push(...currentTables);
      prev.lists.push(...currentLists);
    } else {
      chunks.push({
        chunkIndex: chunks.length + 1,
        sectionTitle: currentSectionTitle,
        headingPath: [...currentHeadingPath],
        blocks: [...currentChunkBlocks],
        text: chunkText,
        wordCount,
        tokenCountApprox: Math.round(wordCount * 1.3),
        tables: [...currentTables],
        lists: [...currentLists],
      });
    }

    currentChunkBlocks = [];
    currentTables = [];
    currentLists = [];
    currentWordCount = 0;
  }

  for (const section of doc.sections) {
    const secWordCount = section.wordCount;

    // Case 1: Section fits neatly into the current chunk
    if (currentWordCount + secWordCount <= maxWordsPerChunk) {
      if (currentChunkBlocks.length === 0) {
        currentSectionTitle = section.heading;
        currentHeadingPath = section.headingPath;
      }
      currentChunkBlocks.push(...section.blocks);
      currentWordCount += secWordCount;

      for (const b of section.blocks) {
        if (b.type === 'table') currentTables.push(b);
        if (b.type === 'list') currentLists.push(b);
      }
      continue;
    }

    // Case 2: Current chunk already has substantial content -> flush it first
    if (currentWordCount >= MIN_CHUNK_WORDS) {
      flushChunk();
    }

    // Case 3: The section itself exceeds maxWordsPerChunk -> partition by paragraph groups
    if (secWordCount > maxWordsPerChunk) {
      currentSectionTitle = section.heading;
      currentHeadingPath = section.headingPath;

      for (const block of section.blocks) {
        const blockWords = getBlockWordCount(block);

        if (currentWordCount + blockWords > maxWordsPerChunk && currentWordCount >= MIN_CHUNK_WORDS) {
          flushChunk();
          currentSectionTitle = section.heading;
          currentHeadingPath = section.headingPath;
        }

        currentChunkBlocks.push(block);
        currentWordCount += blockWords;
        if (block.type === 'table') currentTables.push(block);
        if (block.type === 'list') currentLists.push(block);
      }
      continue;
    }

    // Case 4: Start fresh chunk with this section
    currentSectionTitle = section.heading;
    currentHeadingPath = section.headingPath;
    currentChunkBlocks.push(...section.blocks);
    currentWordCount += secWordCount;

    for (const b of section.blocks) {
      if (b.type === 'table') currentTables.push(b);
      if (b.type === 'list') currentLists.push(b);
    }
  }

  // Flush remaining blocks
  flushChunk();

  // If entire document produced zero chunks, make a fallback chunk from fullCleanText
  if (chunks.length === 0 && doc.fullCleanText.trim().length > 0) {
    const words = doc.fullCleanText.split(/\s+/).filter(Boolean).length;
    chunks.push({
      chunkIndex: 1,
      sectionTitle: doc.metadata.title,
      headingPath: [doc.metadata.title],
      blocks: [{ type: 'paragraph', text: doc.fullCleanText }],
      text: doc.fullCleanText,
      wordCount: words,
      tokenCountApprox: Math.round(words * 1.3),
      tables: [],
      lists: [],
    });
  }

  return chunks;
}

function getBlockWordCount(block: WebContentBlock): number {
  if (block.type === 'paragraph' || block.type === 'quote') {
    return block.text.split(/\s+/).filter(Boolean).length;
  }
  if (block.type === 'heading') {
    return block.text.split(/\s+/).filter(Boolean).length;
  }
  if (block.type === 'list') {
    return block.items.join(' ').split(/\s+/).filter(Boolean).length;
  }
  if (block.type === 'table') {
    const tableText = `${block.headers.join(' ')} ${block.rows.flat().join(' ')}`;
    return tableText.split(/\s+/).filter(Boolean).length;
  }
  if (block.type === 'code') {
    return block.code.split(/\s+/).filter(Boolean).length;
  }
  return 0;
}
