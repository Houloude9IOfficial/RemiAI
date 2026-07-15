# Text Analysis CLI Tool

A simple Node.js command-line tool for analyzing text files. Counts words, characters, lines, and provides word frequency analysis.

## Features

- **Character count** - With and without spaces
- **Word count** - Total words in the file
- **Line count** - Number of lines
- **Word frequency analysis** - Top N most frequent words (default: 20)
- **JSON output** - Machine-readable output option
- **Customizable top words** - Show top N words with `--top N`

## Installation

```bash
# No installation needed - just run with Node.js
# Make sure you have Node.js installed (v14+)
node --version
```

## Usage

```bash
# Basic usage
node cli.js <file-path>

# Output as JSON
node cli.js <file-path> --json

# Show top N words (default is 20)
node cli.js <file-path> --top 10

# Combine options
node cli.js <file-path> --json --top 5
```

### Options

| Option | Description |
|--------|-------------|
| `<file-path>` | Path to the text file to analyze (required) |
| `--json` | Output results as JSON instead of formatted text |
| `--top N` | Show top N most frequent words (default: 20) |

## Examples

### Example 1: Basic Analysis
```bash
node cli.js sample1.txt
```

Output:
```
=== Text Analysis: sample1.txt ===
Characters (with spaces): 200
Characters (no spaces): 164
Words: 37
Lines: 4

--- Top 20 Most Frequent Words ---
1. the: 4
2. quick: 3
3. brown: 3
4. fox: 2
5. is: 2
...
```

### Example 2: JSON Output
```bash
node cli.js sample1.txt --json
```

Output:
```json
{
  "file": "sample1.txt",
  "charCount": 200,
  "charCountNoSpace": 164,
  "wordCount": 37,
  "lineCount": 4,
  "topWords": [
    ["the", 4],
    ["quick", 3],
    ["brown", 3],
    ["fox", 2],
    ["is", 2]
  ]
}
```

### Example 3: Top 5 Words Only
```bash
node cli.js sample2.txt --top 5
```

## Sample Files

The project includes three sample text files for testing:

- `sample1.txt` - Simple text with repeated words
- `sample2.txt` - Lorem ipsum text (longer)
- `sample3.txt` - Short text with heavy word repetition

## Project Structure

```
/
├── cli.js          # Main CLI entry point
├── package.json    # Project configuration
├── sample1.txt     # Sample text file 1
├── sample2.txt     # Sample text file 2
├── sample3.txt     # Sample text file 3
├── README.md       # This file
├── PROJECT.md      # Project documentation
└── DECISIONS.md    # Decision log
```

## Requirements

- Node.js v14 or higher

## How It Works

The tool reads a text file and performs the following analyses:

1. **Character counting** - Counts total characters including whitespace and excluding whitespace
2. **Word counting** - Splits text by whitespace and filters empty strings
3. **Line counting** - Counts newline characters
4. **Word frequency** - Normalizes words (lowercase, removes punctuation), counts occurrences, sorts by frequency

## Development

```bash
# Run tests with sample files
node cli.js sample1.txt
node cli.js sample2.txt --json
node cli.js sample3.txt --top 5
```

## License

MIT
