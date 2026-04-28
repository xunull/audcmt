# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast, trust your instincts, and ship with confidence — without them, vibe coding is just yolo coding. With tests, it's a superpower.

## Framework

- **Framework**: Vitest v4
- **UI Testing**: @testing-library/react v16
- **Matcher Extension**: @testing-library/jest-dom

## Running Tests

```bash
npm run test      # Run tests in watch mode
npm run test:run  # Run tests once (CI mode)
```

## Test Structure

```
src/
├── components/
│   └── *.test.tsx    # Component tests
├── lib/
│   └── *.test.ts     # Utility/service tests
└── test/
    └── setup.ts      # Global test setup
```

## Test Layers

- **Unit tests**: Pure functions and utilities in `src/lib/`
- **Component tests**: React components in `src/components/`
- **Integration tests**: API routes with mock handlers

## Conventions

- Test files co-located with source: `Component.tsx` → `Component.test.tsx`
- Use `describe` for grouping related tests
- Use clear, descriptive test names that explain what is being tested
- Use `it` for individual test cases
- Assertions should verify behavior, not implementation details
