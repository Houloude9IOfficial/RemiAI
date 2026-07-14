#!/usr/bin/env node

/**
 * Text Analysis CLI Tool
 * Counts words, characters, and analyzes word frequency in text files
 */

const fs = require('fs');
const path = require('path');

function analyzeText(text) {
    // Character count (including spaces and newlines)
    const charCount = text.length;
    
    // Character count (excluding whitespace)
    const charCountNoSpace = text.replace(/\s/g, '').length;
    
    // Word count - split by whitespace
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    
    // Line count
    const lines = text.split('\n');
    const lineCount = lines.length;
    
    // Word frequency analysis
    const wordFreq = {};
    words.forEach(word => {
        // Normalize: lowercase and remove punctuation
        const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalized.length > 0) {
            wordFreq[normalized] = (wordFreq[normalized] || 0) + 1;
        }
    });
    
    // Sort by frequency (descending)
    const sortedFreq = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20); // Top 20 words
    
    return {
        charCount,
        charCountNoSpace,
        wordCount,
        lineCount,
        topWords: sortedFreq
    };
}

function formatOutput(analysis, filename) {
    let output = `\n=== Text Analysis: ${filename} ===`;
    output += `\nCharacters (with spaces): ${analysis.charCount}`;
    output += `\nCharacters (no spaces): ${analysis.charCountNoSpace}`;
    output += `\nWords: ${analysis.wordCount}`;
    output += `\nLines: ${analysis.lineCount}`;
    output += `\n\n--- Top 20 Most Frequent Words ---`;
    
    analysis.topWords.forEach(([word, count], index) => {
        output += `\n${index + 1}. ${word}: ${count}`;
    });
    
    return output;
}

function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node cli.js <file-path> [options]');
        console.log('Options:');
        console.log('  --json    Output as JSON');
        console.log('  --top N   Show top N words (default: 20)');
        process.exit(1);
    }
    
    const filePath = args[0];
    const options = {
        json: args.includes('--json'),
        top: 20
    };
    
    // Parse --top N option
    const topIndex = args.indexOf('--top');
    if (topIndex !== -1 && args[topIndex + 1]) {
        options.top = parseInt(args[topIndex + 1], 10) || 20;
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
    }
    
    // Read file
    const text = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);
    
    // Analyze
    const analysis = analyzeText(text);
    
    // Override top words if --top specified
    if (options.top !== 20) {
        // Re-analyze with different top limit
        const words = text.trim().split(/\s+/).filter(word => word.length > 0);
        const wordFreq = {};
        words.forEach(word => {
            const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalized.length > 0) {
                wordFreq[normalized] = (wordFreq[normalized] || 0) + 1;
            }
        });
        analysis.topWords = Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, options.top);
    }
    
    // Output
    if (options.json) {
        console.log(JSON.stringify({ file: filename, ...analysis }, null, 2));
    } else {
        console.log(formatOutput(analysis, filename));
    }
}

if (require.main === module) {
    main();
}

module.exports = { analyzeText, formatOutput };
