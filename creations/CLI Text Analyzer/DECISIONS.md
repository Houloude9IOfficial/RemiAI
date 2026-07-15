# DECISIONS.md - Decision Log

## Project Selection (Phase 0)

**Decision**: Build a CLI Text Analyzer tool using Node.js
**Rationale**: 
- Small, focused, completable in one session
- Uses only Node.js standard library (no dependencies, no auth, no external services)
- Clear done criteria: CLI takes text file, outputs word count, char count, frequent words
- Self-verifiable by running against sample files

**Alternatives considered**:
- JSON to CSV converter - too simple, limited utility
- Log file parser - requires sample logs, more complex parsing
- File organizer - requires file system operations that could be risky
- **Chosen: Text Analyzer** - right balance of simplicity and usefulness

## Architecture Decisions

**Decision**: Single-file CLI (cli.js) with all logic inline
**Rationale**: Project is small enough that separation into modules adds complexity without benefit. All logic in one file keeps it portable and simple.

**Decision**: Use only Node.js built-in modules (fs, path, process)
**Rationale**: Requirement states "no paid APIs, no accounts, no external services requiring credentials". Zero dependencies means instant setup and no supply chain risk.

**Decision**: Word frequency normalization - lowercase, strip punctuation
**Rationale**: "The" and "the" should count as same word. Punctuation like "word," and "word" should count together. This is standard text analysis practice.

**Decision**: Default top 20 words, customizable with --top N
**Rationale**: 20 is a reasonable default for quick overview. --top allows flexibility without complicating UI.

**Decision**: JSON output with --json flag
**Rationale**: Enables programmatic use (piping to jq, other tools). Machine-readable format is standard CLI practice.

## Implementation Decisions

**Decision**: Synchronous file reading (fs.readFileSync)
**Rationale**: CLI tool, single file, blocking is fine. Async adds complexity (async/await or callbacks) for no benefit here.

**Decision**: Error handling with try/catch and process.exit(1)
**Rationale**: Standard CLI behavior - non-zero exit on error, error message to stderr.

**Decision**: Help text shown when no arguments provided
**Rationale**: Standard CLI UX - running without args shows usage.

## Testing Decisions

**Decision**: Three sample text files with different characteristics
- sample1.txt: Short, repeated words for clear frequency testing
- sample2.txt: Longer lorem ipsum for realistic text
- sample3.txt: Heavy repetition for edge case testing

**Decision**: Manual verification via Python test script
**Rationale**: Project scope too small for formal test framework. Direct execution verification is sufficient.

**Decision**: Test all CLI flags (--json, --top N, default)
**Rationale**: Each flag represents a distinct code path that must work.

## Documentation Decisions

**Decision**: Comprehensive README with examples
**Rationale**: CLI tools need clear usage docs. Examples for each flag combination.

**Decision**: PROJECT.md with final status summary
**Rationale**: Required by project spec for Phase 3 closeout.

**Decision**: DECISIONS.md capturing all judgment calls
**Rationale**: Required by project spec. Creates audit trail of why choices were made.

## Scope Decisions (What's Explicitly Out of Scope)

- No support for multiple input files
- No stdin support (only file path argument)
- No character encoding options (assumes UTF-8)
- No streaming/chunked processing for large files
- No word filtering (stop words, minimum length, etc.)
- No output formatting options beyond --json and --top
- No configuration file
- No progress indicator
- No parallel processing

These were consciously excluded to keep the project small and completable in one session.
