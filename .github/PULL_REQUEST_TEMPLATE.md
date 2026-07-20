---
name: Pull Request
about: Submit changes to RemiAI
title: ""
labels: ""
assignees: ""
---

## Description

A clear and concise description of the changes you're making.

Closes #(issue)

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Database migration (schema changes)

## Checklist

- [ ] Code follows existing project conventions and patterns
- [ ] TypeScript compiles without errors (`npm run lint` / TypeScript build passes)
- [ ] ESLint passes (`npm run lint`)
- [ ] Database migrations are included if schema changed
- [ ] New API routes follow the existing route pattern (`app/api/**/route.ts`)
- [ ] New UI components follow existing component conventions (Base UI primitives, `cn()` for classes, dark/light theme support)
- [ ] Error states are handled (loading, empty, error)
- [ ] Framer Motion animations follow existing patterns (if applicable)
- [ ] Changes have been tested locally with `npm run dev`
- [ ] PR description clearly explains the change and motivation

## Screenshots (if applicable)

Add screenshots or screen recordings to help explain your changes, especially for UI changes.

## Testing

Describe how you tested your changes:

- [ ] Ran `npm run dev` and verified end-to-end
- [ ] Tested edge cases (empty state, error state, boundary conditions)
- [ ] Cross-platform tested (if file system changes — Windows/macOS)

## Additional Context

Add any other context about the pull request here.

## Related Issues

List any related issues or PRs here.
